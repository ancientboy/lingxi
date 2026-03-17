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

// ============ 轮询 ============

function getNextKey(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) return null;
  
  const enabled = provider.keys.filter(k => k.enabled);
  if (!enabled.length) return null;
  
  if (!roundRobinIndex[providerId]) roundRobinIndex[providerId] = 0;
  roundRobinIndex[providerId] = (roundRobinIndex[providerId] + 1) % enabled.length;
  
  const key = enabled[roundRobinIndex[providerId]];
  key.usage = (key.usage || 0) + 1;
  
  // 异步保存
  saveConfig();
  
  return key.key;
}

// ============ 代理请求 ============

async function proxyRequest(providerId, req, res) {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: '未知的供应商' }));
  }
  
  const apiKey = getNextKey(providerId);
  if (!apiKey) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: '没有可用的 API Key' }));
  }

  const baseUrl = provider.baseUrl;
  let targetPath = req.url.replace(/^\/(api\/ai\/)?(aliyun|zhipu|dmxapi)/, '');
  // 智谱和 DMXAPI 需要去掉 /v1（baseUrl 已包含 /v1 或 /v4）
  if (providerId === 'aliyun' || providerId === 'zhipu' || providerId === 'dmxapi') {
    targetPath = targetPath.replace('/v1/', '/');
  }
  const url = new URL(baseUrl + targetPath); console.log('[代理调试] 请求 URL:', url.toString());
  
  const httpModule = url.protocol === 'https:' ? https : http;
  
  const options = {
    timeout: 120000,  // 2分钟超时
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

  // 读取请求体
  let body = '';
  for await (const chunk of req) body += chunk;

  const proxyReq = httpModule.request(options, (proxyRes) => {
    // 流式响应
    const headers = {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      'Cache-Control': proxyRes.headers['cache-control'] || 'no-cache'
    };
    res.writeHead(proxyRes.statusCode, headers);
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
        totalUsage: p.keys.reduce((s, k) => s + (k.usage || 0), 0)
      };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(status));
  }

  // 管理接口
  if (path.startsWith('/api/keys')) {
    return handleAdminApi(req, res, path);
  }

  // 路由到对应供应商
  if (path.startsWith('/api/ai/aliyun')) {
    return proxyRequest('aliyun', req, res);
  }
  if (path.startsWith('/api/ai/zhipu')) {
    return proxyRequest('zhipu', req, res);
  }
  if (path.startsWith('/api/ai/dmxapi')) {
    return proxyRequest('dmxapi', req, res);
  }

  // 未知路径
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AI 轻代理已启动: http://localhost:${PORT}`);
  console.log(`   健康检查: http://localhost:${PORT}/health`);
  for (const [id, p] of Object.entries(PROVIDERS)) {
    console.log(`   ${p.name} Key: ${p.keys.length} 个`);
  }
});
