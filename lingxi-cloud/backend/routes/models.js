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

// 默认官方模型池（Lume 提供）
const DEFAULT_MODEL_POOL = [
  // 百炼 Token Plan（直连）
  { id: 'bailian/qwen3.7-plus', name: '千问3.7 Plus', provider: 'bailian-token-plan', providerName: '百炼', category: 'lume', capabilities: ['text', 'image', 'reasoning'], contextWindow: 1000000, maxTokens: 65536, tier: 'pro', enabled: true, official: true },
  { id: 'bailian/qwen3.7-max', name: '千问3.7 Max', provider: 'bailian-token-plan', providerName: '百炼', category: 'lume', capabilities: ['text', 'reasoning'], contextWindow: 1000000, maxTokens: 65536, tier: 'pro', enabled: true, official: true },
  { id: 'bailian/qwen3.6-plus', name: '千问3.6 Plus', provider: 'bailian-token-plan', providerName: '百炼', category: 'lume', capabilities: ['text', 'image', 'reasoning'], contextWindow: 1000000, maxTokens: 65536, tier: 'pro', enabled: true, official: true },
  { id: 'bailian/qwen3.6-flash', name: '千问3.6 Flash', provider: 'bailian-token-plan', providerName: '百炼', category: 'lume', capabilities: ['text', 'image'], contextWindow: 1000000, maxTokens: 32768, tier: 'free', enabled: true, official: true },
  { id: 'bailian/deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'bailian-token-plan', providerName: '百炼', category: 'lume', capabilities: ['text', 'reasoning'], contextWindow: 163840, maxTokens: 32768, tier: 'pro', enabled: true, official: true },
  { id: 'bailian/kimi-k2.7-code', name: 'Kimi K2.7 Code', provider: 'bailian-token-plan', providerName: '百炼', category: 'lume', capabilities: ['text', 'image', 'reasoning'], contextWindow: 262144, maxTokens: 32768, tier: 'pro', enabled: true, official: true },
  // 智谱直连
  { id: 'zhipu/glm-5.2', name: 'GLM-5.2', provider: 'zhipu', providerName: '智谱', category: 'lume', capabilities: ['text', 'reasoning'], contextWindow: 200000, maxTokens: 8192, tier: 'free', enabled: true, official: true },
  { id: 'zhipu/glm-5', name: 'GLM-5', provider: 'zhipu', providerName: '智谱', category: 'lume', capabilities: ['text', 'reasoning'], contextWindow: 200000, maxTokens: 8192, tier: 'free', enabled: true, official: true },
  { id: 'zhipu/glm-4.7', name: 'GLM-4.7', provider: 'zhipu', providerName: '智谱', category: 'lume', capabilities: ['text'], contextWindow: 200000, maxTokens: 8192, tier: 'free', enabled: true, official: true },
  { id: 'zhipu/glm-4-air', name: 'GLM-4-Air', provider: 'zhipu', providerName: '智谱', category: 'lume', capabilities: ['text'], contextWindow: 128000, maxTokens: 4096, tier: 'free', enabled: true, official: true },
  // 9Router — GitHub Copilot 模型
  { id: 'gh/gpt-4o', name: 'GPT-4o', provider: '9router', providerName: 'GitHub Copilot', category: 'lume', capabilities: ['text', 'image'], contextWindow: 128000, maxTokens: 4096, tier: 'free', enabled: true, official: true },
  { id: 'gh/gpt-4.1', name: 'GPT-4.1', provider: '9router', providerName: 'GitHub Copilot', category: 'lume', capabilities: ['text', 'image'], contextWindow: 128000, maxTokens: 32768, tier: 'free', enabled: true, official: true },
  { id: 'gh/gpt-5.2', name: 'GPT-5.2', provider: '9router', providerName: 'GitHub Copilot', category: 'lume', capabilities: ['text', 'image', 'reasoning'], contextWindow: 128000, maxTokens: 32768, tier: 'pro', enabled: true, official: true },
  { id: 'gh/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', provider: '9router', providerName: 'GitHub Copilot', category: 'lume', capabilities: ['text', 'image'], contextWindow: 200000, maxTokens: 8192, tier: 'pro', enabled: true, official: true },
  // 9Router — Cursor 模型
  { id: 'cu/claude-4.5-sonnet', name: 'Claude 4.5 Sonnet', provider: '9router', providerName: 'Cursor', category: 'lume', capabilities: ['text', 'image'], contextWindow: 200000, maxTokens: 8192, tier: 'pro', enabled: true, official: true },
  { id: 'cu/claude-4.5-sonnet-thinking', name: 'Claude 4.5 Thinking', provider: '9router', providerName: 'Cursor', category: 'lume', capabilities: ['text', 'reasoning'], contextWindow: 200000, maxTokens: 8192, tier: 'pro', enabled: true, official: true },
  { id: 'cu/gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: '9router', providerName: 'Cursor', category: 'lume', capabilities: ['text', 'image', 'reasoning'], contextWindow: 128000, maxTokens: 8192, tier: 'pro', enabled: true, official: true },
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

// 可绑定的供应商列表（用户可在前端绑定自己的 key）
const BINDABLE_PROVIDERS = [
  { id: 'bailian-token-plan', name: '百炼', testModel: 'qwen3.7-plus',
    models: ['qwen3.7-plus','qwen3.7-max','qwen3.6-plus','qwen3.6-flash','deepseek-v4-pro','kimi-k2.7-code'],
    getKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1' },
  { id: 'zhipu', name: '智谱', testModel: 'glm-5',
    models: ['glm-5.2','glm-5','glm-4.7'],
    getKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { id: 'dmxapi', name: 'DMXAPI', testModel: 'glm-4-flash',
    models: ['glm-4-flash','GLM-4.5-Flash','Qwen3-8B'],
    getKeyUrl: 'https://www.dmxapi.cn/' },
  { id: 'opencode-go', name: 'OpenCode Go', testModel: 'glm-5.2',
    models: ['glm-5.2','glm-5.1','gpt-4o','gpt-5.2','claude-sonnet-4.6'],
    getKeyUrl: 'https://opencodego.com' },
];

router.get('/list', async (req, res) => {
  try {
    const { userId, detectOpenClaw } = req.query;
    const db = await getDB();
    
    // 官方模型池
    const pool = db.modelPool || DEFAULT_MODEL_POOL;
    
    // 从 proxy-keys.json 读取 enabledModels 白名单
    let enabledMap = {};
    try {
      const pk = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/proxy-keys.json'), 'utf-8'));
      for (const [provId, provData] of Object.entries(pk)) {
        if (provData.enabledModels && provData.enabledModels.length > 0) {
          enabledMap[provId] = provData.enabledModels;
        }
      }
    } catch(_) {}
    
    const officialModels = pool.filter(m => {
      if (m.enabled === false) return false;
      const em = enabledMap[m.provider];
      if (em) {
        // 去掉供应商前缀再匹配（如 zhipu/glm-5.2 → glm-5.2）
        const shortId = m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id;
        return em.includes(m.id) || em.includes(shortId);
      }
      return true;
    });
    
    // 获取用户偏好
    let preference = null;
    if (userId) {
      const user = db.users?.find(u => u.id === userId);
      preference = user?.modelPreference || null;
    }
    
    // 获取用户自定义 Key
    const userKeys = userId ? db.userKeys?.[userId] || {} : {};
    
    // === 分类构建 ===
    
    // 1. Lume 官方模型（按 providerName 分组）
    const lumeProviders = {};
    for (const m of officialModels) {
      const pn = m.providerName || m.provider;
      if (!lumeProviders[pn]) {
        lumeProviders[pn] = { name: pn, provider: m.provider, category: 'lume', models: [] };
      }
      lumeProviders[pn].models.push({
        id: m.id, name: m.name,
        capabilities: m.capabilities || ['text'],
        contextWindow: m.contextWindow, maxTokens: m.maxTokens,
        tier: m.tier || 'free',
      });
    }
    
    // 2. 用户自有 Key 模型（只显示绑定了 key 的 provider）
    const userKeyProviders = [];
    for (const prov of BINDABLE_PROVIDERS) {
      const hasKey = userKeys[prov.id] && userKeys[prov.id].some(k => k.enabled !== false);
      if (!hasKey) continue;
      userKeyProviders.push({
        name: prov.name + ' (自有)',
        provider: prov.id,
        category: 'userKey',
        models: prov.models.map(mid => ({
          id: prov.id + '/' + mid,
          name: mid,
          capabilities: ['text'],
          tier: 'user',
        })),
      });
    }
    
    // 3. OpenClaw 自有模型
    let openclawProviders = [];
    if (detectOpenClaw === 'true' && userId) {
      const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
      if (server) {
        const ocModels = await detectUserOpenClawModels(server);
        if (ocModels?.length) {
          // 按 providerName 分组
          const ocGroups = {};
          for (const m of ocModels) {
            const pn = m.providerName || m.provider;
            if (!ocGroups[pn]) ocGroups[pn] = { name: pn + ' (OpenClaw)', provider: m.provider, category: 'openclaw', models: [] };
            ocGroups[pn].models.push({
              id: m.id, name: m.name,
              capabilities: m.capabilities || ['text'],
              tier: 'user',
            });
          }
          openclawProviders = Object.values(ocGroups);
        }
      }
    }
    
    res.json({
      preference,
      categories: [
        { key: 'lume', label: 'Lume 官方', providers: Object.values(lumeProviders) },
        { key: 'userKey', label: '我的 Key', providers: userKeyProviders },
        { key: 'openclaw', label: 'OpenClaw', providers: openclawProviders },
      ].filter(c => c.providers.length > 0),
      bindableProviders: BINDABLE_PROVIDERS,
      userKeys: Object.keys(userKeys),
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

// ============ 测试用户 Key 连通性 ============
router.post('/user/keys/test', async (req, res) => {
  try {
    const { provider, key, testModel } = req.body;
    if (!provider || !key) return res.status(400).json({ ok: false, error: 'provider and key required' });
    
    // 从 proxy-keys.json 获取 provider 配置
    const proxyKeysPath = join(__dirname, '..', 'data', 'proxy-keys.json');
    const proxyKeysRaw = await fs.readFile(proxyKeysPath, 'utf-8');
    const proxyKeys = JSON.parse(proxyKeysRaw);
    const providerConfig = proxyKeys[provider];
    if (!providerConfig) return res.status(400).json({ ok: false, error: `未知供应商: ${provider}` });
    
    const baseUrl = providerConfig.baseUrl.replace(/\/$/, '');
    const testUrl = baseUrl + '/chat/completions';
    const model = testModel || providerConfig.models?.[0] || 'glm-5';
    
    console.log(`[models] 测试 ${provider} key: ${testUrl} model=${model}`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    
    try {
      const resp = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5, stream: false }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        res.json({ ok: true, model: data.model || model });
      } else {
        const errText = await resp.text().catch(() => '');
        res.json({ ok: false, error: `${resp.status} ${errText.slice(0, 100)}` });
      }
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        res.json({ ok: false, error: '请求超时' });
      } else {
        res.json({ ok: false, error: fetchErr.message });
      }
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
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
