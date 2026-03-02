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
  
  if (usage) {
    stats.totalTokens += usage.total_tokens || 0;
    stats.promptTokens += usage.prompt_tokens || 0;
    stats.completionTokens += usage.completion_tokens || 0;
  }
  
  if (!stats.byProvider[provider]) {
    stats.byProvider[provider] = { requests: 0, tokens: 0 };
  }
  stats.byProvider[provider].requests++;
  stats.byProvider[provider].tokens += usage?.total_tokens || 0;
}

// ============ 代理请求（转发到后端轻代理） ============

async function proxyRequest(provider, req, res) {
  const userId = getUserId(req);
  const startTime = Date.now();
  const isStream = req.body?.stream === true;
  
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
      recordUsage(userId, provider, null);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
        res.end();
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
