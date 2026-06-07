/**
 * 设备（服务器）管理 API
 * 
 * 端点：
 *  GET    /api/servers/:userId          - 获取用户所有设备
 *  POST   /api/servers/:userId          - 添加设备
 *  PUT    /api/servers/:userId/:idx     - 编辑设备
 *  DELETE /api/servers/:userId/:idx     - 删除设备
 *  POST   /api/servers/:userId/:idx/check - 健康检查
 *  POST   /api/servers/:userId/:idx/activate - 设为活跃设备
 *  POST   /api/servers/:userId/check-all     - 全部健康检查
 */

import express from 'express';
const router = express.Router();

// ============ Helpers ============

async function getDB() {
  const { getDB: _getDB } = await import('../utils/db.js');
  return _getDB();
}

async function saveDB(db) {
  const { saveDB: _saveDB } = await import('../utils/db.js');
  return _saveDB(db);
}

function findUserServers(db, userId) {
  if (!db.userServers) db.userServers = [];
  return db.userServers.filter(s => s.userId === userId);
}

function generateId() {
  return 'srv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ============ Routes ============

/**
 * GET /api/servers/:userId
 * 获取用户所有设备
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    const user = db.users?.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    
    const servers = findUserServers(db, userId);
    
    res.json({ 
      servers,
      activeServerId: user.activeServerId || null
    });
  } catch (err) {
    console.error('[servers] list error:', err);
    res.status(500).json({ error: '获取设备列表失败' });
  }
});

/**
 * POST /api/servers/:userId
 * 添加设备
 * Body: { name, ip, openclawPort, openclawToken, openclawSession, description }
 */
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, ip, openclawPort, openclawToken, openclawSession, description } = req.body;
    
    if (!ip) return res.status(400).json({ error: 'IP 地址必填' });
    
    const db = await getDB();
    const user = db.users?.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    
    // 检查是否已存在同 IP
    const existing = db.userServers.find(s => s.userId === userId && s.ip === ip);
    if (existing) return res.status(400).json({ error: '该 IP 已存在' });
    
    const server = {
      id: generateId(),
      userId,
      name: name || `设备 ${findUserServers(db, userId).length + 1}`,
      ip,
      openclawPort: openclawPort || 18789,
      openclawToken: openclawToken || '',
      openclawSession: openclawSession || '',
      description: description || '',
      status: 'pending',
      lastCheck: null,
      createdAt: new Date().toISOString()
    };
    
    db.userServers.push(server);
    
    // 如果是第一台设备，自动设为活跃
    const userServers = findUserServers(db, userId);
    if (userServers.length === 1) {
      user.activeServerId = server.id;
    }
    
    await saveDB(db);
    
    // 自动做一次健康检查
    checkServerHealth(server).then(async healthy => {
      server.status = healthy ? 'running' : 'offline';
      server.lastCheck = new Date().toISOString();
      
      // 🆕 设备在线时自动推送默认团队配置（通过 OpenClaw HTTP API）
      if (healthy) {
        try {
          const { pushAgentsViaHttpApi } = await import('./agents.js');
          const defaultAgents = user.agents || ['lingxi', 'coder', 'noter'];
          await pushAgentsViaHttpApi(server, defaultAgents);
          console.log(`✅ 已自动推送团队配置到 ${ip}`);
          
          // 同时更新用户的 agents 记录
          if (!user.agents || user.agents.length === 0) {
            user.agents = defaultAgents;
          }
        } catch (err) {
          console.log(`⚠️ 推送团队配置失败（不影响使用）: ${err.message}`);
        }
      }
      
      await saveDB(db);
    });
    
    res.json({ server, message: '设备添加成功' });
  } catch (err) {
    console.error('[servers] add error:', err);
    res.status(500).json({ error: '添加设备失败' });
  }
});

/**
 * PUT /api/servers/:userId/:serverId
 * 编辑设备
 */
router.put('/:userId/:serverId', async (req, res) => {
  try {
    const { userId, serverId } = req.params;
    const updates = req.body;
    
    const db = await getDB();
    const server = db.userServers.find(s => s.userId === userId && (s.id === serverId || s.id === undefined && db.userServers.indexOf(s) === parseInt(serverId)));
    
    // 支持通过 id 或 index 查找
    let target = db.userServers.find(s => s.userId === userId && s.id === serverId);
    if (!target) {
      const idx = parseInt(serverId);
      const userServers = findUserServers(db, userId);
      if (userServers[idx]) target = userServers[idx];
    }
    
    if (!target) return res.status(404).json({ error: '设备不存在' });
    
    // 允许更新的字段
    const allowedFields = ['name', 'ip', 'openclawPort', 'openclawToken', 'openclawSession', 'description'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        target[field] = updates[field];
      }
    }
    
    await saveDB(db);
    res.json({ server: target, message: '设备更新成功' });
  } catch (err) {
    console.error('[servers] update error:', err);
    res.status(500).json({ error: '更新设备失败' });
  }
});

