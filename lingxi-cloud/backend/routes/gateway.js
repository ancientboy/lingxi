import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB, saveDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import { callOpenClawRPC } from '../utils/openclaw-rpc.js';
import config from '../config/index.js';

const router = Router();

const JWT_SECRET = config.security.jwtSecret;

// 生产模式：所有用户都应该有独立服务器
// 没有服务器的用户走免费 API 对话，不使用共享 Gateway
const SHARED_GATEWAY = null; // 已废弃

router.get('/ws-info', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
  const wsHost = protocol === 'wss' ? host.split(':')[0] : host;
  
  res.json({
    wsUrl: `${protocol}://${wsHost}/api/ws`,
    session: SHARED_GATEWAY.session,
  });
});

router.get('/connect-info', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: '登录已过期' });
  }
  
  const db = await getDB();
  const user = db.users?.find(u => u.id === decoded.userId);
  
  if (!user) {
    return res.status(401).json({ error: '用户不存在' });
  }
  
  // 🔧 新逻辑：有设备就连接，没有团队也给默认团队
  // 查找活跃服务器
  const userServer = getActiveServer(db, user.id);
  
  // 🔧 修复：使用后端 WebSocket 代理，而不是直接连接用户服务器
  // 前端连接 wss://lumeword.com/api/ws，后端代理到用户服务器
  const host = req.get('host') || 'localhost:3000';
  const protocol = (req.headers['x-forwarded-proto'] || req.protocol) === 'https' ? 'wss' : 'ws';
  const wsHost = protocol === "wss" ? host.split(":")[0] : host;
  const wsUrl = `${protocol}://${wsHost}/api/ws`;
  
  // 🔧 订阅跟着用户走，不跟着设备走
  // 只要有设备有 IP 就返回连接信息（和 ws-proxy 保持一致）
  if (userServer && userServer.ip) {
    res.json({
      mode: 'dedicated',
      wsUrl: wsUrl,
      session: userServer.openclawSession,
      token: token,  // JWT token，用于 WebSocket 代理验证
      gatewayToken: userServer.openclawToken,  // OpenClaw token，用于 connect 消息
      sessionPrefix: `agent:main:user_${user.id.substring(0, 8)}`,
      server: {
        ip: userServer.ip,
        port: userServer.openclawPort,
        status: userServer.status
      }
    });
  } else {
    // 没有任何设备 → 免费 API 对话模式
    return res.json({
      mode: 'free',
      message: '暂无连接的设备，使用免费聊天模式',
      wsUrl: null
    });
  }
});

router.post('/proxy', async (req, res) => {
  const { message, sessionKey } = req.body;
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: '登录已过期' });
  }
  
  const db = await getDB();
  const user = db.users?.find(u => u.id === decoded.userId);
  
  if (!user) {
    return res.status(401).json({ error: '用户不存在' });
  }
  
  const userServer = getActiveServer(db, user.id);
  
  let gatewayUrl, gatewayToken, gatewaySession;
  
  if (userServer && userServer.ip) {
    gatewayUrl = `http://${userServer.ip}:${userServer.openclawPort}`;
    gatewayToken = userServer.openclawToken;
    gatewaySession = userServer.openclawSession;
  } else {
    gatewayUrl = SHARED_GATEWAY.url;
    gatewayToken = SHARED_GATEWAY.token;
    gatewaySession = SHARED_GATEWAY.session;
  }
  
  try {
    const response = await fetch(`${gatewayUrl}/${gatewaySession}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayToken}`
      },
      body: JSON.stringify({
        message,
        userId: user.id,
        sessionKey: sessionKey || `user_${user.id.substring(0, 8)}:main`
      })
    });
    
    const data = await response.json();
    res.json(data);
    
  } catch (error) {
    console.error('Gateway 代理错误:', error);
    res.status(500).json({ error: 'Gateway 连接失败' });
  }
});

// Auth middleware for RPC
function authRpc(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch(e) {
    return res.status(401).json({ error: '登录已过期' });
  }
}

