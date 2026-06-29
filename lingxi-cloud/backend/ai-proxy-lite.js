#!/usr/bin/env node
/**
 * AI 轻量代理服务
 * 
 * 独立部署，只做一件事：转发请求 + Key 池轮询
 * 
 * 启动：node ai-proxy-lite.js --port 13000
 * 
 * API：
 * - GET /health - 健康检查
 * - GET /api/keys - 获取所有 Key 配置
 * - POST /api/keys/:provider - 添加 Key
 * - DELETE /api/keys/:provider/:index - 删除 Key
 * - PUT /api/keys/:provider/:index/toggle - 启用/禁用 Key
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============ 配置 ============

const HOST = process.env.PROXY_LITE_HOST || '0.0.0.0';
const PORT = process.env.PROXY_LITE_PORT || (process.argv.includes('--port') 
  ? process.argv[process.argv.indexOf('--port') + 1] 
  : 13000);

const ADMIN_TOKEN = process.env.PROXY_ADMIN_TOKEN || 'lingxi-admin-2026';

// 配置文件路径
const CONFIG_FILE = join(__dirname, 'data/proxy-keys.json');

// 确保数据目录存在
const DATA_DIR = join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============ Cursor 代理配置 ============
const CURSOR_PROXY_URL = 'http://43.98.167.204/cursor-proxy/v1';
const CURSOR_API_KEY = 'sk-2f5c67ba1c8ea3c5-gsrvvw-a1489a38';

// ============ 9Router 统一路由配置 ============
const ROUTER_URL = process.env.ROUTER_URL || 'http://localhost:20128';
const ROUTER_API_KEY = process.env.ROUTER_API_KEY || '';

function getRouterApiKey() {
  if (ROUTER_API_KEY) return ROUTER_API_KEY;
  const provider = PROVIDERS?.router;
  if (!provider || !provider.keys?.length) return '';
  const enabled = provider.keys.filter(k => k.enabled);
  if (!enabled.length) return '';
  if (!roundRobinIndex.router) roundRobinIndex.router = 0;
  roundRobinIndex.router = (roundRobinIndex.router + 1) % enabled.length;
  return enabled[roundRobinIndex.router].key;
}




var ROUTER_ENABLED_MODELS = null;
function _refreshEnabled() {
  try { var pk = JSON.parse(require('fs').readFileSync('/home/admin/.openclaw/workspace/lingxi-cloud/backend/data/proxy-keys.json','utf-8')); var rc = pk.router || {}; ROUTER_ENABLED_MODELS = rc.enabledModels || null; } catch(_) {}
}
function _isEnabled(model) {
  if (!ROUTER_ENABLED_MODELS) return true;
  return ROUTER_ENABLED_MODELS.indexOf(model) >= 0;
}
_refreshEnabled();
// ============ Lume 智能模型选择 ============
// 当用户请求 model="auto" 时，根据时段/套餐/负载自动选择最佳模型
// 所有用户统一走同一模型列表，不区分 free/pro
const LUME_AUTO_MODELS = {
  free: [
    'bailian/qwen3.7-plus',        // 千问3.7 Plus（首选）
    'glm-cn/glm-5.2',              // GLM-5.2 智谱直连
    'gh/gpt-4o',                   // GitHub Copilot
    'gh/gpt-5-mini',               // 快速
  ],
  pro: [
    'bailian/qwen3.7-plus',        // 千问3.7 Plus（首选）
    'glm-cn/glm-5.2',              // GLM-5.2 智谱直连
    'gh/gpt-4o',                   // GitHub Copilot
    'gh/gpt-5-mini',               // 快速
  ],
};



// 智能选择最佳可用模型（固定顺序，无冷却）
function selectLumeAutoModel(clientIp) {
  _refreshEnabled(); const candidates = LUME_AUTO_MODELS.pro; var model = candidates[0]; for (var i = 0; i < candidates.length; i++) { if (_isEnabled(candidates[i])) { model = candidates[i]; break; } }
  console.log(`[Lume Auto] ${clientIp} → ${model}`);
  return model;
}

// ============ Provider 直连路由表 ============
// 模型前缀 → provider ID（proxy-keys.json 里的 key）
// 匹配到的直接走对应 provider，不经过 9Router
const MODEL_PROVIDER_MAP = {
  'bailian/':            'bailian-token-plan',   // 百炼 Token Plan 直连
  'zhipu/':              'zhipu',                // 智谱直连
  'glm-cn/':             'zhipu',                // glm-cn 也走智谱
  'dmxapi/':             'dmxapi',               // DMXAPI 直连
  'opencode-go/':        'opencode-go',          // OpenCode Go 直连
  'alibaba-cloud/':      'aliyun',               // 阿里百炼 Coding
};

// 9Router 只处理 gh/ cu/ kimi/ 等模型
const OPENCODE_GO_PRIMARY = 'glm-cn/glm-5.2';

const MODEL_MAP_TO_9ROUTER = {
  'auto': null,
};

// 9Router fallback（仅 9Router 模型不可用时降级）
const ROUTER_FALLBACK_MODELS = [
  'gh/gpt-4o',
  'gh/gpt-5-mini',
];

// ============ 模型上下文窗口表 ============
const MODEL_CONTEXT_WINDOWS = {
  'glm-cn/glm-5.2': 200000,
  'bailian/qwen3.7-plus': 128000,
  'bailian/qwen3.6-flash': 128000,
  'gh/gpt-4o':           64000,
  'gh/gpt-4.1':          128000,
  'gh/gpt-5-mini':       64000,
  'gh/gpt-4o-mini':      128000,
  'openrouter/openrouter/free': 32000,
};

// 按 token 大小自动选择合适的模型
// 如果请求估算 token 超过当前模型上下文，自动升级到大上下文模型
const LARGE_CONTEXT_MODELS = [
  { model: 'glm-cn/glm-5.2',      context: 200000 },
  { model: 'bailian/qwen3.7-plus', context: 128000 },
  { model: 'gh/gpt-4o',           context: 128000 },
];

/** 估算请求的 token 数（粗估：中文 1 字 ≈ 1.5 token，英文 1 词 ≈ 1 token） */
function estimateTokens(reqBody) {
  if (!reqBody.messages || !Array.isArray(reqBody.messages)) return 0;
  let totalChars = 0;
  for (const msg of reqBody.messages) {
    if (!msg.content) continue;
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (typeof part.text === 'string') totalChars += part.text.length;
        else if (typeof part.content === 'string') totalChars += part.content.length;
      }
    }
  }
  // 粗估：约 1.5 token/字符（中文为主），加 20% buffer 给 system prompt/工具等
  return Math.ceil(totalChars * 1.5 * 1.2);
}

/** 根据 token 数选择上下文够用的模型 */
function selectModelByTokenCount(estimatedTokens, preferredModel) {
  // 先看偏好模型的上下文够不够
  const preferredCtx = MODEL_CONTEXT_WINDOWS[preferredModel];
  if (preferredCtx && estimatedTokens < preferredCtx * 0.9) {
    return null; // 偏好模型够用，不需要换
  }
  // 按上下文从小到大找第一个够用的
  for (const item of LARGE_CONTEXT_MODELS) {
    if (estimatedTokens < item.context * 0.9) {
      if (item.model !== preferredModel) {
        return item.model;
      }
      return null; // 已经是最合适的了
    }
  }
  // 所有模型都不够，返回最大的
  return LARGE_CONTEXT_MODELS[0].model;
}

// ============ 用户模型偏好 ============
// 从灵犀云数据库加载：IP → userId → preferredModel
// preferredModel 是用户在灵犀云前端选择的模型（如 "gpt-4o"、"glm-5.2"）
const DB_FILE = join(__dirname, 'data/db.json');
let ipUserMap = {};   // { ip: { userId, nickname, preferredModel } }
let userModelMap = {}; // { userId: preferredModel }
const lumeActiveUsers = new Map(); // userId -> expiresAt
const LOCALHOST_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "unknown"]);

function setLumeActiveUser(userId) {
  if (!userId) return;
  lumeActiveUsers.set(userId, Date.now() + 60_000);
}

function resolveUserInfo(req) {
  const headerUserId = req.headers?.["x-lingxi-user-id"] || req.headers?.["X-Lingxi-User-Id"];
  if (headerUserId && userModelMap[headerUserId] !== undefined) {
    return { userId: headerUserId, nickname: headerUserId.slice(0, 8), preferredModel: userModelMap[headerUserId] };
  }
  const clientIp = req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.headers?.["x-real-ip"]
    || req.socket?.remoteAddress
    || "unknown";
  if (LOCALHOST_IPS.has(clientIp)) {
    const now = Date.now();
    for (const [uid, exp] of lumeActiveUsers.entries()) {
      if (exp >= now) {
        return { userId: uid, nickname: uid.slice(0, 8), preferredModel: userModelMap[uid] ?? null };
      }
    }
  }
  return ipUserMap[clientIp] || null;
}


