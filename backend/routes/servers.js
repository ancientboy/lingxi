/**
 * 服务器管理路由 — 用户设备 CRUD、健康检测、Lume 插件远程安装
 */

import { Router } from 'express';
import crypto from 'crypto';
import { getDB, saveDB } from '../utils/db.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';
import { verifyToken } from '../middleware/auth.js';
import { getActiveServer, getUserServers } from '../utils/activeServer.js';
import { probeTcp } from '../utils/port-probe.js';
import { deployLumePluginOverSsh } from '../utils/lume-plugin-ssh.js';
import { OPENCLAW_PORT, LUME_PLUGIN_PORT } from '../utils/openclaw-deploy-constants.js';

const router = Router();

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSessionId() {
  return crypto.randomBytes(4).toString('hex');
}

function assertUserAccess(req, res) {
  const { userId } = req.params;
  if (!userId || req.userId !== userId) {
    res.status(403).json({ success: false, error: '无权访问该用户设备' });
    return false;
  }
  return true;
}

async function checkGatewayHealth(server) {
  const { ip, openclawPort, openclawSession, openclawToken } = server;
  const port = openclawPort || 18789;
  if (!ip || !openclawToken) return false;

  const sessionPath = openclawSession ? `/${openclawSession}` : '';
  const url = `http://${ip}:${port}${sessionPath}?token=${openclawToken}`;

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      redirect: 'manual',
    });
    return resp.status === 302 || resp.ok;
  } catch {
    return false;
  }
}

async function evaluateServerHealth(server) {
  const gatewayOk = await checkGatewayHealth(server);
  const lumeOk = gatewayOk
    ? await probeTcp(server.ip, LUME_PLUGIN_PORT)
    : false;

  let status = 'offline';
  if (gatewayOk) status = 'running';

  return {
    gatewayOk,
    lumePluginOk: lumeOk,
    status,
    lumePluginPort: LUME_PLUGIN_PORT,
  };
}

/**
 * 创建服务器（数据库记录，异步创建 ECS）
 */
