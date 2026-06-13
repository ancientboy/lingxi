/**
 * 管理后台 - 模型配置 API
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDB } from '../../utils/db.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET;

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, '../../data/admin-config.json');

// 默认配置
const DEFAULT_CONFIG = {
  freeModels: {
    text: [
      { id: 'gpt-5.4', priority: 1, enabled: true },
      { id: 'gpt-5-pro', priority: 2, enabled: true },
      { id: 'gpt-5', priority: 3, enabled: true },
      { id: 'qwen-flash', priority: 4, enabled: true },
      { id: 'GLM-4.5-Flash', priority: 5, enabled: true },
      { id: 'Qwen3-8B', priority: 6, enabled: true },
      { id: 'glm-4-flash', priority: 7, enabled: true },
      { id: 'gpt-4o-mini', priority: 8, enabled: true }
    ],
    vision: [
      { id: 'GLM-4.1V-Thinking-Flash', priority: 1, enabled: true },
      { id: 'glm-4v-plus', priority: 2, enabled: true },
      { id: 'qwen-vl-plus', priority: 3, enabled: true }
    ]
  },
  providerKeys: {
    aliyun: { enabled: true },
    zhipu: { enabled: true }
  },
  // 积分消耗率配置
  creditRates: {
    aliyun: { 
      name: '阿里云百炼',
      models: {
        'qwen-flash': 0.3,
        'qwen3.5-plus': 0.5,
        'qwen-turbo': 0.2,
        'default': 0.3
      }
    },
    zhipu: { 
      name: '智谱 AI',
      models: {
        'glm-5': 0.3,
        'glm-4': 10,
        'glm-4-flash': 0.3,
        'default': 0.3
      }
    },
    dmxapi: {
      name: 'DMXAPI（免费）',
      models: {
        'default': 0
      }
    }
  }
};

// ============ 中间件 ============

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token 无效' });
  }
}

async function adminMiddleware(req, res, next) {
  try {
    const db = await getDB();
    const user = db.users.find(u => u.id === req.userId);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, error: '需要管理员权限' });
    }
    
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: '服务器错误' });
  }
}

const adminOnly = [authMiddleware, adminMiddleware];

// ============ 工具函数 ============

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('加载配置失败:', error);
  }
  
  // 返回默认配置并保存
  saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('保存配置失败:', error);
    return false;
  }
}

// ============ 获取配置 ============

router.get('/config', authMiddleware, adminMiddleware, (req, res) => {
  const config = loadConfig();
  res.json({ success: true, config });
});

// ============ 更新配置 ============

router.put('/config', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const config = req.body;
    
    if (!config.freeModels) {
      return res.status(400).json({ success: false, error: '配置格式错误' });
    }
    
    const success = saveConfig(config);
    
    if (success) {
      res.json({ success: true, message: '配置已保存' });
    } else {
      res.status(500).json({ success: false, error: '保存失败' });
    }
    
  } catch (error) {
    console.error('更新配置失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ============ 获取供应商状态 ============

router.get('/providers', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // 从轻代理获取状态
    const proxyUrlList = (process.env.AI_BACKEND_PROXIES || 'http://localhost:13000').split(',');
    const proxyUrl = proxyUrlList[0].trim();
    
    const providers = [];
    
    // 检查轻代理（同时返回阿里云和智谱状态）
    try {
      const proxyRes = await fetch(`${proxyUrl}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      const proxyData = await proxyRes.json();
      
      console.log('轻代理状态:', JSON.stringify(proxyData.providers, null, 2));
      
      if (proxyData.providers) {
        // 阿里云
        if (proxyData.providers.aliyun) {
          providers.push({
            id: 'aliyun',
            name: '阿里云百炼',
            healthy: proxyData.providers.aliyun.enabledKeys > 0,
            totalKeys: proxyData.providers.aliyun.totalKeys,
            availableKeys: proxyData.providers.aliyun.enabledKeys,
            todayRequests: proxyData.providers.aliyun.totalUsage,
            lastCheck: new Date().toISOString()
          });
        }
        
        // 智谱
        if (proxyData.providers.zhipu) {
          providers.push({
            id: 'zhipu',
            name: '智谱 AI',
            healthy: proxyData.providers.zhipu.enabledKeys > 0,
            totalKeys: proxyData.providers.zhipu.totalKeys,
            availableKeys: proxyData.providers.zhipu.enabledKeys,
            todayRequests: proxyData.providers.zhipu.totalUsage,
            lastCheck: new Date().toISOString()
          });
        }
      }
    } catch (e) {
      console.error('获取轻代理状态失败:', e);
      providers.push({
        id: 'aliyun',
        name: '阿里云百炼',
        healthy: false,
        totalKeys: 0,
        availableKeys: 0,
        todayRequests: 0,
        lastCheck: null,
        error: '无法连接轻代理'
      });
      providers.push({
        id: 'zhipu',
        name: '智谱 AI',
        healthy: false,
        totalKeys: 0,
        availableKeys: 0,
        todayRequests: 0,
        lastCheck: null,
        error: '无法连接轻代理'
      });
    }
    
    // DMXAPI 状态（用于免费模型）
    providers.push({
      id: 'dmxapi',
      name: 'DMXAPI（免费模型）',
      healthy: true,
      totalKeys: 1,
      availableKeys: 1,
      todayRequests: 0,
      lastCheck: new Date().toISOString()
    });
    
    res.json({ success: true, providers });
    
  } catch (error) {
    console.error('获取供应商状态失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ============ 供应商 Key 管理 ============

// 代理到轻代理（取第一个地址）
const PROXY_LITE_URLS = (process.env.AI_BACKEND_PROXIES || 'http://localhost:13000').split(',');
const PROXY_LITE_URL = PROXY_LITE_URLS[0].trim();

// 获取所有供应商 Key
router.get('/keys', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const response = await fetch(`${PROXY_LITE_URL}/api/keys`, {
      headers: { 'X-Admin-Token': process.env.PROXY_ADMIN_TOKEN || 'lingxi-admin-2026' }
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('获取 Key 列表失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 添加 Key
router.post('/keys/:provider', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { provider } = req.params;
    const { key } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: '缺少 API Key' });
    }
    
    const response = await fetch(`${PROXY_LITE_URL}/api/keys/${provider}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': process.env.PROXY_ADMIN_TOKEN || 'lingxi-admin-2026'
      },
      body: JSON.stringify({ key })
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('添加 Key 失败:', error);
    res.status(500).json({ error: '添加失败' });
  }
});

// 删除 Key
router.delete('/keys/:provider/:index', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { provider, index } = req.params;
    
    const response = await fetch(`${PROXY_LITE_URL}/api/keys/${provider}/${index}`, {
      method: 'DELETE',
      headers: {
        'X-Admin-Token': process.env.PROXY_ADMIN_TOKEN || 'lingxi-admin-2026'
      }
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('删除 Key 失败:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// 切换 Key 启用状态
router.put('/keys/:provider/:index/toggle', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { provider, index } = req.params;
    const { enabled } = req.body;
    
    const response = await fetch(`${PROXY_LITE_URL}/api/keys/${provider}/${index}/toggle`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': process.env.PROXY_ADMIN_TOKEN || 'lingxi-admin-2026'
      },
      body: JSON.stringify({ enabled })
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('切换 Key 状态失败:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// 重置 Key 使用量
router.put('/keys/:provider/:index/reset', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { provider, index } = req.params;
    
    const response = await fetch(`${PROXY_LITE_URL}/api/keys/${provider}/${index}/reset`, {
      method: 'PUT',
      headers: {
        'X-Admin-Token': process.env.PROXY_ADMIN_TOKEN || 'lingxi-admin-2026'
      }
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('重置 Key 使用量失败:', error);
    res.status(500).json({ error: '操作失败' });
  }
});

// ============ 测试供应商 ============

router.post('/providers/:provider/test', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { provider } = req.params;
    
    // 根据供应商选择测试模型和 URL
    const testConfigs = {
      aliyun: { 
        model: 'qwen3.5-plus',
        getUrl: (proxy) => `${proxy}/aliyun/chat/completions`
      },
      zhipu: { 
        model: 'glm-5',
        getUrl: (proxy) => `${proxy}/zhipu/chat/completions`
      },
      dmxapi: {
        model: 'qwen-flash',
        getUrl: () => 'https://www.dmxapi.cn/v1/chat/completions',
        direct: true,
        apiKey: process.env.DMXAPI_API_KEY || 'sk-PXD8xZEfMjx62MEbrp5zSUSoBGW3R68NHzkA6zO0UEfzaUb7'
      }
    };
    
    const config = testConfigs[provider];
    if (!config) {
      return res.json({ success: false, error: '未知供应商' });
    }
    
    const testMessage = { 
      model: config.model, 
      messages: [{ role: 'user', content: 'Hi' }], 
      max_tokens: 10 
    };
    
    const headers = { 'Content-Type': 'application/json' };
    
    // DMXAPI 直接访问，其他通过代理
    let url;
    if (config.direct) {
      url = config.getUrl();
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    } else {
      const proxyUrls = (process.env.AI_BACKEND_PROXIES || 'http://localhost:13000').split(',');
      url = config.getUrl(proxyUrls[0].trim());
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(testMessage),
      signal: AbortSignal.timeout(10000)
    });
    
    const result = await response.json();
    
    if (response.ok && result.choices) {
      res.json({ success: true, message: `${provider} 连接正常（模型: ${config.model}）` });
    } else {
      res.json({ success: false, error: result.error?.message || `HTTP ${response.status}` });
    }
    
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ============ 获取积分消耗率 ============

router.get('/credit-rates', authMiddleware, adminMiddleware, (req, res) => {
  const config = loadConfig();
  res.json({ 
    success: true, 
    creditRates: config.creditRates || DEFAULT_CONFIG.creditRates 
  });
});

// ============ 更新积分消耗率 ============

router.put('/credit-rates', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { creditRates } = req.body;
    
    if (!creditRates) {
      return res.status(400).json({ success: false, error: '缺少积分率配置' });
    }
    
    const config = loadConfig();
    config.creditRates = creditRates;
    
    const success = saveConfig(config);
    
    if (success) {
      res.json({ success: true, message: '积分消耗率已更新' });
    } else {
      res.status(500).json({ success: false, error: '保存失败' });
    }
    
  } catch (error) {
    console.error('更新积分消耗率失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

export default router;