// 用户自有 Key 缓存: { userId: { provider: [keys] } }
let userKeysMap = {};

/** 加载用户自有 API Key */
function loadUserKeys() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const db = JSON.parse(raw);
    userKeysMap = db.userKeys || {};
    const userCount = Object.keys(userKeysMap).length;
    const keyCount = Object.values(userKeysMap).reduce((sum, keys) => sum + Object.keys(keys).length, 0);
    console.log(`[用户Key] 已加载 ${userCount} 个用户, ${keyCount} 个自有 Key`);
  } catch (e) {
    userKeysMap = {};
  }
}

/** 获取用户自有 Key */
function getUserKey(userId, provider) {
  if (!userId || !userKeysMap[userId]) return null;
  const keys = userKeysMap[userId][provider];
  if (!keys || !keys.length) return null;
  const enabled = keys.filter(k => k.enabled !== false);
  return enabled.length > 0 ? enabled[0].key : null;
}

function loadUserPreferences() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const db = JSON.parse(raw);
    const users = db.users || [];
    const servers = db.userServers || [];
    
    const map = {};
    for (const s of servers) {
      if (!s.ip) continue;
      const user = users.find(u => u.id === s.userId);
      map[s.ip] = {
        userId: s.userId,
        nickname: user?.nickname || '?',
        preferredModel: user?.preferredModel || null,  // 用户选择的模型
      };
    }
    ipUserMap = map;
    const umap = {};
    for (const user of users) {
      if (user?.id) umap[user.id] = user.preferredModel ?? null;
    }
    userModelMap = umap;
    console.log(`[用户偏好] 已加载 ${Object.keys(map)} 个 IP-用户映射, ${Object.keys(umap).length} 个 userId 偏好`);
    loadUserKeys();
  } catch (e) {
    console.log('[用户偏好] 加载失败，使用默认路由:', e.message);
  }
}

/** 更新用户模型偏好（前端调用） */
function updateUserModelPreference(userId, model) {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const db = JSON.parse(raw);
    if (!db.users) db.users = [];
    const user = db.users.find(u => u.id === userId);
    if (!user) {
      console.warn(`[模型偏好] 用户 ${userId} 不存在`);
      return false;
    }
    user.preferredModel = model || null;  // null 表示 auto
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    
    // 立即刷新内存映射
    loadUserPreferences();
    console.log(`[模型偏好] ✅ 用户 ${userId} (${user.nickname}) → ${model || 'auto'}`);
    return true;
  } catch (e) {
    console.error('[模型偏好] 更新失败:', e.message);
    return false;
  }
}

// 启动时加载 + 每 30 秒刷新
loadUserPreferences();
setInterval(loadUserPreferences, 30000);

/** 将 usage 写入灵犀云 db.json（订阅用户统计） */
async function updateDbWithCredits(userId, model, tokens) {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const db = JSON.parse(raw);
    const user = db.users.find(u => u.id === userId);
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    if (!user.usage) {
      user.usage = { totalTokens: 0, totalRequests: 0, byModel: {}, byDate: {} };
    }
    user.usage.totalTokens += tokens.total || 0;
    user.usage.totalRequests += 1;
    if (!user.usage.byDate[today]) {
      user.usage.byDate[today] = { tokens: 0, requests: 0 };
    }
    user.usage.byDate[today].tokens += tokens.total || 0;
    user.usage.byDate[today].requests += 1;
    if (model) {
      if (!user.usage.byModel[model]) user.usage.byModel[model] = { tokens: 0, requests: 0 };
      user.usage.byModel[model].tokens += tokens.total || 0;
      user.usage.byModel[model].requests += 1;
    }
    user.usage.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    console.log(`📊 [${userId.substring(0, 8)}] +${tokens.total} tokens → 总计 ${user.usage.totalTokens}`);
  } catch (e) {
    console.error('[updateDbWithCredits] 失败:', e.message);
  }
}

// 获取用户偏好的 9Router 模型
function getUserPreferredModel(clientIp, requestedModel, req = null) {
  const userInfo = req ? resolveUserInfo(req) : ipUserMap[clientIp];
  if (!userInfo?.preferredModel) {
    // 没有偏好 → 按请求的模型路由
    return mapTo9RouterModel(requestedModel, clientIp);
  }
  
  // 有偏好 → 用偏好模型路由
  const preferred = userInfo.preferredModel;
  console.log(`[模型偏好] ${clientIp} (${userInfo.nickname}): 请求=${requestedModel} → 偏好=${preferred}`);
  return mapTo9RouterModel(preferred, clientIp);
}

// 将用户模型名映射为 9Router 模型名
// 将模型名映射为实际路由模型
function mapTo9RouterModel(model, clientIp) {
  if (!model) return OPENCODE_GO_PRIMARY;

  // auto → 智能选择
  if (model === 'auto') {
    return selectLumeAutoModel(clientIp || 'unknown');
  }

  // 已经是路径格式，直通
  if (model.startsWith('bailian/') ||
      model.startsWith('zhipu/') ||
      model.startsWith('glm-cn/') ||
      model.startsWith('gh/') ||
      model.startsWith('cu/') ||
      model.startsWith('kimi/') ||
      model.startsWith('openrouter/')) {
    return model;
  }

  // 裸模型名 → 尝试匹配已知前缀
  if (model.startsWith('glm-')) return 'glm-cn/' + model;
  if (model.startsWith('qwen')) return 'bailian/' + model;
  if (model.startsWith('gpt-') || model.startsWith('claude-')) return 'gh/' + model;

  // 兜底
  return OPENCODE_GO_PRIMARY;
}

