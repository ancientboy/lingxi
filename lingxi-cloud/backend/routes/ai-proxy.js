/**
 * AI 代理路由 - 集中管理大模型 API Key
 * 
 * 功能：
 * - API Key 池管理
 * - 轮询负载均衡
 * - 用户使用统计（次数 + Token）
 * - IP 识别用户
 * - 故障转移
 * - 支持流式响应（SSE）
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ IP 到用户映射 ============

let IP_USER_MAP = {};

function loadIpUserMap() {
  try {
    const dbPath = path.join(__dirname, '../data/db.json');
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    
    // 建立 userId -> nickname 映射
    const userMap = {};
    for (const user of data.users || []) {
      userMap[user.id] = user.nickname;
    }
    
    // 建立 IP -> nickname 映射
    const newMap = {};
    for (const server of data.userServers || []) {
      if (server.ip && server.userId) {
        const nickname = userMap[server.userId];
        if (nickname) {
          newMap[server.ip] = nickname;
        }
      }
    }
    
    IP_USER_MAP = newMap;
    console.log(`[AI-Proxy] 已加载 ${Object.keys(IP_USER_MAP).length} 个 IP-用户映射`);
  } catch (e) {
    console.error('[AI-Proxy] 加载 IP 映射失败:', e.message);
  }
}

// 启动时加载
loadIpUserMap();

// 定期刷新（每 5 分钟）
setInterval(loadIpUserMap, 5 * 60 * 1000);

// ============ 配置 ============

const PROXY_BASE_URLS = (process.env.AI_PROXY_URLS || 'http://120.55.192.144:3000')
  .split(',')
  .map(u => u.trim())
  .filter(u => u.length > 0);

// ============ Key 池管理 ============

function parseKeyPool(envValue) {
  if (!envValue) return [];
  return envValue.split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0)
    .map((key, index) => ({
      key,
      index,
      enabled: true,
      usageCount: 0,
      totalTokens: 0,
      lastUsed: null,
      errors: 0,
      lastError: null
    }));
}

const PROVIDERS = {
  aliyun: {
    name: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keys: parseKeyPool(process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEYS),
    currentIndex: 0
  },
  zhipu: {
    name: '智谱',
    baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
    keys: parseKeyPool(process.env.ZHIPU_API_KEY || process.env.ZHIPU_API_KEYS),
    currentIndex: 0
  }
};

// ============ 用户识别 ============

function getUserId(req) {
  // 1. 优先使用 header 中的 x-user-id
  const headerUserId = req.headers['x-user-id'];
  if (headerUserId) return headerUserId;
  
  // 2. 从 body 中获取
  const bodyUserId = req.body?.user_id;
  if (bodyUserId) return bodyUserId;
  
  // 3. 根据 IP 识别
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.ip
    || req.socket?.remoteAddress;
  
  // 处理 IPv6 映射的 IPv4
  const ip = clientIp?.replace(/^::ffff:/, '');
  
  if (ip && IP_USER_MAP[ip]) {
    return IP_USER_MAP[ip];
  }
  
  // 4. 返回 IP 作为匿名标识
  return ip ? `ip:${ip}` : 'anonymous';
}

// ============ 用户使用统计 ============

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

// ============ 轮询算法 ============

function getNextKey(provider) {
  const enabledKeys = provider.keys.filter(k => k.enabled);
  if (enabledKeys.length === 0) return null;
  
  provider.currentIndex = (provider.currentIndex + 1) % enabledKeys.length;
  const key = enabledKeys[provider.currentIndex];
  
  key.usageCount++;
  key.lastUsed = new Date().toISOString();
  
  return key;
}

function markKeyError(provider, keyIndex, error) {
  const key = provider.keys.find(k => k.index === keyIndex);
  if (!key) return;
  
  key.errors++;
  key.lastError = { time: new Date().toISOString(), message: error.message || String(error) };
  
  if (key.errors >= 3) {
    key.enabled = false;
    console.warn(`[AI-Proxy] Key #${keyIndex} 已禁用（连续错误 ${key.errors} 次）`);
    setTimeout(() => { key.enabled = true; key.errors = 0; console.log(`[AI-Proxy] Key #${keyIndex} 已恢复`); }, 5 * 60 * 1000);
  }
}

// ============ 代理请求 ============

async function proxyRequest(provider, req, res) {
  const keyInfo = getNextKey(provider);
  if (!keyInfo) {
    return res.status(503).json({ error: '没有可用的 API Key', provider: provider.name });
  }

  const userId = getUserId(req);
  const url = provider.baseUrl + req.path;
  const startTime = Date.now();
  const isStream = req.body?.stream === true;
  
  try {
    const fetchOptions = {
      method: req.method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keyInfo.key}` }
    };
    
    if (req.method !== 'GET' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try { errorData = JSON.parse(errorText); } catch { errorData = { error: errorText }; }
      
      if (response.status === 401 || response.status === 403) {
        markKeyError(provider, keyInfo.index, new Error(`HTTP ${response.status}`));
      }
      
      return res.status(response.status).json({ ...errorData, _proxy: { provider: provider.name, keyIndex: keyInfo.index, duration, userId } });
    }

    // 流式响应
    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      recordUsage(userId, provider.name, null);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
        res.end();
      } catch (e) { res.end(); }
      return;
    }

    // 非流式响应
    const data = await response.json();
    if (data.usage) {
      recordUsage(userId, provider.name, data.usage);
      keyInfo.totalTokens += data.usage.total_tokens || 0;
    }
    if (process.env.AI_PROXY_DEBUG === 'true') {
      data._proxy = { provider: provider.name, keyIndex: keyInfo.index, duration, userId };
    }
    res.json(data);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    markKeyError(provider, keyInfo.index, error);
    console.error(`[AI-Proxy] 请求失败:`, error.message);
    res.status(500).json({ error: error.message, _proxy: { provider: provider.name, keyIndex: keyInfo.index, duration, userId } });
  }
}

// ============ 路由 ============

router.get('/health', (req, res) => {
  const status = {};
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    const enabledKeys = provider.keys.filter(k => k.enabled);
    status[id] = {
      name: provider.name,
      totalKeys: provider.keys.length,
      enabledKeys: enabledKeys.length,
      totalUsage: provider.keys.reduce((sum, k) => sum + k.usageCount, 0),
      totalTokens: provider.keys.reduce((sum, k) => sum + k.totalTokens, 0),
      keys: provider.keys.map(k => ({ index: k.index, enabled: k.enabled, usageCount: k.usageCount, totalTokens: k.totalTokens, lastUsed: k.lastUsed, errors: k.errors }))
    };
  }
  res.json({ status: 'ok', timestamp: new Date().toISOString(), proxyUrls: PROXY_BASE_URLS, ipMappings: Object.keys(IP_USER_MAP).length, providers: status });
});

router.get('/ip-mappings', (req, res) => {
  res.json({ timestamp: new Date().toISOString(), count: Object.keys(IP_USER_MAP).length, mappings: IP_USER_MAP });
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
  
  res.json({ timestamp: new Date().toISOString(), totalUsers: userStats.size, ipMappings: Object.keys(IP_USER_MAP).length, users: allStats });
});

router.use('/aliyun', (req, res) => { proxyRequest(PROVIDERS.aliyun, req, res); });
router.use('/zhipu', (req, res) => { proxyRequest(PROVIDERS.zhipu, req, res); });

router.post('/v1/chat/completions', (req, res) => {
  const model = req.body?.model || '';
  req.path = '/chat/completions';
  if (model.includes('glm') || model.includes('chatglm')) {
    return proxyRequest(PROVIDERS.zhipu, req, res);
  }
  return proxyRequest(PROVIDERS.aliyun, req, res);
});

export default router;
