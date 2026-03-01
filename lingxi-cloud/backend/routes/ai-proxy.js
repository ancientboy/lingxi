/**
 * AI 代理路由 - 集中管理大模型 API Key
 * 
 * 功能：
 * - API Key 池管理
 * - 轮询负载均衡
 * - 使用统计
 * - 故障转移
 * - 支持流式响应（SSE）
 */

import { Router } from 'express';
const router = Router();

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

// ============ 代理请求（支持流式） ============

async function proxyRequest(provider, req, res) {
  const keyInfo = getNextKey(provider);
  if (!keyInfo) {
    return res.status(503).json({ 
      error: '没有可用的 API Key',
      provider: provider.name
    });
  }

  const url = provider.baseUrl + req.path;
  const startTime = Date.now();

  // 判断是否流式请求
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
    
    // 错误处理
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
        _proxy: {
          provider: provider.name,
          keyIndex: keyInfo.index,
          duration
        }
      });
    }

    // 流式响应 - 直接透传
    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
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

    // 非流式响应 - JSON
    const data = await response.json();
    
    if (process.env.AI_PROXY_DEBUG === 'true') {
      data._proxy = {
        provider: provider.name,
        keyIndex: keyInfo.index,
        duration,
        timestamp: new Date().toISOString()
      };
    }

    res.json(data);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    markKeyError(provider, keyInfo.index, error);
    
    console.error(`[AI-Proxy] 请求失败:`, error.message);
    res.status(500).json({
      error: error.message,
      _proxy: {
        provider: provider.name,
        keyIndex: keyInfo.index,
        duration
      }
    });
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
      keys: provider.keys.map(k => ({
        index: k.index,
        enabled: k.enabled,
        usageCount: k.usageCount,
        lastUsed: k.lastUsed,
        errors: k.errors
      }))
    };
  }
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: status
  });
});

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

export default router;