// 通过 9Router 发送请求（统一路由，支持自动降级免费模型）
async function proxyVia9Router(reqBody, reqUrl, clientIp, res, fallbackIndex = -1) {
  const originalModel = reqBody.model || 'unknown';
  
  // 选择模型：fallbackIndex >= 0 表示已经在降级，用免费模型
  let routerModel;
  if (fallbackIndex >= 0) {
    routerModel = ROUTER_FALLBACK_MODELS[fallbackIndex] || ROUTER_FALLBACK_MODELS[0];
    console.log(`[9Router] 🔄 降级 fallback #${fallbackIndex}: ${originalModel} → ${routerModel} [来源: ${clientIp}]`);
  } else {
    // 查用户模型偏好，如果有偏好则覆盖请求模型
    routerModel = getUserPreferredModel(clientIp, originalModel);
    console.log(`[9Router] 🎯 统一路由: ${originalModel} → ${routerModel} [来源: ${clientIp}]`);
  }
  
  const newBody = { ...reqBody, model: routerModel };
  const targetUrl = new URL('/v1/chat/completions', ROUTER_URL);
  const isStream = reqBody.stream === true;
  
  return new Promise((resolve, reject) => {
    const httpModule = targetUrl.protocol === 'https:' ? https : http;
    
    const proxyReq = httpModule.request({
      hostname: targetUrl.hostname,
      port: targetUrl.port || 80,
      path: targetUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': isStream ? 'text/event-stream' : 'application/json',
        ...(getRouterApiKey() ? { 'Authorization': 'Bearer ' + getRouterApiKey() } : {}),
      },
      timeout: 120000,
    }, (proxyRes) => {
      const statusCode = proxyRes.statusCode;
      
      // 429/5xx/400(模型不可用) → 自动降级到免费模型
      if (!isStream && statusCode !== 200 && (statusCode === 429 || statusCode >= 500 || statusCode === 400)) {
        let errBody = '';
        proxyRes.on('data', chunk => errBody += chunk);
        proxyRes.on('end', () => {
          // 400 中 token 超限 → 标记模型失败并升级到更大上下文模型
          const isTokenOverflow = statusCode === 400 && /model_max_prompt_tokens_exceeded|prompt token count/i.test(errBody);
          if (isTokenOverflow) {
            console.warn(`[9Router] ⚠️ ${routerModel} 上下文不足 (token overflow)，升级模型`);
          }
          const shouldRetry = statusCode === 429 || statusCode >= 500 ||
            (statusCode === 400 && /model_not_supported|not supported|模型不存在|1211|model_max_prompt_tokens_exceeded|prompt token count/i.test(errBody));
          if (!shouldRetry) {
            reject(new Error(`9Router returned ${statusCode}: ${errBody.substring(0, 200)}`));
            return;
          }
          
          const nextFallback = fallbackIndex + 1;
          if (nextFallback < ROUTER_FALLBACK_MODELS.length) {
            console.warn(`[9Router] ⚠️ ${routerModel} 返回 ${statusCode}，降级到免费模型 ${ROUTER_FALLBACK_MODELS[nextFallback]}`);
            resolve({ 
              success: false, 
              status: statusCode, 
              body: errBody, 
              shouldFallback: true, 
              nextFallback,
              routerModel 
            });
          } else {
            console.error(`[9Router] ❌ 所有模型均不可用 (最后尝试: ${routerModel})`);
            reject(new Error(`9Router all models unavailable, last: ${statusCode}`));
          }
        });
        return;
      }
      
      // 429/5xx + 流式 → 无法降级（已经开始写了），只记日志
      if ((statusCode === 429 || statusCode >= 500) && isStream) {
        console.error(`[9Router] ❌ 流式请求 ${routerModel} 返回 ${statusCode}，无法降级`);
      }
      
      if (statusCode !== 200 && !res) {
        let errBody = '';
        proxyRes.on('data', chunk => errBody += chunk);
        proxyRes.on('end', () => {
          reject(new Error(`9Router returned ${statusCode}: ${errBody.substring(0, 200)}`));
        });
        return;
      }
      
      // pipe 到 res（流式或非流式）
      if (res) {
        res.writeHead(statusCode, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json',
          'Cache-Control': 'no-cache',
        });
        proxyRes.pipe(res).on('error', () => { if (!res.writableEnded) res.end(); });
        proxyRes.on('end', () => { if (!res.writableEnded) res.end(); });
        // 流式直接 resolve，不需要收集 body
        if (isStream) {
          proxyRes.on('end', () => resolve({ success: true, status: statusCode, routerModel }));
          return;
        }
      }
      
      // 收集响应体
      let responseBody = '';
      let lastUsage = null;
      proxyRes.on('data', chunk => {
        responseBody += chunk.toString();
        if (isStream) {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try { const d = JSON.parse(line.slice(6)); if (d.usage) lastUsage = d.usage; } catch {}
            }
          }
        }
      });
      proxyRes.on('end', () => {
        resolve({ success: true, status: statusCode, body: responseBody, usage: lastUsage, routerModel });
      });
    });
    
    proxyReq.on('error', (e) => {
      console.error(`[9Router] ❌ 请求失败: ${e.message}`);
      reject(e);
    });
    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      reject(new Error('9Router timeout'));
    });
    
    proxyReq.write(JSON.stringify(newBody));
    proxyReq.end();
  });
}

// 统一路由入口：所有请求都走 9Router，自动降级，最后兜底付费 API
// ============ 多模态（图片）智能路由 ============
// 支持图片输入的模型列表
const VISION_MODELS = new Set([
  'gh/gpt-4o', 'gh/gpt-4.1', 'gh/gpt-5-mini', 'gh/gpt-4o-mini',
  'glm-cn/glm-5.2', 'bailian/qwen3.7-plus', 'gh/gpt-4o',
]);

function isVisionModel(model) {
  if (!model) return false;
  return VISION_MODELS.has(model);
}

function selectVisionModel(clientIp) {
  // 优先用用户偏好的视觉模型，否则用最好的视觉模型
  const userInfo = ipUserMap[clientIp];
  if (userInfo?.preferredModel && isVisionModel(userInfo.preferredModel)) {
    return userInfo.preferredModel;
  }
  // 默认首选 deepseek-v4-pro（支持图片 + 大上下文 128K+）
  // 不再首选 gh/gpt-4o，上下文只有 64K，大请求容易 400
  return 'glm-cn/glm-5.2';
}

function detectImageInRequest(reqBody) {
  // 检测 messages 中是否包含真正的图片附件
  // 只检测 content 数组中的 image_url part，忽略纯文本内容
  if (!reqBody.messages || !Array.isArray(reqBody.messages)) return false;
  for (const msg of reqBody.messages) {
    if (!msg.content) continue;
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if ((part.type === 'image_url' || part.type === 'image') && part.url && (part.url.startsWith('data:image') || part.url.startsWith('http'))) return true;
        if (part.type === 'image_url' && part.image_url?.url) return true;
      }
    }
    // content 是字符串 → 纯文本，不检测
    // OpenClaw 消息文本中常含 image_url / 图片链接等文字，不算图片附件
  }
  return false;
}

async function unifiedRoute(providerId, req, res) {
  const clientIp = req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() 
    || req.headers?.["x-real-ip"] 
    || req.socket?.remoteAddress 
    || "unknown";
  
  console.log(`[统一路由] ${clientIp} -> ${providerId} ${req.url}`);
  
  // 读取请求体
  let body = '';
  for await (const chunk of req) body += chunk;
  let reqBody;
  try { reqBody = JSON.parse(body); } catch { 
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
  }
  
  const originalModel = reqBody.model || 'unknown';
  const isStream = reqBody.stream === true;

  // === 🔑 先查用户偏好模型 ===
  const userInfo = resolveUserInfo(req);
  const preferredModel = userInfo?.preferredModel || null;
  const finalModel = preferredModel || originalModel;

  console.log(`[统一路由] ${clientIp} 请求模型=${originalModel}, 用户偏好=${preferredModel || '无'}, 最终=${finalModel}`);

  // === 🎯 Cursor 模型路由：cu/ 前缀直接转发到 204 cursor-proxy ===
  if (finalModel.startsWith('cu/')) {
    console.log(`[Cursor路由] ${clientIp} → cursor-proxy: ${finalModel}`);
    reqBody.model = finalModel;
    return proxyCursorRequest(reqBody, isStream, clientIp, res);
  }

  // === 🖼️ 图片检测：如果请求包含图片，自动切换到支持视觉的模型 ===
  const hasImage = detectImageInRequest(reqBody);
  let selectedModel = getUserPreferredModel(clientIp, originalModel, req);
  
  if (hasImage && !isVisionModel(selectedModel)) {
    const visionModel = selectVisionModel(clientIp);
    console.log(`[🖼️ 图片检测] ${clientIp} 请求包含图片，${selectedModel} 不支持视觉，切换到 ${visionModel}`);
    selectedModel = visionModel;
  }
  
  // === 📏 Token 大小检测：避免选小上下文模型导致 400 ===
  const estimatedTokens = estimateTokens(reqBody);
  if (estimatedTokens > 50000) {
    const betterModel = selectModelByTokenCount(estimatedTokens, selectedModel);
    if (betterModel) {
      console.log(`[📏 Token检测] ${clientIp} 估算 ~${estimatedTokens} tokens，${selectedModel} 上下文不够，升级到 ${betterModel}`);
      selectedModel = betterModel;
    }
  }
  
  reqBody.model = selectedModel;
  
  // === 🎯 Provider 直连路由（百炼/智谱不走 9Router）===
  let directProvider = null;
  for (const [prefix, providerId] of Object.entries(MODEL_PROVIDER_MAP)) {
    if (selectedModel.startsWith(prefix)) {
      directProvider = providerId;
      break;
    }
  }
  
  if (directProvider) {
    // 去掉前缀，取实际模型名
    const realModel = selectedModel.split('/').slice(1).join('/') || selectedModel;
    reqBody.model = realModel;
    
    // 检查用户是否有自己的 key
    const userInfo = resolveUserInfo(req);
    const userId = userInfo?.userId;
    const userOwnKey = getUserKey(userId, directProvider);
    
    if (userOwnKey) {
      console.log(`[直连] ${clientIp} (${userInfo.nickname}) → ${realModel} via 用户自有 ${directProvider} key`);
    } else {
      console.log(`[直连] ${clientIp} → ${realModel} via Lume ${directProvider}`);
    }
    
    const directReq = {
      url: '/v1/chat/completions',
      method: 'POST',
      [Symbol.asyncIterator]: async function*() { yield JSON.stringify(reqBody); }
    };
    
    try {
      // 如果用户有自己的 key，临时注入到 PROVIDERS
      if (userOwnKey) {
        const userProviderId = `user-${userId}-${directProvider}`;
        PROVIDERS[userProviderId] = {
          ...PROVIDERS[directProvider],
          keys: [{ key: userOwnKey, enabled: true }],
        };
        await proxyRequest(userProviderId, directReq, res);
        delete PROVIDERS[userProviderId];
      } else {
        await proxyRequest(directProvider, directReq, res);
      }
      recordRequest(clientIp, directProvider, originalModel, 200);
      return;
    } catch (e) {
      console.error(`[直连] ${directProvider} 失败: ${e.message}，降级到 9Router`);
      reqBody.model = selectedModel;
    }
  }
  
  // === 第一步：尝试通过 9Router 转发 ===
  try {
    if (isStream) {
      // 流式：直接 pipe（无法中途降级）
      await proxyVia9Router(reqBody, req.url, clientIp, res);
      recordRequest(clientIp, 'router', originalModel, 200);
      // 📊 流式无法提取精确 usage，按请求次数估算（每次 ~500 tokens）
      const userInfo = ipUserMap[clientIp];
      if (userInfo?.userId) {
        const tokens = { total: 500, input: 200, output: 300 };
        updateDbWithCredits(userInfo.userId, originalModel, tokens).catch(() => {});
      }
      return;
    }
    
    // 非流式：尝试 9Router，支持自动降级免费模型
    let result = await proxyVia9Router(reqBody, req.url, clientIp, null);
    
    // 自动降级循环
    let fallbackAttempts = 0;
    while (!result.success && result.shouldFallback && fallbackAttempts < ROUTER_FALLBACK_MODELS.length) {
      fallbackAttempts++;
      console.log(`[9Router] 🔄 自动降级尝试 #${fallbackAttempts}/${ROUTER_FALLBACK_MODELS.length}`);
      result = await proxyVia9Router(reqBody, req.url, clientIp, null, result.nextFallback);
    }
    
    if (result.success) {
      recordRequest(clientIp, 'router', originalModel, 200);
      if (result.routerModel !== mapTo9RouterModel(originalModel, clientIp)) {
        console.log(`[9Router] ✅ 降级成功: ${originalModel} → ${result.routerModel}`);
      }
      // 📊 提取 usage 写入用户统计
      try {
        let usage = null;
        if (result.usage) {
          usage = result.usage;
        } else if (result.body) {
          try {
            const parsed = JSON.parse(result.body);
            usage = parsed.usage;
          } catch {}
        }
        if (usage && (usage.total_tokens || usage.totalTokens)) {
          const userInfo = ipUserMap[clientIp];
          if (userInfo?.userId) {
            const tokens = {
              total: usage.total_tokens || usage.totalTokens || 0,
              input: usage.prompt_tokens || usage.inputTokens || 0,
              output: usage.completion_tokens || usage.outputTokens || 0,
            };
            updateDbWithCredits(userInfo.userId, result.routerModel || originalModel, tokens);
          }
        }
      } catch (usageErr) {
        console.error('[统一路由] usage 记录失败:', usageErr.message);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(result.body);
    }
    
    // 所有 9Router 模型都失败
    throw new Error('9Router all models exhausted');
    
  } catch (routerErr) {
    // === 第二步：9Router 完全不可用，兜底走付费 API ===
    console.warn(`[统一路由] ⚠️ 9Router 失败，兜底付费 API: ${routerErr.message}`);
    
    if (!PROVIDERS[providerId] || !PROVIDERS[providerId].keys?.length) {
      // 没有付费 API 兜底
      console.error(`[统一路由] ❌ 无可用 fallback provider: ${providerId}`);
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        error: '所有 AI 服务暂不可用，请稍后重试',
        code: 'ALL_SERVICES_UNAVAILABLE' 
      }));
    }
    
    // 走原来的付费 API 逻辑
    recordRequest(clientIp, providerId, originalModel, 200);
    return proxyPaidRequest(providerId, req, res, body, clientIp);
  }
}