/**
 * DELETE /api/servers/:userId/:serverId
 * 删除设备
 */
router.delete('/:userId/:serverId', async (req, res) => {
  try {
    const { userId, serverId } = req.params;
    const db = await getDB();
    
    const idx = db.userServers.findIndex(s => s.userId === userId && (s.id === serverId || s.id === undefined));
    if (idx === -1) return res.status(404).json({ error: '设备不存在' });
    
    const removed = db.userServers.splice(idx, 1)[0];
    
    // 如果删除的是活跃设备，切换到第一台
    const user = db.users.find(u => u.id === userId);
    if (user && user.activeServerId === removed.id) {
      const remaining = findUserServers(db, userId);
      user.activeServerId = remaining.length > 0 ? remaining[0].id : null;
    }
    
    await saveDB(db);
    res.json({ message: '设备已删除' });
  } catch (err) {
    console.error('[servers] delete error:', err);
    res.status(500).json({ error: '删除设备失败' });
  }
});

/**
 * POST /api/servers/:userId/:serverId/check
 * 健康检查单个设备
 */
router.post('/:userId/:serverId/check', async (req, res) => {
  try {
    const { userId, serverId } = req.params;
    const db = await getDB();
    
    const server = db.userServers.find(s => s.userId === userId && s.id === serverId);
    if (!server) return res.status(404).json({ error: '设备不存在' });
    
    const healthy = await checkServerHealth(server);
    server.status = healthy ? 'running' : 'offline';
    server.lastCheck = new Date().toISOString();
    
    await saveDB(db);
    
    res.json({ 
      status: server.status, 
      lastCheck: server.lastCheck,
      healthy
    });
  } catch (err) {
    console.error('[servers] check error:', err);
    res.status(500).json({ error: '健康检查失败' });
  }
});

/**
 * POST /api/servers/:userId/:serverId/activate
 * 设为活跃设备
 */
router.post('/:userId/:serverId/activate', async (req, res) => {
  try {
    const { userId, serverId } = req.params;
    const db = await getDB();
    
    const server = db.userServers.find(s => s.userId === userId && s.id === serverId);
    if (!server) return res.status(404).json({ error: '设备不存在' });
    
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    
    user.activeServerId = serverId;
    await saveDB(db);
    
    res.json({ 
      message: `已切换到 ${server.name}`,
      activeServerId: serverId,
      server: { id: server.id, name: server.name, ip: server.ip, status: server.status }
    });
  } catch (err) {
    console.error('[servers] activate error:', err);
    res.status(500).json({ error: '切换设备失败' });
  }
});

/**
 * POST /api/servers/:userId/check-all
 * 全部健康检查
 */
router.post('/:userId/check-all', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    const servers = findUserServers(db, userId);
    const results = [];
    
    for (const server of servers) {
      const healthy = await checkServerHealth(server);
      server.status = healthy ? 'running' : 'offline';
      server.lastCheck = new Date().toISOString();
      results.push({
        id: server.id,
        name: server.name,
        ip: server.ip,
        status: server.status,
        healthy
      });
    }
    
    await saveDB(db);
    
    res.json({ results });
  } catch (err) {
    console.error('[servers] check-all error:', err);
    res.status(500).json({ error: '健康检查失败' });
  }
});

/**
 * GET /api/servers/:userId/active
 * 获取当前活跃设备
 */
router.get('/:userId/active', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    const user = db.users?.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    
    const server = db.userServers.find(s => s.userId === userId && s.id === user.activeServerId);
    
    res.json({ 
      activeServer: server || null,
      activeServerId: user.activeServerId || null
    });
  } catch (err) {
    console.error('[servers] active error:', err);
    res.status(500).json({ error: '获取活跃设备失败' });
  }
});

// ============ Health Check ============

async function checkServerHealth(server) {
  const { ip, openclawPort, openclawSession, openclawToken } = server;
  const port = openclawPort || 18789;
  
  try {
    // OpenClaw 用 URL query param 认证，不要用 Authorization header（会触发封锁）
    const url = `http://${ip}:${port}/${openclawSession || ''}?token=${openclawToken || ''}`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      redirect: 'manual'  // 不跟随重定向，302 即表示认证成功
    });
    // 302 (重定向到 Control UI) = 认证通过 = 在线
    return resp.status === 302 || resp.ok;
  } catch {
    return false;
  }
}

export default router;