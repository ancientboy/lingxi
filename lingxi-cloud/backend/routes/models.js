/**
 * 模型管理 API
 * 
 * GET  /api/models/list          → 可用模型列表（官方池+用户私有）
 * GET  /api/models/preference    → 获取用户偏好模型
 * POST /api/models/preference    → 设置用户偏好模型
 * GET  /api/user/keys            → 获取用户的 API Key
 * POST /api/user/keys            → 添加用户 Key
 * DELETE /api/user/keys/:provider/:index → 删除 Key
 * PUT  /api/user/keys/:provider/:index/toggle → 启用/禁用 Key
 */
import { Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { callOpenClawRPC } from '../utils/openclaw-rpc.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'db.json');

// 默认官方模型池
const DEFAULT_MODEL_POOL = [
  // 百炼 Token Plan
  { id: 'bailian/qwen3.7-plus', name: '千问3.7 Plus', provider: 'bailian-token-plan', providerName: '百炼 Token Plan', capabilities: ['text', 'image', 'reasoning'], contextWindow: 1000000, maxTokens: 65536, tier: 'pro', enabled: true, official: true },
  { id: 'bailian/qwen3.7-max', name: '千问3.7 Max', provider: 'bailian-token-plan', providerName: '百炼 Token Plan', capabilities: ['text', 'reasoning'], contextWindow: 1000000, maxTokens: 65536, tier: 'pro', enabled: true, official: true },
  { id: 'bailian/qwen3.6-plus', name: '千问3.6 Plus', provider: 'bailian-token-plan', providerName: '百炼 Token Plan', capabilities: ['text', 'image', 'reasoning'], contextWindow: 1000000, maxTokens: 65536, tier: 'pro', enabled: true, official: true },
  { id: 'bailian/qwen3.6-flash', name: '千问3.6 Flash', provider: 'bailian-token-plan', providerName: '百炼 Token Plan', capabilities: ['text', 'image'], contextWindow: 1000000, maxTokens: 32768, tier: 'free', enabled: true, official: true },
  { id: 'bailian/deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'bailian-token-plan', providerName: '百炼 Token Plan', capabilities: ['text', 'reasoning'], contextWindow: 163840, maxTokens: 32768, tier: 'pro', enabled: true, official: true },
  { id: 'bailian/kimi-k2.7-code', name: 'Kimi K2.7 Code', provider: 'bailian-token-plan', providerName: '百炼 Token Plan', capabilities: ['text', 'image', 'reasoning'], contextWindow: 262144, maxTokens: 32768, tier: 'pro', enabled: true, official: true },
  { id: 'bailian/glm-5.2', name: 'GLM-5.2', provider: 'bailian-token-plan', providerName: '百炼 Token Plan', capabilities: ['text', 'reasoning'], contextWindow: 1000000, maxTokens: 16384, tier: 'pro', enabled: true, official: true },
  // 九路由
  { id: '9router/kimi/kimi-k2.7', name: 'Kimi K2.7', provider: '9router', providerName: '九路由', capabilities: ['text', 'reasoning'], contextWindow: 256000, maxTokens: 8192, tier: 'pro', enabled: true, official: true },
  { id: '9router/gh/gpt-4o', name: 'GPT-4o', provider: '9router', providerName: '九路由', capabilities: ['text', 'image'], contextWindow: 128000, maxTokens: 4096, tier: 'pro', enabled: true, official: true },
  { id: '9router/gh/gpt-4.1', name: 'GPT-4.1', provider: '9router', providerName: '九路由', capabilities: ['text', 'image'], contextWindow: 128000, maxTokens: 32768, tier: 'pro', enabled: true, official: true },
  // 智谱直连
  { id: 'zhipu/glm-5.2', name: 'GLM-5.2 (智谱直连)', provider: 'zhipu', providerName: '智谱 AI', capabilities: ['text', 'reasoning'], contextWindow: 200000, maxTokens: 8192, tier: 'free', enabled: true, official: true },
  { id: 'zhipu/glm-5', name: 'GLM-5 (智谱)', provider: 'zhipu', providerName: '智谱 AI', capabilities: ['text', 'reasoning'], contextWindow: 200000, maxTokens: 8192, tier: 'free', enabled: true, official: true },
  { id: 'zhipu/glm-4.7', name: 'GLM-4.7 (智谱)', provider: 'zhipu', providerName: '智谱 AI', capabilities: ['text'], contextWindow: 200000, maxTokens: 8192, tier: 'free', enabled: true, official: true },
  // 阿里云百炼
  { id: 'alibaba-cloud/qwen3.5-plus', name: '千问3.5 Plus', provider: 'alibaba-cloud', providerName: '阿里云百炼', capabilities: ['text', 'image', 'reasoning'], contextWindow: 262144, maxTokens: 65536, tier: 'pro', enabled: true, official: true },
  { id: 'alibaba-cloud/qwen3-max-2026-01-23', name: '千问3 Max', provider: 'alibaba-cloud', providerName: '阿里云百炼', capabilities: ['text', 'reasoning'], contextWindow: 262144, maxTokens: 65536, tier: 'pro', enabled: true, official: true },
  { id: 'alibaba-cloud/kimi-k2.5', name: 'Kimi K2.5', provider: 'alibaba-cloud', providerName: '阿里云百炼', capabilities: ['text', 'image', 'reasoning'], contextWindow: 128000, maxTokens: 8192, tier: 'pro', enabled: true, official: true },
  // GitHub Copilot 免费
  { id: 'github-copilot/gpt-4o', name: 'GPT-4o (Copilot)', provider: 'github-copilot', providerName: 'GitHub Copilot', capabilities: ['text', 'image'], contextWindow: 128000, maxTokens: 4096, tier: 'free', enabled: true, official: true },
  { id: 'github-copilot/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'github-copilot', providerName: 'GitHub Copilot', capabilities: ['text', 'image'], contextWindow: 128000, maxTokens: 4096, tier: 'free', enabled: true, official: true },
];

// 读取/写入 db.json
async function getDB() {
  if (!fsSync.existsSync(dbPath)) return { users: [], modelPool: DEFAULT_MODEL_POOL };
  const data = await fs.readFile(dbPath, 'utf-8');
  return JSON.parse(data);
}

async function saveDB(db) {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

// ============ 模型列表 ============

/**
 * 检测用户 OpenClaw 已配置的模型
 * 通过 RPC 查询用户 OpenClaw 的 models.providers 配置
 */
async function detectUserOpenClawModels(userServer) {
  if (!userServer?.ip || !userServer?.openclawPort) return null;
  
  try {
    // 查询用户 OpenClaw 的 provider 配置
    const configResult = await callOpenClawRPC(userServer, 'config.get', { path: 'models.providers' }, { timeout: 8000 });
    
    if (!configResult?.ok || !configResult?.parsed) return null;
    
    const providers = configResult.parsed;
    const detectedModels = [];
    
    for (const [providerId, providerConfig] of Object.entries(providers)) {
      // 跳过 lume provider（这是我们注入的，不是用户自己的）
      if (providerId === 'lume') continue;
      
      const models = providerConfig.models || [];
      for (const m of models) {
        detectedModels.push({
          id: `${providerId}/${m.id}`,
          name: m.name || m.id,
          provider: providerId,
          providerName: '我的模型',  // 统一分组名，前端显示在分组标题
          desc: providerId,  // 副标题显示实际 provider，如 "zhipu"
          capabilities: m.input || ['text'],
          contextWindow: m.contextWindow || 128000,
          maxTokens: m.maxTokens || 8192,
          tier: 'user',  // 标记为用户自有模型，不受订阅限制
          source: 'openclaw',  // 来源标记
          enabled: true,
          official: false
        });
      }
    }
    
    console.log(`[models] 检测到用户 OpenClaw ${detectedModels.length} 个自有模型`);
    return detectedModels;
  } catch (e) {
    console.warn('[models] 检测用户 OpenClaw 模型失败:', e.message);
    return null;
  }
}

router.get('/list', async (req, res) => {
  try {
    const { userId, detectOpenClaw } = req.query;
    const db = await getDB();
    
    // 官方模型池
    const pool = db.modelPool || DEFAULT_MODEL_POOL;
    const officialModels = pool.filter(m => m.enabled !== false);
    
    // 获取用户偏好
    let preference = null;
    if (userId) {
      const user = db.users?.find(u => u.id === userId);
      preference = user?.modelPreference || null;
    }
    
    // 获取用户自定义 Key（如果有）
    const userKeys = userId ? db.userKeys?.[userId] || {} : {};
    
    // 按 provider 分组
    const providers = {};
    for (const m of officialModels) {
      const p = m.provider;
      if (!providers[p]) {
        providers[p] = { name: m.providerName, provider: p, models: [] };
      }
      providers[p].models.push({
        id: m.id,
        name: m.name,
        capabilities: m.capabilities || ['text'],
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
        tier: m.tier || 'free',
        hasUserKey: !!userKeys[p]
      });
    }
    
    // 检测用户 OpenClaw 已配置的模型（可选）
    let openclawModels = null;
    if (detectOpenClaw === 'true' && userId) {
      const user = db.users?.find(u => u.id === userId);
      const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
      if (server) {
        openclawModels = await detectUserOpenClawModels(server);
        if (openclawModels?.length) {
          // 将用户 OpenClaw 模型合并到 providers 列表
          for (const m of openclawModels) {
            const p = m.provider;
            if (!providers[p]) {
              providers[p] = { name: m.providerName, provider: p, models: [] };
            }
            // 避免重复添加
            if (!providers[p].models.find(em => em.id === m.id)) {
              providers[p].models.push({
                ...m,
                hasUserKey: true  // 用户 OpenClaw 已配置，视为有 key
              });
            }
          }
        }
      }
    }
    
    res.json({
      preference,
      providers: Object.values(providers),
      userKeys: Object.keys(userKeys),
      hasOpenClawModels: !!openclawModels?.length
    });
  } catch (e) {
    console.error('[models] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ 用户模型偏好 ============

router.get('/preference', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    
    const db = await getDB();
    const user = db.users?.find(u => u.id === userId);
    
    res.json({
      preference: user?.modelPreference || 'auto',
      userId
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/preference', async (req, res) => {
  try {
    const { userId, modelId } = req.body;
    if (!userId || !modelId) return res.status(400).json({ error: 'userId and modelId required' });
    
    const db = await getDB();
    const user = db.users?.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'user not found' });
    
    user.modelPreference = modelId;
    user.modelPreferenceUpdatedAt = new Date().toISOString();
    
    await saveDB(db);
    console.log(`[models] user ${user.nickname} preference → ${modelId}`);
    
    res.json({ success: true, preference: modelId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ 用户 API Key 管理 ============

router.get('/user/keys', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    
    const db = await getDB();
    const keys = db.userKeys?.[userId] || {};
    
    // 脱敏返回
    const masked = {};
    for (const [provider, keyList] of Object.entries(keys)) {
      masked[provider] = keyList.map(k => ({
        index: k.index,
        key: k.key ? k.key.slice(0, 6) + '...' + k.key.slice(-4) : '***',
        enabled: k.enabled !== false,
        usage: k.usage || 0,
        rateLimitHits: k.rateLimitHits || 0
      }));
    }
    
    res.json({ keys: masked });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/user/keys', async (req, res) => {
  try {
    const { userId, provider, key } = req.body;
    if (!userId || !provider || !key) return res.status(400).json({ error: 'userId, provider and key required' });
    
    const db = await getDB();
    if (!db.userKeys) db.userKeys = {};
    if (!db.userKeys[userId]) db.userKeys[userId] = {};
    if (!db.userKeys[userId][provider]) db.userKeys[userId][provider] = [];
    
    const keyList = db.userKeys[userId][provider];
    const newKey = {
      key,
      index: keyList.length,
      enabled: true,
      usage: 0,
      rateLimitHits: 0,
      addedAt: new Date().toISOString()
    };
    keyList.push(newKey);
    
    await saveDB(db);
    console.log(`[models] user ${userId} added ${provider} key`);
    
    res.json({ success: true, index: newKey.index, masked: key.slice(0, 6) + '...' + key.slice(-4) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/user/keys/:provider/:index', async (req, res) => {
  try {
    const { userId } = req.body;
    const { provider, index } = req.params;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    
    const db = await getDB();
    const keyList = db.userKeys?.[userId]?.[provider];
    if (!keyList || !keyList[parseInt(index)]) {
      return res.status(404).json({ error: 'key not found' });
    }
    
    keyList.splice(parseInt(index), 1);
    keyList.forEach((k, i) => k.index = i);
    
    await saveDB(db);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/user/keys/:provider/:index/toggle', async (req, res) => {
  try {
    const { userId, enabled } = req.body;
    const { provider, index } = req.params;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    
    const db = await getDB();
    const keyList = db.userKeys?.[userId]?.[provider];
    if (!keyList || !keyList[parseInt(index)]) {
      return res.status(404).json({ error: 'key not found' });
    }
    
    const key = keyList[parseInt(index)];
    key.enabled = enabled !== false;
    
    await saveDB(db);
    res.json({ success: true, enabled: key.enabled });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