// 原始付费 API 请求（作为最后兜底）
async function proxyPaidRequest(providerId, req, res, body, clientIp) {
  const provider = PROVIDERS[providerId];
  const apiKey = getNextKey(providerId);
  if (!apiKey) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: '没有可用的付费 API Key' }));
  }
  
  const baseUrl = provider.baseUrl;
  let targetPath = req.url.replace(/^\/(api\/ai\/)?(aliyun|zhipu|dmxapi)/, '');
  targetPath = targetPath.replace(/\/v[14]\//, '/');
  const url = new URL(baseUrl + targetPath);
  
  const httpModule = url.protocol === 'https:' ? https : http;
  
  const proxyReq = httpModule.request({
    timeout: 300000,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'openclaw-gateway/1.0',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }
  }, (proxyRes) => {
    const statusCode = proxyRes.statusCode;
    if (statusCode === 429) {
      markKey429(providerId, apiKey, 5);
      recordRequest(clientIp, providerId, null, 429);
    }
    res.writeHead(statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
    });
    proxyRes.pipe(res).on('error', () => { if (!res.writableEnded) res.end(); });
  });
  
  proxyReq.on('error', (e) => {
    console.error('[兜底付费] 请求失败:', e.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
  
  proxyReq.write(body);
  proxyReq.end();
}

// 默认配置
const DEFAULT_CONFIG = {
  aliyun: {
    name: '阿里云百炼',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    keys: []
  },
  zhipu: {
    name: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
    keys: []
  },
  dmxapi: {
    name: 'DMXAPI（免费）',
    baseUrl: 'https://www.dmxapi.cn/v1',
    keys: []
  },
  router: {
    name: '9Router（GitHub Copilot 免费）',
    baseUrl: 'http://localhost:20128/v1',
    keys: []
  }
};

// 加载配置
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      // 合并默认配置
      for (const [id, config] of Object.entries(DEFAULT_CONFIG)) {
        if (!data[id]) {
          data[id] = config;
        } else {
          data[id] = { ...config, ...data[id] };
        }
      }
      return data;
    }
  } catch (e) {
    console.error('加载配置失败:', e.message);
  }
  
  // 从环境变量初始化
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  
  // 从环境变量读取 Key（逗号分隔）
  if (process.env.DASHSCOPE_API_KEY) {
    config.aliyun.keys = process.env.DASHSCOPE_API_KEY.split(',').map((key, i) => ({
      key: key.trim(),
      index: i,
      enabled: true,
      usage: 0,
      addedAt: new Date().toISOString()
    }));
  }
  if (process.env.ZHIPU_API_KEY) {
    config.zhipu.keys = process.env.ZHIPU_API_KEY.split(',').map((key, i) => ({
      key: key.trim(),
      index: i,
      enabled: true,
      usage: 0,
      addedAt: new Date().toISOString()
    }));
  }
  if (process.env.DMXAPI_API_KEY) {
    config.dmxapi.keys = process.env.DMXAPI_API_KEY.split(',').map((key, i) => ({
      key: key.trim(),
      index: i,
      enabled: true,
      usage: 0,
      addedAt: new Date().toISOString()
    }));
  }
  
  // 从环境变量读取自定义 baseUrl（可选）
  if (process.env.ALIYUN_BASE_URL) {
    config.aliyun.baseUrl = process.env.ALIYUN_BASE_URL;
  }
  if (process.env.ZHIPU_BASE_URL) {
    config.zhipu.baseUrl = process.env.ZHIPU_BASE_URL;
  }
  if (process.env.DMXAPI_BASE_URL) {
    config.dmxapi.baseUrl = process.env.DMXAPI_BASE_URL;
  }
  
  return config;
}

// 保存配置
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(PROVIDERS, null, 2));
    return true;
  } catch (e) {
    console.error('保存配置失败:', e.message);
    return false;
  }
}

// 初始化配置
const PROVIDERS = loadConfig();

// 轮询索引
const roundRobinIndex = {};

// ============ 调用统计 ============

