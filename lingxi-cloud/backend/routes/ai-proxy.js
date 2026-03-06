/**
 * AI 代理路由 - 统一入口（智能路由 + 故障转移）
 * 
 * 架构：
 * 用户 → 主代理入口 → [轻代理1, 轻代理2, 轻代理3] → AI API
 * 
 * 主代理不存储 Key，只负责路由和故障转移
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SUBSCRIPTION_PLANS, getMonthlyQuota, getDailyCredits, resetUserCredits } from '../utils/subscription-plans.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ 后端轻代理池 ============

// 轻代理地址列表（按优先级排序）
const BACKEND_PROXIES = (process.env.AI_BACKEND_PROXIES || 'http://localhost:3001')
  .split(',')
  .map(u => u.trim())
  .filter(u => u.length > 0);

// 代理健康状态
const proxyHealth = new Map();

// 初始化健康状态
for (const url of BACKEND_PROXIES) {
  proxyHealth.set(url, { healthy: true, lastCheck: null, errors: 0 });
}

// 当前使用的代理索引
let currentProxyIndex = 0;

// 获取可用的代理
function getAvailableProxy() {
  const enabledProxies = BACKEND_PROXIES.filter(url => {
    const health = proxyHealth.get(url);
    return health && health.healthy;
  });
  
  if (enabledProxies.length === 0) {
    // 所有代理都挂了，尝试重置
    console.warn('[AI-Proxy] 所有后端代理不可用，尝试重置...');
    for (const url of BACKEND_PROXIES) {
      proxyHealth.get(url).healthy = true;
    }
    return BACKEND_PROXIES[0];
  }
  
  // 轮询
  currentProxyIndex = (currentProxyIndex + 1) % enabledProxies.length;
  return enabledProxies[currentProxyIndex];
}

// 标记代理错误
function markProxyError(proxyUrl) {
  const health = proxyHealth.get(proxyUrl);
  if (health) {
    health.errors++;
    if (health.errors >= 3) {
      health.healthy = false;
      console.warn(`[AI-Proxy] 后端代理不可用: ${proxyUrl}`);
      // 5分钟后恢复
      setTimeout(() => {
        health.healthy = true;
        health.errors = 0;
        console.log(`[AI-Proxy] 后端代理已恢复: ${proxyUrl}`);
      }, 5 * 60 * 1000);
    }
  }
}

// 健康检查
async function checkProxyHealth(proxyUrl) {
  try {
    const response = await fetch(`${proxyUrl}/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    const health = proxyHealth.get(proxyUrl);
    if (health) {
      health.healthy = response.ok;
      health.lastCheck = new Date().toISOString();
    }
    return response.ok;
  } catch {
    const health = proxyHealth.get(proxyUrl);
    if (health) {
      health.healthy = false;
      health.lastCheck = new Date().toISOString();
    }
    return false;
  }
}

// 定期健康检查（每 30 秒）
setInterval(async () => {
  for (const url of BACKEND_PROXIES) {
    await checkProxyHealth(url);
  }
}, 30000);

// ============ IP 到用户映射 ============

let IP_USER_MAP = {};

function loadIpUserMap() {
  try {
    const dbPath = path.join(__dirname, '../data/db.json');
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    const userMap = {};
    for (const user of data.users || []) {
      userMap[user.id] = user.nickname;
    }
    const newMap = {};
    for (const server of data.userServers || []) {
      if (server.ip && server.userId) {
        const nickname = userMap[server.userId];
        if (nickname) newMap[server.ip] = nickname;
      }
    }
    IP_USER_MAP = newMap;
    console.log(`[AI-Proxy] 已加载 ${Object.keys(IP_USER_MAP).length} 个 IP-用户映射`);
  } catch (e) {
    console.error('[AI-Proxy] 加载 IP 映射失败:', e.message);
  }
}

loadIpUserMap();
setInterval(loadIpUserMap, 5 * 60 * 1000);

// ============ 用户识别 ============

function getUserId(req) {
  const headerUserId = req.headers['x-user-id'];
  if (headerUserId) return headerUserId;
  
  const bodyUserId = req.body?.user_id;
  if (bodyUserId) return bodyUserId;
  
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.ip
    || req.socket?.remoteAddress;
  
  const ip = clientIp?.replace(/^::ffff:/, '');
  
  if (ip && IP_USER_MAP[ip]) {
    return IP_USER_MAP[ip];
  }
  
  return ip ? `ip:${ip}` : 'anonymous';
}

// ============ 用户统计 ============

const userStats = new Map();

function getUserStats(userId) {
  if (!userStats.has(userId)) {
    userStats.set(userId, {
      requests: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      byProvider: {},
      lastRequest: null,
      knownUser: !userId.startsWith('ip:') && userId !== 'anonymous'
    });
  }
  return userStats.get(userId);
}

function recordUsage(userId, provider, usage) {
  const stats = getUserStats(userId);
  stats.requests++;
  stats.lastRequest = new Date().toISOString();
  
  const tokens = {
    input: usage?.prompt_tokens || 0,
    output: usage?.completion_tokens || 0,
    total: usage?.total_tokens || 0
  };
  
  if (usage) {
    stats.totalTokens += tokens.total;
    stats.promptTokens += tokens.input;
    stats.completionTokens += tokens.output;
  }
  
  if (!stats.byProvider[provider]) {
    stats.byProvider[provider] = { requests: 0, tokens: 0 };
  }
  stats.byProvider[provider].requests++;
  stats.byProvider[provider].tokens += tokens.total;
  
  // 一次性更新使用量和积分
  updateDbWithCredits(userId, provider, tokens).catch(err => {
    console.error("[AI-Proxy] 更新失败:", err.message);
  });
}

// 更新 db.json 中的用户使用量
// ============ 代理请求（转发到后端轻代理） ============

async function proxyRequest(provider, req, res) {
  const userId = getUserId(req);
  const startTime = Date.now();
  const isStream = req.body?.stream === true;
  
  // ========== 积分预检查 ==========
  const { getDB } = await import("../utils/db.js");
  const db = await getDB();
  const user = db.users.find(u => u.id === userId || u.nickname === userId);
  
  if (!user) {
    return res.status(401).json({ 
      error: '用户不存在',
      code: 'USER_NOT_FOUND'
    });
  }
  
  // 计算可用积分
  const credits = user.credits || { balance: user.points || 0 };
  const balance = credits.balance || 0;
  const freeRemaining = Math.max(0, (credits.freeDaily || 100) - (credits.freeDailyUsed || 0));
  const totalCredits = balance + freeRemaining;
  
  // 积分为0时才拦截
  if (totalCredits <= 0) {
    console.log(`[积分检查] ${user.nickname} 积分不足: ${totalCredits}`);
    return res.status(402).json({
      error: '积分不足，请订阅或充值以继续',
      code: 'INSUFFICIENT_CREDITS'
    });
  }
  
  console.log(`[积分检查] ${user.nickname} 可用积分: ${totalCredits} (余额:${balance}, 免费:${freeRemaining})`);
  // ========== 积分预检查结束 =========

  // 获取可用的后端代理
  const backendProxy = getAvailableProxy();
  
  try {
    const url = `${backendProxy}/${provider}${req.path}`;
    
    const fetchOptions = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (req.method !== 'GET' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      // 标记代理错误
      if (response.status >= 500) {
        markProxyError(backendProxy);
      }
      
      const errorText = await response.text();
      let errorData;
      try { errorData = JSON.parse(errorText); } catch { errorData = { error: errorText }; }
      
      return res.status(response.status).json({
        ...errorData,
        _proxy: { backend: backendProxy, duration, userId }
      });
    }

    // 流式响应
    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let lastUsage = null;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
          
          // 解析 SSE 数据，提取 usage
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.usage) {
                  lastUsage = data.usage;
                }
              } catch {}
            }
          }
        }
        res.end();
        
        // 记录使用量（使用解析出的 usage）
        if (lastUsage) {
          recordUsage(userId, provider, lastUsage);
        } else {
          recordUsage(userId, provider, null);
        }
      } catch { res.end(); }
      return;
    }

    // 非流式响应
    const data = await response.json();
    if (data.usage) {
      recordUsage(userId, provider, data.usage);
    }
    
    res.json(data);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    markProxyError(backendProxy);
    
    console.error(`[AI-Proxy] 请求失败:`, error.message);
    res.status(500).json({
      error: error.message,
      _proxy: { backend: backendProxy, duration, userId }
    });
  }
}

// ============ 路由 ============

router.get('/health', (req, res) => {
  const backendStatus = {};
  for (const [url, health] of proxyHealth.entries()) {
    backendStatus[url] = health;
  }
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mode: 'router',
    backendProxies: BACKEND_PROXIES.length,
    backends: backendStatus,
    ipMappings: Object.keys(IP_USER_MAP).length
  });
});

router.get('/ip-mappings', (req, res) => {
  res.json({ 
    timestamp: new Date().toISOString(), 
    count: Object.keys(IP_USER_MAP).length, 
    mappings: IP_USER_MAP 
  });
});

router.post('/refresh-mappings', (req, res) => {
  loadIpUserMap();
  res.json({ success: true, count: Object.keys(IP_USER_MAP).length, mappings: IP_USER_MAP });
});

router.get('/stats/:userId?', (req, res) => {
  const userId = req.params.userId;
  if (userId) {
    const stats = userStats.get(userId);
    return res.json({ userId, ...(stats || { requests: 0, totalTokens: 0 }) });
  }
  
  const allStats = {};
  const sortedUsers = [...userStats.entries()].sort((a, b) => {
    if (a[1].knownUser && !b[1].knownUser) return -1;
    if (!a[1].knownUser && b[1].knownUser) return 1;
    return b[1].requests - a[1].requests;
  });
  for (const [uid, stats] of sortedUsers) { allStats[uid] = stats; }
  
  res.json({ 
    timestamp: new Date().toISOString(), 
    totalUsers: userStats.size, 
    ipMappings: Object.keys(IP_USER_MAP).length, 
    users: allStats 
  });
});

// 代理路由
router.use('/aliyun', (req, res) => { proxyRequest('aliyun', req, res); });
router.use('/zhipu', (req, res) => { proxyRequest('zhipu', req, res); });

router.post('/v1/chat/completions', (req, res) => {
  const model = req.body?.model || '';
  req.path = '/chat/completions';
  if (model.includes('glm') || model.includes('chatglm')) {
    return proxyRequest('zhipu', req, res);
  }
  return proxyRequest('aliyun', req, res);
});

export default router;

// ============ 积分消耗规则 ============

// 按 provider 分类的积分消耗率（积分/1K tokens）
const CREDIT_RATES = {
  // 国产模型（1积分 ≈ ¥0.01）
  // 基础模型（性价比高）
  aliyun: 0.3,           // 通义千问-Turbo: ¥0.002/1K → 0.2积分，加缓冲 0.3
  'aliyun-plus': 0.5,    // 通义千问-Plus: ¥0.004/1K → 0.4积分，加缓冲 0.5
  
  // 智谱模型
  'zhipu-turbo': 0.2,    // GLM-3-Turbo: ¥0.001/1K → 0.1积分，加缓冲 0.2
  'zhipu-flash': 0.2,    // GLM-4-Flash: ¥0.001/1K → 0.1积分，加缓冲 0.2
  'zhipu-4': 10,         // GLM-4: ¥0.1/1K → 10积分
  zhipu: 0.3,            // 默认智谱（GLM-5等中等模型）: 0.3积分
  
  // 国际模型（未来支持）
  'openai-gpt35': 0.4,   // GPT-3.5: ¥0.004/1K → 0.4积分
  'openai-gpt4': 25,     // GPT-4: ¥0.25/1K → 25积分
  anthropic: 20,         // Claude: ¥0.20/1K → 20积分
};

// 免费用户每日额度
const FREE_DAILY_CREDITS = 100;

// 计算积分消耗
function calculateCredits(provider, tokens) {
  const rate = CREDIT_RATES[provider] || 1;
  return Math.ceil((tokens / 1000) * rate);
}

// 检查并扣除积分
async function updateDbWithCredits(userId, provider, tokens) {
  try {
    const { getDB, saveDB } = await import("../utils/db.js");
    const db = await getDB();
    
    // 查找用户
    let user = db.users.find(u => u.id === userId || u.nickname === userId);
    
    // IP 映射查找
    if (!user && userId.startsWith("ip:")) {
      const ip = userId.replace("ip:", "");
      const nickname = IP_USER_MAP[ip];
      if (nickname) {
        user = db.users.find(u => u.nickname === nickname);
      }
    }
    
    if (!user) {
      console.log(`[更新] 未找到用户: ${userId}`);
      return;
    }
    
    const today = new Date().toISOString().split("T")[0];
    
    // 1. 更新使用量
    if (!user.usage) {
      user.usage = { totalTokens: 0, totalRequests: 0, byModel: {}, byDate: {} };
    }
    
    user.usage.totalTokens += tokens.total;
    user.usage.totalRequests += 1;
    
    if (!user.usage.byModel[provider]) {
      user.usage.byModel[provider] = { tokens: 0, requests: 0 };
    }
    user.usage.byModel[provider].tokens += tokens.total;
    user.usage.byModel[provider].requests += 1;
    
    if (!user.usage.byDate[today]) {
      user.usage.byDate[today] = { tokens: 0, requests: 0 };
    }
    user.usage.byDate[today].tokens += tokens.total;
    user.usage.byDate[today].requests += 1;
    
    user.usage.lastUpdated = new Date().toISOString();
    
    // 2. 扣除积分
    if (tokens.total > 0) {
      const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
      
      // 初始化 credits
      if (!user.credits) {
        const plan = user.subscription?.plan || 'free';
        resetUserCredits(user, plan);
      }
      
      // 🔍 检查月度重置（订阅套餐）
      const plan = user.subscription?.plan || 'free';
      const monthlyQuota = getMonthlyQuota(plan);
      
      if (monthlyQuota > 0 && user.credits.lastMonthlyReset !== currentMonth) {
        // 月度重置
        user.credits.balance = monthlyQuota;
        user.credits.monthlyQuota = monthlyQuota;
        user.credits.lastMonthlyReset = currentMonth;
        user.points = monthlyQuota;
        console.log(`[积分] ${user.nickname} 月度积分已重置: ${monthlyQuota}`);
      }
      
      // 🔍 检查每日重置（免费用户）
      if (user.credits.lastDailyReset !== today) {
        const dailyCredits = getDailyCredits(plan);
        user.credits.freeDaily = dailyCredits;
        user.credits.freeDailyUsed = 0;
        user.credits.lastDailyReset = today;
        if (dailyCredits > 0) {
          console.log(`[积分] ${user.nickname} 每日免费积分已重置: ${dailyCredits}`);
        }
      }
      
      // 计算积分
      const creditsNeeded = calculateCredits(provider, tokens.total);
      const freeRemaining = Math.max(0, user.credits.freeDaily - user.credits.freeDailyUsed);
      
      if (freeRemaining >= creditsNeeded) {
        // 从免费额度扣除
        user.credits.freeDailyUsed += creditsNeeded;
        console.log(`[积分] ${user.nickname} 使用免费额度 ${creditsNeeded} 积分`);
      } else {
        // 免费额度不足，使用余额
        const fromFree = freeRemaining;
        const fromBalance = creditsNeeded - fromFree;
        
        // 先用完免费额度
        user.credits.freeDailyUsed = user.credits.freeDaily;
        
        // 再扣除余额（即使不够也扣到0）
        const actualFromBalance = Math.min(fromBalance, user.credits.balance);
        user.credits.balance -= actualFromBalance;
        user.points = user.credits.balance;  // 同步
        
        const actualDeducted = fromFree + actualFromBalance;
        console.log(`[积分] ${user.nickname} 扣除 ${actualDeducted}/${creditsNeeded} 积分 (免费 ${fromFree} + 余额 ${actualFromBalance})`);
        
        if (actualFromBalance < fromBalance) {
          console.log(`[积分] ${user.nickname} 积分不足，已扣完所有可用积分`);
        }
      }
    }
    
    // 3. 一次性保存
    await saveDB(db);
    console.log(`[更新] ${user.nickname} 使用量已更新: +${tokens.total} tokens`);
    
  } catch (err) {
    console.error("[更新] 失败:", err);
  }
}
