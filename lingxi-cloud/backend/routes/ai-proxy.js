/**
 * AI 代理路由 - 集中管理大模型 API Key
 * 
 * 功能：
 * - API Key 池管理
 * - 轮询负载均衡
 * - 用户使用统计（次数 + Token）
 * - 故障转移
 * - 支持流式响应（SSE）
 */

import { Router } from 'express';
const router = Router();

// ============ 配置 ============

// 代理服务器地址（支持多个，逗号分隔，自动故障转移）
const PROXY_BASE_URLS = (process.env.AI_PROXY_URLS || 'http://120.55.192.144:3000')
  .split(',')
  .map(u => u.trim())
  .filter(u => u.length > 0);

// 当前主代理索引
let currentProxyIndex = 0;

function getProxyUrl() {
  return PROXY_BASE_URLS[currentProxyIndex];
}

// 切换到备用代理
function switchToBackup() {
  if (PROXY_BASE_URLS.length > 1) {
    currentProxyIndex = (currentProxyIndex + 1) % PROXY_BASE_URLS.length;
    console.log(`[AI-Proxy] 切换到备用代理: ${getProxyUrl()}`);
  }
}

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

// ============ 用户使用统计 ============

// 内存存储（生产环境可改用 Redis）
const userStats = new Map();

function getUserStats(userId) {
  if (!userStats.has(userId)) {
    userStats.set(userId, {
      requests: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      byProvider: {},
      lastRequest: null
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
  
  // 按供应商统计
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
  key.lastError = {
    time: new Date().toISOString(),
    message: error.message || String(error)
  };
  
  if (key.errors >= 3) {
    key.enabled = false;
    console.warn(`[AI-Proxy] Key #${keyIndex} 已禁用（连续错误 ${key.errors} 次）`);
    
    setTimeout(() => {
      key.enabled = true;
      key.errors = 0;
      console.log(`[AI-Proxy] Key #${keyIndex} 已恢复`);
    }, 5 * 60 * 1000);
  }
}

// ============ 代理请求 ============

async function proxyRequest(provider, req, res) {
  const keyInfo = getNextKey(provider);
  if (!keyInfo) {
    return res.status(503).json({ 
      error: '没有可用的 API Key',
      provider: provider.name
    });
  }

  // 获取用户标识（从 header 或 body 中）
  const userId = req.headers['x-user-id'] || req.body?.user_id || 'anonymous';
  
  const url = provider.baseUrl + req.path;
  const startTime = Date.now();
  const isStream = req.body?.stream === true;
  
  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keyInfo.key}`
      }
    };
    
    if (req.method !== 'GET' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      if (response.status === 401 || response.status === 403) {
        markKeyError(provider, keyInfo.index, new Error(`HTTP ${response.status}`));
      }
      
      return res.status(response.status).json({
        ...errorData,
        _proxy: { provider: provider.name, keyIndex: keyInfo.index, duration }
      });
    }

    // 流式响应
    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // 流式请求记录（无法精确统计 token）
      recordUsage(userId, provider.name, null);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
        res.end();
      } catch (streamError) {
        console.error('[AI-Proxy] 流式传输错误:', streamError.message);
        res.end();
      }
      return;
    }

    // 非流式响应
    const data = await response.json();
    
    // 记录使用量
    if (data.usage) {
      recordUsage(userId, provider.name, data.usage);
      keyInfo.totalTokens += data.usage.total_tokens || 0;
    }
    
    if (process.env.AI_PROXY_DEBUG === 'true') {
      data._proxy = {
        provider: provider.name,
        keyIndex: keyInfo.index,
        duration,
        userId
      };
    }

    res.json(data);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    markKeyError(provider, keyInfo.index, error);
    
    console.error(`[AI-Proxy] 请求失败:`, error.message);
    res.status(500).json({
      error: error.message,
      _proxy: { provider: provider.name, keyIndex: keyInfo.index, duration }
    });
  }
}

// ============ 路由 ============

// 健康检查
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
      keys: provider.keys.map(k => ({
        index: k.index,
        enabled: k.enabled,
        usageCount: k.usageCount,
        totalTokens: k.totalTokens,
        lastUsed: k.lastUsed,
        errors: k.errors
      }))
    };
  }
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    proxyUrl: getProxyUrl(),
    proxyUrls: PROXY_BASE_URLS,
    providers: status
  });
});

// 用户使用统计
router.get('/stats/:userId?', (req, res) => {
  const userId = req.params.userId;
  
  if (userId) {
    const stats = userStats.get(userId);
    if (!stats) {
      return res.json({ userId, requests: 0, totalTokens: 0 });
    }
    return res.json({ userId, ...stats });
  }
  
  // 返回所有用户统计
  const allStats = {};
  for (const [uid, stats] of userStats.entries()) {
    allStats[uid] = stats;
  }
  
  res.json({
    timestamp: new Date().toISOString(),
    totalUsers: userStats.size,
    users: allStats
  });
});

// 代理路由
router.use('/aliyun', (req, res) => {
  proxyRequest(PROVIDERS.aliyun, req, res);
});

router.use('/zhipu', (req, res) => {
  proxyRequest(PROVIDERS.zhipu, req, res);
});

router.post('/v1/chat/completions', (req, res) => {
  const model = req.body?.model || '';
  
  if (model.includes('qwen') || model.includes('通义')) {
    req.path = '/chat/completions';
    return proxyRequest(PROVIDERS.aliyun, req, res);
  } else if (model.includes('glm') || model.includes('chatglm')) {
    req.path = '/chat/completions';
    return proxyRequest(PROVIDERS.zhipu, req, res);
  }
  
  req.path = '/chat/completions';
  return proxyRequest(PROVIDERS.aliyun, req, res);
});

// 导出代理 URL（供 deploy.js 使用）
export function getProxyBaseUrl() {
  return getProxyUrl();
}

export default router;