const STATS_FILE = join(__dirname, 'data/proxy-stats.json');

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function hourKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:00`;
}

// 内存统计（启动时从文件加载）
let stats = {
  startTime: new Date().toISOString(),
  byIp: {},        // { ip: { today, total, byProvider:{aliyun:{req,ok,err429},zhipu:{...}}, lastRequest, models:{} } }
  byHour: {},      // { "2026-04-23 12:00": { total, byProvider:{} } }
  byDay: {},       // { "2026-04-23": { total, byProvider:{}, uniqueIps:0 } }
};

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
      stats = { ...stats, ...data };
    }
  } catch (e) {
    console.error('[统计] 加载失败:', e.message);
  }
}

let statsSaveTimer = null;
function saveStats() {
  if (statsSaveTimer) return; // 防抖
  statsSaveTimer = setTimeout(() => {
    statsSaveTimer = null;
    try {
      fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    } catch (e) {
      console.error('[统计] 保存失败:', e.message);
    }
  }, 5000); // 5秒后保存，合并多次写入
}

// 记录一次请求
function recordRequest(ip, provider, model, statusCode) {
  const today = todayKey();
  const hour = hourKey();
  const is429 = statusCode === 429;
  const isSuccess = statusCode >= 200 && statusCode < 300;

  // === 按 IP 统计 ===
  if (!stats.byIp[ip]) {
    stats.byIp[ip] = { today: 0, total: 0, byProvider: {}, lastRequest: null, models: {}, dailyHistory: {} };
  }
  const ipStat = stats.byIp[ip];
  ipStat.total++;
  if (!ipStat.byProvider[provider]) {
    ipStat.byProvider[provider] = { req: 0, ok: 0, err429: 0 };
  }
  ipStat.byProvider[provider].req++;
  if (isSuccess) ipStat.byProvider[provider].ok++;
  if (is429) ipStat.byProvider[provider].err429++;
  ipStat.lastRequest = new Date().toISOString();

  // 记录模型使用
  if (model) {
    if (!ipStat.models[model]) ipStat.models[model] = 0;
    ipStat.models[model]++;
  }

  // IP 每日统计
  if (!ipStat.dailyHistory[today]) ipStat.dailyHistory[today] = 0;
  ipStat.dailyHistory[today]++;
  ipStat.today = ipStat.dailyHistory[today] || 0;

  // === 按小时统计 ===
  if (!stats.byHour[hour]) {
    stats.byHour[hour] = { total: 0, byProvider: {} };
  }
  stats.byHour[hour].total++;
  if (!stats.byHour[hour].byProvider[provider]) {
    stats.byHour[hour].byProvider[provider] = { req: 0, ok: 0, err429: 0 };
  }
  stats.byHour[hour].byProvider[provider].req++;
  if (isSuccess) stats.byHour[hour].byProvider[provider].ok++;
  if (is429) stats.byHour[hour].byProvider[provider].err429++;

  // === 按天统计 ===
  if (!stats.byDay[today]) {
    stats.byDay[today] = { total: 0, byProvider: {}, uniqueIps: new Set() };
  }
  stats.byDay[today].total++;
  if (!stats.byDay[today].byProvider[provider]) {
    stats.byDay[today].byProvider[provider] = { req: 0, ok: 0, err429: 0 };
  }
  stats.byDay[today].byProvider[provider].req++;
  if (isSuccess) stats.byDay[today].byProvider[provider].ok++;
  if (is429) stats.byDay[today].byProvider[provider].err429++;

  // 异步保存（防抖）
  saveStats();
}

// 清理超过30天的历史数据
function cleanupOldStats() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = todayKey(); // 只保留最近30天

  for (const [day, data] of Object.entries(stats.byDay)) {
    if (day < cutoffStr) delete stats.byDay[day];
  }
  for (const [hour, data] of Object.entries(stats.byHour)) {
    if (hour < cutoffStr) delete stats.byHour[hour];
  }
  for (const [ip, data] of Object.entries(stats.byIp)) {
    if (data.dailyHistory) {
      for (const [day] of Object.entries(data.dailyHistory)) {
        if (day < cutoffStr) delete data.dailyHistory[day];
      }
    }
  }
}

// 每天凌晨清理
setInterval(cleanupOldStats, 24 * 60 * 60 * 1000);

// 加载历史统计
loadStats();

// 统计 API 处理函数
function handleStatsApi(req, res, path) {
  // GET /api/stats - 总览
  if (path === '/api/stats' && req.method === 'GET') {
    const today = todayKey();
    const todayStat = stats.byDay[today] || { total: 0, byProvider: {}, uniqueIps: 0 };
    const topIps = Object.entries(stats.byIp)
      .map(([ip, s]) => ({ ip, today: s.today || 0, total: s.total, lastRequest: s.lastRequest, models: s.models, byProvider: s.byProvider }))
      .sort((a, b) => (b.today || 0) - (a.today || 0));

    // 最近24小时趋势
    const hours = [];
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const h = new Date(now.getTime() - i * 3600000);
      const hk = `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')} ${String(h.getHours()).padStart(2,'0')}:00`;
      const hData = stats.byHour[hk] || { total: 0, byProvider: {} };
      hours.push({ hour: hk, ...hData });
    }

    const result = {
      timestamp: new Date().toISOString(),
      uptime: stats.startTime,
      today: {
        total: todayStat.total,
        byProvider: todayStat.byProvider,
        uniqueIps: Object.keys(stats.byIp).filter(ip => stats.byIp[ip].dailyHistory?.[today] > 0).length,
      },
      allTime: {
        totalRequests: Object.values(stats.byIp).reduce((s, v) => s + v.total, 0),
        totalIps: Object.keys(stats.byIp).length,
      },
      topIps,
      hourlyTrend: hours,
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result));
  }

  // GET /api/stats/ip/:ip - 单IP详情
  const ipMatch = path.match(/^\/api\/stats\/ip\/([0-9.]+)$/);
  if (ipMatch && req.method === 'GET') {
    const ip = ipMatch[1];
    const ipStat = stats.byIp[ip];
    if (!ipStat) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'IP 无记录' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ip, ...ipStat }));
  }

  // GET /api/stats/days - 最近每天统计
  if (path === '/api/stats/days' && req.method === 'GET') {
    const days = Object.entries(stats.byDay)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 30)
      .map(([day, data]) => {
        const uniqueIps = Object.keys(stats.byIp).filter(ip => stats.byIp[ip].dailyHistory?.[day] > 0).length;
        return { day, ...data, uniqueIps };
      });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ days }));
  }

  // DELETE /api/stats - 重置统计（需认证）
  if (path === '/api/stats' && req.method === 'DELETE') {
    if (!checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '未授权' }));
    }
    stats = { startTime: new Date().toISOString(), byIp: {}, byHour: {}, byDay: {} };
    try { fs.unlinkSync(STATS_FILE); } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, message: '统计已重置' }));
  }

  return false; // 未匹配
}

// ============ IP 限流 ============

const IP_RATE_LIMITS = new Map(); // ip -> { count, resetAt }
const IP_RATE_LIMIT_WINDOW = 60 * 1000;  // 1 分钟窗口
const IP_RATE_LIMIT_MAX = 30;             // 每窗口最多 30 次请求

function checkIpRateLimit(ip) {
  const now = Date.now();
  let record = IP_RATE_LIMITS.get(ip);
  
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + IP_RATE_LIMIT_WINDOW };
    IP_RATE_LIMITS.set(ip, record);
  }
  
  record.count++;
  
  if (record.count > IP_RATE_LIMIT_MAX) {
    const remaining = Math.ceil((record.resetAt - now) / 1000);
    return { limited: true, retryAfter: remaining, count: record.count };
  }
  
  return { limited: false, count: record.count };
}

// 每 5 分钟清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of IP_RATE_LIMITS) {
    if (now > record.resetAt + 60000) {
      IP_RATE_LIMITS.delete(ip);
    }
  }
}, 5 * 60 * 1000);


// ============ 轮询 ============

// 429 冷却记录：{ providerId_keyIndex: cooldownUntil }
const keyCooldowns = new Map();

function getNextKey(providerId, excludeKeys = []) {
  const provider = PROVIDERS[providerId];
  if (!provider) return null;
  
  const now = Date.now();
  const enabled = provider.keys.filter(k => {
    if (!k.enabled) return false;
    if (excludeKeys.includes(k.key)) return false;
    // 检查 429 冷却
    const cooldownKey = `${providerId}_${k.index}`;
    const cooldownUntil = keyCooldowns.get(cooldownKey);
    if (cooldownUntil && now < cooldownUntil) return false;
    return true;
  });
  if (!enabled.length) return null;
  
  if (!roundRobinIndex[providerId]) roundRobinIndex[providerId] = 0;
  roundRobinIndex[providerId] = (roundRobinIndex[providerId] + 1) % enabled.length;
  
  const key = enabled[roundRobinIndex[providerId]];
  key.usage = (key.usage || 0) + 1;
  
  // 异步保存
  saveConfig();
  
  return key.key;
}

// 标记 Key 被 429 限流，冷却一段时间
function markKey429(providerId, apiKey, retryAfterSec) {
  const provider = PROVIDERS[providerId];
  if (!provider) return;
  const keyObj = provider.keys.find(k => k.key === apiKey);
  if (!keyObj) return;
  
  const cooldownMs = Math.max((retryAfterSec || 5) * 1000, 3000); // 至少冷却 3 秒
  const cooldownKey = `${providerId}_${keyObj.index}`;
  keyCooldowns.set(cooldownKey, Date.now() + cooldownMs);
  
  if (!keyObj.rateLimitHits) keyObj.rateLimitHits = 0;
  keyObj.rateLimitHits++;
  
  console.warn(`[轻代理] Key #${keyObj.index} 被 429 限流，冷却 ${cooldownMs}ms (累计 ${keyObj.rateLimitHits} 次)`);
}