// GET /api/gateway/agents — 获取用户 OpenClaw 的 agent 配置
router.get('/agents', authRpc, async (req, res) => {
  try {
    const db = await getDB();
    const user = db.users?.find(u => u.id === req.userId);
    const userServer = getActiveServer(db, user?.id);
    if (!userServer?.ip) return res.status(400).json({ error: '没有可用的服务器' });

    const result = await callOpenClawRPC(userServer, 'config.get', {});
    if (!result.ok) return res.status(500).json({ error: 'OpenClaw 配置读取失败', detail: result.error });

    const config = result.payload?.config || {};
    const agentsList = config.agents?.list || [];
    const workspace = config.agents?.defaults?.workspace || '~/.openclaw/workspace';

    // 同步清理 marketInstalls：如果 Agent 已不在 OpenClaw 配置中，从灵犀云 db 中也移除
    const activeAgentIds = new Set(agentsList.map(a => a.id));
    if (db.marketInstalls?.length > 0) {
      const before = db.marketInstalls.length;
      db.marketInstalls = db.marketInstalls.filter(m => {
        if (m.userId !== req.userId) return true; // 其他用户的不管
        return activeAgentIds.has(m.agentId); // 还在的保留
      });
      if (db.marketInstalls.length < before) {
        await saveDB(db);
        console.log(`🧹 清理了 ${before - db.marketInstalls.length} 条过期的 marketInstalls`);
      }
    }

    res.json({
      success: true,
      agents: agentsList.map(a => ({
        id: a.id,
        name: a.identity?.name || a.name || a.id,
        emoji: a.identity?.emoji || '🤖',
        workspace: a.workspace,
        model: a.model,
        isDefault: a.default === true,
      })),
      defaultWorkspace: workspace,
      source: 'openclaw',
    });
  } catch(e) {
    console.error('❌ /gateway/agents error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/gateway/agents — 添加新 agent 到 OpenClaw
router.post('/agents', authRpc, async (req, res) => {
  const { agentId, name, emoji, soulContent, workspace } = req.body;
  if (!agentId) return res.status(400).json({ error: '缺少 agentId' });

  try {
    const db = await getDB();
    const user = db.users?.find(u => u.id === req.userId);
    const userServer = getActiveServer(db, user?.id);
    if (!userServer?.ip) return res.status(400).json({ error: '没有可用的服务器' });

    // 1. Get current config
    const configRes = await callOpenClawRPC(userServer, 'config.get', {});
    if (!configRes.ok) return res.status(500).json({ error: '读取配置失败' });
    const baseHash = configRes.payload?.hash;
    const currentConfig = configRes.payload?.config || {};
    const agentsList = currentConfig.agents?.list || [];
    const defaultWorkspace = currentConfig.agents?.defaults?.workspace || '~/.openclaw/workspace';

    // Check if agent already exists
    if (agentsList.some(a => a.id === agentId)) {
      return res.status(400).json({ error: `Agent "${agentId}" 已存在` });
    }

    // 2. Build new agent config
    const agentWorkspace = workspace || `${defaultWorkspace}-${agentId}`;
    const newAgent = {
      id: agentId,
      workspace: agentWorkspace,
      identity: { name: name || agentId, emoji: emoji || '🤖' },
    };

    // 3. Build patch — 同时更新 allowLists
    const newList = [...agentsList, newAgent];
    // 把新 agent 加入 main 的 subagents.allowAgents
    const mainAgent = newList.find(a => a.id === 'main' || a.default);
    if (mainAgent) {
      if (!mainAgent.subagents) mainAgent.subagents = {};
      if (!mainAgent.subagents.allowAgents) mainAgent.subagents.allowAgents = [];
      if (!mainAgent.subagents.allowAgents.includes(agentId)) {
        mainAgent.subagents.allowAgents.push(agentId);
      }
    }

    const patchRes = await callOpenClawRPC(userServer, 'config.patch', {
      raw: JSON.stringify({ agents: { list: newList } }),
      baseHash,
      note: `灵犀云添加 Agent: ${name || agentId}`,
    }, { timeout: 15000 });

    console.log('📋 config.patch response:', JSON.stringify({ ok: patchRes.ok, error: patchRes.error, payload_keys: patchRes.payload ? Object.keys(patchRes.payload) : null }));

    if (!patchRes.ok) {
      return res.status(500).json({ error: '配置更新失败', detail: patchRes.error });
    }

    // 4. Write SOUL.md to the new agent workspace (via chat.send → write tool)
    if (soulContent) {
      // Wait a moment for OpenClaw to restart and create workspace
      setTimeout(async () => {
        try {
          await writeAgentFile(userServer, agentId, 'SOUL.md', soulContent);
          console.log(`✅ 已写入 ${agentId} 的 SOUL.md`);
        } catch(e) {
          console.error(`⚠️ 写入 ${agentId} SOUL.md 失败:`, e.message);
        }
      }, 5000);
    }

    res.json({ success: true, agent: newAgent, message: `Agent "${name || agentId}" 已添加，OpenClaw 正在重启` });
  } catch(e) {
    console.error('❌ POST /gateway/agents error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/gateway/agents/:agentId — 删除 agent
router.delete('/agents/:agentId', authRpc, async (req, res) => {
  const { agentId } = req.params;
  console.log(`🗑️ DELETE /agents/${agentId} — 开始移除`);
  if (agentId === 'main') return res.status(400).json({ error: '不能删除主 Agent' });

  try {
    const db = await getDB();
    const user = db.users?.find(u => u.id === req.userId);
    const userServer = getActiveServer(db, user?.id);
    if (!userServer?.ip) return res.status(400).json({ error: '没有可用的服务器' });

    const configRes = await callOpenClawRPC(userServer, 'config.get', {});
    if (!configRes.ok) return res.status(500).json({ error: '读取配置失败' });
    const baseHash = configRes.payload?.hash;
    const agentsList = configRes.payload?.config?.agents?.list || [];

    const updatedList = agentsList.filter(a => a.id !== agentId);
    if (updatedList.length === agentsList.length) {
      return res.status(400).json({ error: `Agent "${agentId}" 不存在` });
    }

    // ⚠️ 先清理灵犀云本地数据（在 config.patch 之前，防止 WS 断开导致清理不执行）
    try {
      const installIdx = db.marketInstalls?.findIndex(m => m.userId === req.userId && m.agentId === agentId);
      if (installIdx >= 0) {
        db.marketInstalls.splice(installIdx, 1);
        await saveDB(db);
        console.log(`🧹 已清理 marketInstalls: ${agentId}`);
      }
    } catch (dbErr) {
      console.warn('⚠️ 清理 marketInstalls 失败:', dbErr.message);
    }

    // ⚠️ 同时清理 main.subagents.allowAgents 和 tools.agentToAgent.allow 中的引用
    const patchObj = { agents: { list: updatedList } };
    
    // 清理 main agent 的 subagents.allowAgents
    const mainAgent = updatedList.find(a => a.id === 'main' || a.default);
    if (mainAgent?.subagents?.allowAgents) {
      mainAgent.subagents.allowAgents = mainAgent.subagents.allowAgents.filter(id => id !== agentId);
      // Override main in the list
      const mainIdx = updatedList.findIndex(a => a.id === 'main' || a.default);
      if (mainIdx >= 0) updatedList[mainIdx] = mainAgent;
    }

    const patchRes = await callOpenClawRPC(userServer, 'config.patch', {
      raw: JSON.stringify(patchObj),
      baseHash,
      note: `灵犀云移除 Agent: ${agentId}`,
    }, { timeout: 15000 });

    console.log('📋 DELETE config.patch response:', JSON.stringify({ ok: patchRes.ok, error: patchRes.error }));

    if (!patchRes.ok) {
      return res.status(500).json({ error: '配置更新失败', detail: patchRes.error });
    }

    // Step 2: 尝试通过 agents.delete 清理 workspace（如果 WS 还活着）
    // 注意：config.patch 可能导致 OpenClaw 重启，WS 断开，这里可能失败
    // 失败没关系，GET /agents 时会自动重新同步
    let workspaceCleaned = false;
    try {
      const deleteRes = await callOpenClawRPC(userServer, 'agents.delete', {
        agentId,
      }, { timeout: 8000 });
      workspaceCleaned = deleteRes.ok;
      console.log('🗑️ agents.delete response:', JSON.stringify({ ok: deleteRes.ok, error: deleteRes.error }));
    } catch (delErr) {
      console.warn(`⚠️ agents.delete 失败（OpenClaw 可能正在重启）:`, delErr.message);
    }

    res.json({
      success: true,
      message: `Agent "${agentId}" 已移除`,
      workspaceCleaned,
    });
  } catch(e) {
    console.error('❌ DELETE /gateway/agents error:', e.message);
    console.error('❌ Stack:', e.stack);
    res.status(500).json({ error: e.message });
  }
});

// Helper: Write file to agent workspace via chat.send (灵犀 uses write tool)
async function writeAgentFile(userServer, agentId, filename, content) {
  const sessionKey = `agent:main:lingxi-cloud-admin`;
  const result = await callOpenClawRPC(userServer, 'chat.send', {
    sessionKey,
    message: `请用 write 工具将以下内容写入 ${agentId} 的工作区文件 ${filename}，不要回复其他内容：\n\n${content}`,
  }, { timeout: 30000 });
  return result;
}

export default router;