router.post('/create', async (req, res) => {
  try {
    const { userId, region = config.aliyun.region, spec = config.aliyun.instanceType } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId 必填' });
    }

    const db = await getDB();
    const user = db.users?.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const existingServer = db.userServers?.find((s) => s.userId === userId);
    if (existingServer) {
      logger.info(`用户 ${userId} 已有服务器: ${existingServer.id}`);
      return res.json({
        success: true,
        server: existingServer,
        message: '用户已有服务器',
      });
    }

    const serverId = `srv-${crypto.randomUUID().substring(0, 8)}`;
    const openclawToken = generateToken();
    const openclawSession = generateSessionId();

    const server = {
      id: serverId,
      userId,
      aliyunInstanceId: null,
      ip: null,
      region,
      spec,
      sshPort: 22,
      sshPassword: config.userServer.password,
      openclawPort: config.userServer.openclawPort,
      openclawToken,
      openclawSession,
      status: 'pending',
      lumePluginOk: false,
      healthCheckedAt: null,
      createdAt: new Date().toISOString(),
    };

    if (!db.userServers) db.userServers = [];
    db.userServers.push(server);

    const taskId = `task-${crypto.randomUUID().substring(0, 8)}`;
    const task = {
      id: taskId,
      userId,
      serverId,
      taskType: 'create_server',
      status: 'pending',
      progress: 0,
      params: JSON.stringify({ region, spec }),
      result: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };

    if (!db.deployTasks) db.deployTasks = [];
    db.deployTasks.push(task);

    await saveDB(db);

    logger.success(`服务器创建任务已提交: ${serverId}`);

    res.json({
      success: true,
      server,
      task: {
        id: taskId,
        status: 'pending',
      },
      message: '服务器创建任务已提交，请稍后查询状态',
    });
  } catch (error) {
    logger.fail('创建服务器失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 查询部署任务状态
 */
router.get('/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const db = await getDB();

    const task = db.deployTasks?.find((t) => t.id === taskId);

    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    res.json({
      success: true,
      task,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 列出所有服务器（管理用）
 */
router.get('/', async (req, res) => {
  try {
    const db = await getDB();
    const servers = db.userServers || [];

    res.json({
      success: true,
      total: servers.length,
      servers,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 用户设备列表 + 当前活跃设备 */
router.get('/:userId', verifyToken, async (req, res) => {
  if (!assertUserAccess(req, res)) return;

  try {
    const { userId } = req.params;
    const db = await getDB();
    const servers = getUserServers(db, userId);
    const active = getActiveServer(db, userId);

    const task = db.deployTasks?.find(
      (t) =>
        t.userId === userId &&
        servers.some((s) => s.id === t.serverId) &&
        ['pending', 'running'].includes(t.status),
    );

    res.json({
      success: true,
      servers,
      activeServerId: active?.id || null,
      server: active || servers[0] || null,
      task: task || null,
    });
  } catch (error) {
    logger.fail('查询服务器失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/** 手动添加设备（仅登记 Gateway，不含 Lume 插件） */
router.post('/:userId', verifyToken, async (req, res) => {
  if (!assertUserAccess(req, res)) return;

  try {
    const { userId } = req.params;
    const {
      name,
      ip,
      openclawPort = 18789,
      openclawToken,
      openclawSession,
      description,
      sshPassword,
      sshPort = 22,
    } = req.body;

    if (!ip?.trim()) {
      return res.status(400).json({ success: false, error: 'IP 必填' });
    }

    const db = await getDB();
    const serverId = `srv-${crypto.randomUUID().substring(0, 8)}`;
    const server = {
      id: serverId,
      userId,
      name: name?.trim() || null,
      description: description?.trim() || null,
      aliyunInstanceId: null,
      ip: ip.trim(),
      region: 'manual',
      spec: 'manual',
      sshPort: Number(sshPort) || 22,
      sshPassword: sshPassword || null,
      openclawPort: Number(openclawPort) || 18789,
      openclawToken: openclawToken?.trim() || generateToken(),
      openclawSession: openclawSession?.trim() || generateSessionId(),
      status: 'pending',
      lumePluginOk: false,
      healthCheckedAt: null,
      createdAt: new Date().toISOString(),
    };

    if (!db.userServers) db.userServers = [];
    db.userServers.push(server);

    const user = db.users?.find((u) => u.id === userId);
    if (user && !user.activeServerId) {
      user.activeServerId = serverId;
    }

    await saveDB(db);

    res.json({
      success: true,
      server,
      message: '设备已添加。填写 Gateway 信息即可聊天（OpenClaw 18789）。',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:userId/:serverId', verifyToken, async (req, res) => {
  if (!assertUserAccess(req, res)) return;

  try {
    const { userId, serverId } = req.params;
    const db = await getDB();
    const server = db.userServers?.find(
      (s) => s.userId === userId && s.id === serverId,
    );
    if (!server) {
      return res.status(404).json({ success: false, error: '设备不存在' });
    }

    const fields = [
      'name',
      'description',
      'ip',
      'openclawPort',
      'openclawToken',
      'openclawSession',
      'sshPassword',
      'sshPort',
    ];
    for (const key of fields) {
      if (req.body[key] !== undefined) {
        server[key] = req.body[key];
      }
    }

    await saveDB(db);
    res.json({ success: true, server });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:userId/:serverId', verifyToken, async (req, res) => {
  if (!assertUserAccess(req, res)) return;

  try {
    const { userId, serverId } = req.params;
    const db = await getDB();
    const idx = db.userServers?.findIndex(
      (s) => s.userId === userId && s.id === serverId,
    );
    if (idx === undefined || idx < 0) {
      return res.status(404).json({ success: false, error: '设备不存在' });
    }

    db.userServers.splice(idx, 1);
    const user = db.users?.find((u) => u.id === userId);
    if (user?.activeServerId === serverId) {
      const next = getUserServers(db, userId)[0];
      user.activeServerId = next?.id || null;
    }

    await saveDB(db);
    res.json({ success: true, message: '设备已删除' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** 检测 Gateway (18789) + Lume 插件 (18790) */
router.post('/:userId/:serverId/check', verifyToken, async (req, res) => {
  if (!assertUserAccess(req, res)) return;

  try {
    const { userId, serverId } = req.params;
    const db = await getDB();
    const server = db.userServers?.find(
      (s) => s.userId === userId && s.id === serverId,
    );
    if (!server) {
      return res.status(404).json({ success: false, error: '设备不存在' });
    }

    const health = await evaluateServerHealth(server);
    server.status = health.status;
    server.lumePluginOk = health.lumePluginOk;
    server.healthCheckedAt = new Date().toISOString();
    await saveDB(db);

    res.json({
      success: true,
      status: health.status,
      healthy: health.gatewayOk,
      gatewayOk: health.gatewayOk,
      lumePluginOk: health.lumePluginOk,
      lumePluginPort: health.lumePluginPort,
      message: health.gatewayOk
        ? health.lumePluginOk
          ? 'Gateway 在线（已检测到可选 Lume 插件）'
          : 'Gateway 在线，可正常聊天'
        : '设备离线或 Gateway 不可达',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:userId/:serverId/activate', verifyToken, async (req, res) => {
  if (!assertUserAccess(req, res)) return;

  try {
    const { userId, serverId } = req.params;
    const db = await getDB();
    const server = db.userServers?.find(
      (s) => s.userId === userId && s.id === serverId,
    );
    if (!server) {
      return res.status(404).json({ success: false, error: '设备不存在' });
    }

    const user = db.users?.find((u) => u.id === userId);
    if (user) {
      user.activeServerId = serverId;
      await saveDB(db);
    }

    res.json({
      success: true,
      message: `已切换到 ${server.name || server.ip}`,
      activeServerId: serverId,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 远程安装 Lume 插件 — 需要 SSH 密码（添加设备时填写，或一键部署写入）
 * POST body 可临时传入 sshPassword
 */
router.post(
  '/:userId/:serverId/deploy-lume-plugin',
  verifyToken,
  async (req, res) => {
    if (!assertUserAccess(req, res)) return;

    try {
      const { userId, serverId } = req.params;
      const db = await getDB();
      const server = db.userServers?.find(
        (s) => s.userId === userId && s.id === serverId,
      );
      if (!server?.ip) {
        return res.status(404).json({ success: false, error: '设备不存在' });
      }

      const password =
        req.body?.sshPassword || server.sshPassword || config.userServer.password;
      if (!password) {
        return res.status(400).json({
          success: false,
          error:
            '缺少 SSH 密码，无法远程安装。请编辑设备填写 SSH 密码，或在服务器上手动安装 Lume 插件。',
        });
      }

      await deployLumePluginOverSsh({
        host: server.ip,
        port: server.sshPort || 22,
        password,
        serverIp: server.ip,
      });

      const health = await evaluateServerHealth(server);
      server.status = health.status;
      server.lumePluginOk = health.lumePluginOk;
      server.healthCheckedAt = new Date().toISOString();
      if (req.body?.sshPassword) {
        server.sshPassword = req.body.sshPassword;
      }
      await saveDB(db);

      res.json({
        success: true,
        lumePluginOk: health.lumePluginOk,
        status: health.status,
        message: health.lumePluginOk
          ? 'Lume 插件已安装并就绪'
          : '插件已推送，但 18790 仍未监听，请查看服务器日志',
      });
    } catch (error) {
      logger.fail('远程安装 Lume 插件失败:', error);
      res.status(500).json({
        success: false,
        error: error.message || '远程安装失败',
      });
    }
  },
);

export default router;