// ============ 付费 API 代理（仅作为 9Router 的兜底） ============

const MAX_429_RETRIES = 3;
const MAX_ERR_RETRIES = 1;

// 注意：此函数现在仅由 proxyPaidRequest（兜底）调用
// 主路由逻辑已移到 unifiedRoute
async function proxyRequest(providerId, req, res, _retryState = null) {
  // 记录来源 IP（仅首次请求）
  const clientIp = (!_retryState) 
    ? (req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req.headers?.["x-real-ip"] || req.socket?.remoteAddress || "unknown")
    : _retryState._clientIp;
  if (!_retryState) {
    console.log(`[来源] ${clientIp} -> ${providerId} ${req.url}`);
  }
  const provider = PROVIDERS[providerId];
  if (!provider) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: '未知的供应商' }));
  }
  
  const retryCount = (_retryState && _retryState.retries) || 0;
  const usedKeys = (_retryState && _retryState.usedKeys) || [];
  const _9routerFallback = (_retryState && _retryState._9routerFallback) || false;
  
  // 读取请求体（首次读取，重试时复用）
  let body = (_retryState && _retryState.body) || '';
  if (!body) {
    for await (const chunk of req) body += chunk;
  }
  
  let requestModel = null;
  try { const parsed = JSON.parse(body); if (parsed.model) requestModel = parsed.model; } catch {}
  
  // ============ 付费 API 请求（兜底模式，9Router 优先路由已在上层处理） ============
  // 此函数现在只在 9Router 完全不可用时作为 fallback
  
  const apiKey = getNextKey(providerId, usedKeys);
  if (!apiKey) {
    // 没有可用 Key（全部冷却或不存在）
    if (usedKeys.length > 0) {
      // 所有 Key 都被 429 了
      const srcIp = req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req.headers?.["x-real-ip"] || req.socket?.remoteAddress || "unknown"; console.error(`[轻代理] ${providerId} 所有 Key 均被限流 [来源: ${srcIp}]`);
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '10' });
      return res.end(JSON.stringify({ 
        error: '所有 API Key 均被限流，请稍后重试',
        code: 'ALL_KEYS_RATE_LIMITED',
        retryAfter: 10
      }));
    }
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: '没有可用的 API Key' }));
  }

  const baseUrl = provider.baseUrl;
  let targetPath = req.url.replace(/^\/(api\/ai\/)?(aliyun|zhipu|dmxapi)/, '');
  if (providerId === 'aliyun' || providerId === 'zhipu' || providerId === 'dmxapi' || providerId === 'bailian-token-plan' || providerId.startsWith('user-')) {
    targetPath = targetPath.replace(/\/v[14]\//, '/');
  }
  const url = new URL(baseUrl + targetPath);
  if (retryCount === 0) console.log('[代理调试] 请求 URL:', url.toString());
  
  const httpModule = url.protocol === 'https:' ? https : http;
  
  const options = {
    timeout: 300000,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'openclaw-gateway/1.0',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }
  };

  // 读取请求体（首次读取，重试时复用）
  // 注意：9Router 优先路由可能已经读取过 body，这里检查
  if (!body) {
    for await (const chunk of req) body += chunk;
  }
  // 记录请求的 model（仅首次）
  if (retryCount === 0) {
    try { const parsed = JSON.parse(body); if (parsed.model) { console.log(`[请求详情] 来源=${clientIp} model=${parsed.model} stream=${parsed.stream} provider=${providerId}`); } } catch {}
    recordRequest(clientIp, providerId, requestModel, 200);
  }

  const proxyReq = httpModule.request(options, (proxyRes) => {
    const statusCode = proxyRes.statusCode;
    
    // 🔧 429 处理：换 Key 重试 或 fallback 到 9Router
    if (statusCode === 429 && !res.headersSent) {
      // 读取并丢弃响应体
      let errBody = '';
      proxyRes.on('data', chunk => errBody += chunk);
      proxyRes.on('end', async () => {
        const retryAfterHeader = proxyRes.headers['retry-after'];
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader) || 5 : 5;
        
        // 标记当前 Key 冷却
        markKey429(providerId, apiKey, retryAfterSec);
        // 记录 429 统计
        recordRequest(clientIp, providerId, null, 429);
        
        // 🆕 付费 API 429，不再 fallback 到 9Router（统一路由已在上层处理）
        // 直接换 Key 重试
        if (retryCount < MAX_429_RETRIES) {
          const newUsedKeys = [...usedKeys, apiKey];
          const delayMs = Math.min(retryAfterSec * 1000, 5000);
          
          console.warn(`[轻代理] 429 重试 #${retryCount + 1}/${MAX_429_RETRIES}，${delayMs}ms 后换 Key...`);
          
          setTimeout(() => {
            const fakeReq = { url: req.url, method: req.method, [Symbol.asyncIterator]: async function*() { yield body; } };
            proxyRequest(providerId, fakeReq, res, { 
              retries: retryCount + 1, 
              usedKeys: newUsedKeys, 
              body,
              _clientIp: clientIp,
              _9routerFallback: true  // 标记已经试过 9Router fallback
            });
          }, delayMs);
        } else {
          // 重试次数用尽
          res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '10' });
          res.end(JSON.stringify({ 
            error: '所有 API Key 均被限流，请稍后重试',
            code: 'ALL_KEYS_RATE_LIMITED',
            retryAfter: 10
          }));
        }
      });
      return;
    }
    
    // 🔧 5xx 错误：直接返回错误（9Router 在上层已处理）
    
    // 非 429 正常转发
    const headers = {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      'Cache-Control': proxyRes.headers['cache-control'] || 'no-cache'
    };
    // 透传 Retry-After
    if (proxyRes.headers['retry-after']) {
      headers['Retry-After'] = proxyRes.headers['retry-after'];
    }
    res.writeHead(statusCode, headers);
    
    proxyRes.on('error', (e) => {
      console.error('[轻代理] 上游响应中断:', e.message);
      if (!res.writableEnded) res.end();
    });
    
    proxyRes.on('end', () => { if (!res.writableEnded) res.end(); });
    proxyRes.pipe(res).on('error', (pipeErr) => {
      console.error('[轻代理] pipe 错误:', pipeErr.message);
      if (!res.writableEnded) { try { res.end(); } catch(e) {} }
    });
  });

  proxyReq.on('error', (e) => {
    console.error("[轻代理] 请求失败:", e.message);
    
    const isRetryable = e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' || e.message.includes('timeout');
    const errRetries = (_retryState && _retryState.errRetries) || 0;
    
    if (isRetryable && errRetries < MAX_ERR_RETRIES && !res.headersSent) {
      console.warn('[轻代理] 网络重试 #' + (errRetries + 1) + ' (' + e.message + '), 换 Key...');
      try {
        const fakeReq = { url: req.url, method: req.method, [Symbol.asyncIterator]: async function*() { yield body; } };
        return proxyRequest(providerId, fakeReq, res, { 
          retries: retryCount, 
          errRetries: errRetries + 1, 
          usedKeys: [...usedKeys, apiKey], 
          body,
          _clientIp: clientIp
        });
      } catch (retryErr) {
        console.error('[轻代理] 重试失败:', retryErr.message);
      }
    }
    
    try {
      if (!res.headersSent) {
        const status = e.code === 'ETIMEDOUT' ? 504 : (e.code === 'ECONNRESET' ? 502 : 500);
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message, retries: retryCount }));
      } else if (!res.writableEnded) {
        res.end();
      }
    } catch (writeErr) {
      console.error('[轻代理] 无法发送错误响应:', writeErr.message);
    }
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
}

// ============ 管理接口 ============

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function checkAuth(req) {
  const token = req.headers['x-admin-token'] || req.headers['authorization']?.replace('Bearer ', '');
  return token === ADMIN_TOKEN;
}

