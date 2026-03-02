#!/usr/bin/env node
/**
 * AI 轻量代理服务
 * 
 * 独立部署，只做一件事：转发请求 + Key 池轮询
 * 
 * 启动：node ai-proxy-lite.js --port 3001
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

// ============ 配置 ============

const PORT = process.env.PROXY_LITE_PORT || process.argv.includes('--port') 
  ? process.argv[process.argv.indexOf('--port') + 1] 
  : 3001;

const API_KEYS = {
  aliyun: (process.env.DASHSCOPE_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean),
  zhipu: (process.env.ZHIPU_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)
};

const PROVIDERS = {
  aliyun: {
    name: '阿里云',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keys: API_KEYS.aliyun.map((key, i) => ({ key, index: i, enabled: true, usage: 0 })),
    currentIndex: 0
  },
  zhipu: {
    name: '智谱',
    baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
    keys: API_KEYS.zhipu.map((key, i) => ({ key, index: i, enabled: true, usage: 0 })),
    currentIndex: 0
  }
};

// ============ 轮询 ============

function getNextKey(provider) {
  const enabled = provider.keys.filter(k => k.enabled);
  if (!enabled.length) return null;
  provider.currentIndex = (provider.currentIndex + 1) % enabled.length;
  const key = enabled[provider.currentIndex];
  key.usage++;
  return key.key;
}

// ============ 代理请求 ============

async function proxyRequest(provider, req, res) {
  const apiKey = getNextKey(provider);
  if (!apiKey) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: '没有可用的 API Key' }));
  }

  const url = new URL(provider.baseUrl + req.url.replace(/^\/(aliyun|zhipu)/, ''));
  
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }
  };

  // 读取请求体
  let body = '';
  for await (const chunk of req) body += chunk;

  const proxyReq = https.request(options, (proxyRes) => {
    // 流式响应
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      'Cache-Control': proxyRes.headers['cache-control'] || 'no-cache'
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error(`[轻代理] 请求失败:`, e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
}

// ============ HTTP 服务 ============

const server = http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];

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
        totalUsage: p.keys.reduce((s, k) => s + k.usage, 0)
      };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(status));
  }

  // 路由到对应供应商
  if (path.startsWith('/aliyun')) {
    return proxyRequest(PROVIDERS.aliyun, req, res);
  }
  if (path.startsWith('/zhipu')) {
    return proxyRequest(PROVIDERS.zhipu, req, res);
  }

  // 未知路径
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`🚀 AI 轻代理已启动: http://localhost:${PORT}`);
  console.log(`   健康检查: http://localhost:${PORT}/health`);
  console.log(`   阿里云 Key: ${PROVIDERS.aliyun.keys.length} 个`);
  console.log(`   智谱 Key: ${PROVIDERS.zhipu.keys.length} 个`);
});