async function handleAdminApi(req, res, path) {
  // GET /api/keys - 获取所有 Key
  if (path === '/api/keys' && req.method === 'GET') {
    const result = {};
    for (const [id, provider] of Object.entries(PROVIDERS)) {
      result[id] = {
        name: provider.name,
        baseUrl: provider.baseUrl,
        keys: provider.keys.map(k => ({
          index: k.index,
          keyPreview: k.key.substring(0, 8) + '****' + k.key.substring(k.key.length - 4),
          enabled: k.enabled,
          usage: k.usage || 0,
          addedAt: k.addedAt
        }))
      };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, providers: result }));
  }
  
  // 需要认证的接口
  if (!checkAuth(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: '未授权' }));
  }
  
  // POST /api/keys/:provider - 添加 Key
  const addMatch = path.match(/^\/api\/keys\/(\w+)$/);
  if (addMatch && req.method === 'POST') {
    const providerId = addMatch[1];
    const provider = PROVIDERS[providerId];
    if (!provider) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '未知的供应商' }));
    }
    
    const body = await parseBody(req);
    if (!body.key) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '缺少 API Key' }));
    }
    
    // 检查是否已存在
    if (provider.keys.some(k => k.key === body.key)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '该 Key 已存在' }));
    }
    
    const newKey = {
      key: body.key,
      index: provider.keys.length,
      enabled: true,
      usage: 0,
      addedAt: new Date().toISOString()
    };
    provider.keys.push(newKey);
    saveConfig();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, message: 'Key 添加成功', index: newKey.index }));
  }
  
  // DELETE /api/keys/:provider/:index - 删除 Key
  const deleteMatch = path.match(/^\/api\/keys\/(\w+)\/(\d+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const providerId = deleteMatch[1];
    const index = parseInt(deleteMatch[2]);
    const provider = PROVIDERS[providerId];
    
    if (!provider) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '未知的供应商' }));
    }
    
    if (index < 0 || index >= provider.keys.length) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Key 不存在' }));
    }
    
    provider.keys.splice(index, 1);
    // 重新编号
    provider.keys.forEach((k, i) => k.index = i);
    saveConfig();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, message: 'Key 删除成功' }));
  }
  
  // PUT /api/keys/:provider/:index/toggle - 启用/禁用 Key
  const toggleMatch = path.match(/^\/api\/keys\/(\w+)\/(\d+)\/toggle$/);
  if (toggleMatch && req.method === 'PUT') {
    const providerId = toggleMatch[1];
    const index = parseInt(toggleMatch[2]);
    const provider = PROVIDERS[providerId];
    
    if (!provider) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '未知的供应商' }));
    }
    
    if (index < 0 || index >= provider.keys.length) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Key 不存在' }));
    }
    
    const body = await parseBody(req);
    provider.keys[index].enabled = body.enabled !== undefined ? body.enabled : !provider.keys[index].enabled;
    saveConfig();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ 
      success: true, 
      message: provider.keys[index].enabled ? 'Key 已启用' : 'Key 已禁用',
      enabled: provider.keys[index].enabled
    }));
  }
  
  // PUT /api/keys/:provider/:index/reset - 重置使用量
  const resetMatch = path.match(/^\/api\/keys\/(\w+)\/(\d+)\/reset$/);
  if (resetMatch && req.method === 'PUT') {
    const providerId = resetMatch[1];
    const index = parseInt(resetMatch[2]);
    const provider = PROVIDERS[providerId];
    
    if (!provider || index < 0 || index >= provider.keys.length) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Key 不存在' }));
    }
    
    provider.keys[index].usage = 0;
    saveConfig();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, message: '使用量已重置' }));
  }
  
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ============ HTTP 服务 ============

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // IP 限流检查
  const clientIp = req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() 
    || req.headers?.["x-real-ip"] 
    || req.socket?.remoteAddress 
    || "unknown";
  const rateLimitResult = checkIpRateLimit(clientIp);
  if (rateLimitResult.limited) {
    console.warn(`[限流] IP ${clientIp} 超出速率限制 (${rateLimitResult.count}/${IP_RATE_LIMIT_MAX} 每分钟)`);
    res.writeHead(429, { 
      "Content-Type": "application/json",
      "Retry-After": String(rateLimitResult.retryAfter)
    });
    return res.end(JSON.stringify({ 
      error: "请求过于频繁，请稍后再试",
      code: "IP_RATE_LIMITED",
      retryAfter: rateLimitResult.retryAfter
    }));
  }

    // 内部刷新端点：index.js 保存偏好后通知

    if (path === '/internal/active-user' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const data = JSON.parse(body || '{}');
        if (data.userId) setLumeActiveUser(String(data.userId));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, userId: data.userId || null }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: String(e) }));
      }
    }

    if (path === '/internal/refresh-users') {
      loadUserPreferences();
      const count = Object.keys(ipUserMap).length;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, mappedIps: count }));
    }

    // 健康检查
  if (path === '/health') {
    const status = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      port: PORT,
      providers: {}
    };
    for (const [id, p] of Object.entries(PROVIDERS)) {
      status.providers[id] = {
        name: p.name,
        totalKeys: p.keys.length,
        enabledKeys: p.keys.filter(k => k.enabled).length,
        totalUsage: p.keys.reduce((s, k) => s + (k.usage || 0), 0),
        totalRateLimitHits: p.keys.reduce((s, k) => s + (k.rateLimitHits || 0), 0),
        cooldowns: p.keys.filter(k => {
          const cd = keyCooldowns.get(`${id}_${k.index}`);
          return cd && Date.now() < cd;
        }).length
      };
    }
    // 🆕 9Router 统一路由状态
    status.router = {
      url: ROUTER_URL,
      mode: '🌐 统一路由（所有请求都走 9Router）',
      modelMapping: Object.keys(MODEL_MAP_TO_9ROUTER).length + ' models mapped',
      fallbackModels: ROUTER_FALLBACK_MODELS,
      status: 'checking...'
    };
    // 异步检查 9Router 是否在线
    try {
      const checkRes = await fetch(ROUTER_URL + '/v1/models', { signal: AbortSignal.timeout(3000) });
      status.router.status = checkRes.ok ? '✅ online' : `⚠️ HTTP ${checkRes.status}`;
    } catch {
      status.router.status = '❌ offline';
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(status));
  }

  // 管理接口
  if (path.startsWith('/api/keys')) {
    return handleAdminApi(req, res, path);
  }

  // 统计接口
  if (path.startsWith('/api/stats')) {
    const handled = handleStatsApi(req, res, path);
    if (handled !== false) return;
  }

  // 用户模型偏好接口
  if (path === '/api/user-models' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      availableModels: [
        { id: 'auto', name: 'Auto', provider: '系统', desc: '智能选择最优模型', tier: 'free' },
        { id: 'bailian/deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: '百炼', desc: '最强性价比', tier: 'free' },
        { id: 'glm-cn/glm-5.2', name: 'GLM-5.2', provider: '智谱', desc: '中文最强', tier: 'free' },
        { id: 'glm-cn/glm-5.2', name: 'GLM-5.2 主力', provider: '智谱直连', desc: '智谱大号直接干', tier: 'pro' },
        { id: 'gh/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', desc: 'GPT经典', tier: 'pro' },
        { id: 'gh/gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI', desc: '强推理', tier: 'pro' },
        { id: 'gh/gpt-5-mini', name: 'GPT-5-Mini', provider: 'OpenAI', desc: '快速免费', tier: 'free' },
        { id: 'bailian/kimi-k2.7-code', name: 'Kimi K2.7 Code', provider: '百炼', desc: '长上下文', tier: 'free' },
        { id: 'openrouter/openrouter/free', name: 'Free', provider: 'OpenRouter', desc: '免费兜底', tier: 'free' },
        { id: 'cu/default', name: 'Cursor Auto', provider: 'Cursor', desc: 'Cursor 智能选模', tier: 'pro' },
        { id: 'cu/gpt-5.2', name: 'Cursor GPT-5.2', provider: 'Cursor', desc: 'OpenAI 旗舰', tier: 'pro' },
        { id: 'cu/gpt-5.5-high-fast', name: 'Cursor GPT-5.5 Fast', provider: 'Cursor', desc: '极速旗舰', tier: 'pro' },
        { id: 'cu/gpt-5.5-high', name: 'Cursor GPT-5.5', provider: 'Cursor', desc: '顶级推理', tier: 'pro' },
        { id: 'cu/claude-4.5-sonnet', name: 'Cursor Claude 4.5 Sonnet', provider: 'Cursor', desc: 'Anthropic 平衡', tier: 'pro' },
        { id: 'cu/claude-4.5-haiku', name: 'Cursor Claude 4.5 Haiku', provider: 'Cursor', desc: 'Anthropic 快速', tier: 'pro' },
        { id: 'cu/claude-4.5-opus-high', name: 'Cursor Claude 4.5 Opus', provider: 'Cursor', desc: 'Anthropic 旗舰', tier: 'pro' },
        { id: 'cu/claude-4.6-opus-max', name: 'Cursor Claude 4.6 Opus Max', provider: 'Cursor', desc: '最强 Claude', tier: 'pro' },
        { id: 'cu/claude-4.5-sonnet-thinking', name: 'Claude 4.5 Sonnet Thinking', provider: 'Cursor', desc: '带推理链', tier: 'pro' },
        { id: 'cu/claude-4.5-opus-high-thinking', name: 'Claude 4.5 Opus Thinking', provider: 'Cursor', desc: '旗舰推理链', tier: 'pro' },
        { id: 'cu/claude-4.6-opus-max-thinking', name: 'Claude 4.6 Opus Thinking', provider: 'Cursor', desc: '最强推理链', tier: 'pro' },
        { id: 'cu/claude-4.6-sonnet-medium-thinking', name: 'Claude 4.6 Sonnet Thinking', provider: 'Cursor', desc: '新一代推理', tier: 'pro' },
      ]
    }));
    return;
  }

  // ============ 用户模型偏好接口 ============
  if (path === '/api/user-models/preference' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { userId, model } = JSON.parse(body);
        if (!userId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'userId required' }));
          return;
        }
        const ok = updateUserModelPreference(userId, model || 'auto');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: ok, model: model || 'auto' }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

// ============ 统一 AI 路由：所有请求都走 9Router ============
  if (path.startsWith('/api/ai/aliyun')) {
    return unifiedRoute('aliyun', req, res);
  }
  if (path.startsWith('/api/ai/zhipu')) {
    return unifiedRoute('zhipu', req, res);
  }
  if (path.startsWith('/api/ai/dmxapi')) {
    return unifiedRoute('dmxapi', req, res);
  }
  // 兼容：直接 /v1/chat/completions 请求也走统一路由
  if (path === '/v1/chat/completions' || path === '/chat/completions') {
    return unifiedRoute('zhipu', req, res);
  }

  // ============ 兜底 ============
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found', path }));
});

// ============ 可用模型列表（导出共享） ============
function getAvailableModelsList() {
  return [
    { id: 'auto', name: 'Auto', provider: '系统', desc: '智能选择最优模型', tier: 'free' },
    { id: 'glm-cn/glm-5.2', name: 'GLM-5.2 主力', provider: '智谱直连', desc: '智谱大号直接干', tier: 'pro' },
    { id: 'cu/default', name: 'Cursor Auto', provider: 'Cursor', desc: 'Cursor 智能选模', tier: 'pro' },
    { id: 'cu/gpt-5.5-high-fast', name: 'GPT-5.5 Fast', provider: 'Cursor', desc: '极速旗舰', tier: 'pro' },
    { id: 'cu/gpt-5.5-high', name: 'GPT-5.5', provider: 'Cursor', desc: '顶级推理', tier: 'pro' },
    { id: 'cu/claude-4.6-opus-max', name: 'Claude 4.6 Opus Max', provider: 'Cursor', desc: '最强 Claude', tier: 'pro' },
    { id: 'cu/claude-4.6-sonnet-medium-thinking', name: 'Claude 4.6 Sonnet Think', provider: 'Cursor', desc: '新一代推理', tier: 'pro' },
    { id: 'cu/claude-4.6-opus-max-thinking', name: 'Claude 4.6 Opus Think', provider: 'Cursor', desc: '最强推理链', tier: 'pro' },
    { id: 'glm-cn/glm-5.2', name: 'GLM-5.2', provider: '智谱', desc: '中文最强', tier: 'free' },
    { id: 'bailian/deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: '百炼', desc: '最强性价比', tier: 'free' },
    { id: 'gh/gpt-5-mini', name: 'GPT-5-Mini', provider: 'OpenAI', desc: '快速免费', tier: 'free' },
    { id: 'gh/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', desc: 'GPT经典', tier: 'pro' },
    { id: 'gh/gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI', desc: '强推理', tier: 'pro' },
    { id: 'bailian/kimi-k2.7-code', name: 'Kimi K2.7 Code', provider: '百炼', desc: '长上下文', tier: 'free' },
    { id: 'openrouter/openrouter/free', name: 'Free', provider: 'OpenRouter', desc: '免费兜底', tier: 'free' },
    { id: 'cu/gpt-5.2', name: 'GPT-5.2', provider: 'Cursor', desc: 'OpenAI 旗舰', tier: 'pro' },
    { id: 'cu/gpt-5.2-codex', name: 'GPT-5.2 Codex', provider: 'Cursor', desc: '代码专精', tier: 'pro' },
    { id: 'cu/gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'Cursor', desc: '最新代码', tier: 'pro' },
    { id: 'cu/claude-4.5-sonnet', name: 'Claude 4.5 Sonnet', provider: 'Cursor', desc: 'Anthropic 平衡', tier: 'pro' },
    { id: 'cu/claude-4.5-haiku', name: 'Claude 4.5 Haiku', provider: 'Cursor', desc: 'Anthropic 快速', tier: 'pro' },
    { id: 'cu/claude-4.5-opus', name: 'Claude 4.5 Opus', provider: 'Cursor', desc: 'Anthropic 高级', tier: 'pro' },
    { id: 'cu/claude-4.5-opus-high', name: 'Claude 4.5 Opus High', provider: 'Cursor', desc: 'Anthropic 旗舰', tier: 'pro' },
    { id: 'cu/claude-4.5-sonnet-thinking', name: 'Claude 4.5 Sonnet Think', provider: 'Cursor', desc: '带推理链', tier: 'pro' },
    { id: 'cu/claude-4.5-opus-high-thinking', name: 'Claude 4.5 Opus Think', provider: 'Cursor', desc: '旗舰推理链', tier: 'pro' },
    { id: 'cu/gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'Cursor', desc: 'Google 预览', tier: 'pro' },
    { id: 'cu/kimi-k2.5', name: 'Kimi K2.5', provider: 'Cursor', desc: '月之暗面', tier: 'pro' },
  ];
}

// ============ Cursor 代理请求处理 ============
function proxyCursorRequest(reqBody, isStream, clientIp, res) {
  const modelId = reqBody.model || 'cu/default';
  console.log(`[Cursor路由] ${clientIp} → cursor-proxy: ${modelId} (stream=${isStream})`);

  const targetUrl = new URL('chat/completions', CURSOR_PROXY_URL + '/');
  const httpModule = targetUrl.protocol === 'https:' ? https : http;

  const proxyReq = httpModule.request({
    hostname: targetUrl.hostname,
    port: targetUrl.port || 80,
    path: targetUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + CURSOR_API_KEY,
      'Accept': isStream ? 'text/event-stream' : 'application/json',
    },
    timeout: 120000,
  }, (proxyRes) => {
    const statusCode = proxyRes.statusCode;
    if (statusCode !== 200) {
      let errBody = '';
      proxyRes.on('data', chunk => errBody += chunk);
      proxyRes.on('end', () => {
        console.error(`[Cursor] ❌ ${modelId} 返回 ${statusCode}: ${errBody.substring(0, 200)}`);
        if (!res.headersSent) {
          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end(errBody);
        }
      });
      return;
    }

    if (isStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      proxyRes.pipe(res).on('error', () => { if (!res.writableEnded) res.end(); });
      proxyRes.on('end', () => { if (!res.writableEnded) res.end(); });
    } else {
      res.writeHead(200, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        'Cache-Control': 'no-cache',
      });
      proxyRes.pipe(res).on('error', () => { if (!res.writableEnded) res.end(); });
      proxyRes.on('end', () => { if (!res.writableEnded) res.end(); });
    }
  });

  proxyReq.on('error', (e) => {
    console.error(`[Cursor] ❌ 请求失败: ${e.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cursor proxy error: ' + e.message }));
    }
  });
  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cursor proxy timeout' }));
    }
  });

  proxyReq.write(JSON.stringify(reqBody));
  proxyReq.end();
}

// ============ 独立运行入口 ============
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 AI 轻代理已启动: http://localhost:${PORT}`);
    console.log(`   健康检查: http://localhost:${PORT}/health`);
    for (const [id, p] of Object.entries(PROVIDERS)) {
      console.log(`   ${p.name} Key: ${p.keys.length} 个`);
    }
  });
}

export {
  server,
  unifiedRoute,
  proxyVia9Router,
  proxyCursorRequest,
  getUserPreferredModel,
  loadUserPreferences,
  setLumeActiveUser,
  updateUserModelPreference,
  ipUserMap,
  checkIpRateLimit,
  recordRequest,
  handleAdminApi,
  handleStatsApi,
  PROVIDERS,
  getAvailableModelsList,
};
