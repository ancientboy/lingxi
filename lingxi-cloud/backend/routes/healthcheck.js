/**
 * 后端定时巡检路由
 *
 * 端点：
 *   GET /api/healthcheck/run            — 手动触发一次巡检（管理接口）
 *   GET /api/healthcheck/logs/:userId    — 获取用户服务器历史巡检记录（7 天）
 *   GET /api/healthcheck/latest/:serverId — 获取单台服务器最新状态
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB, saveDB } from '../utils/db.js';
import { config } from '../config/index.js';

const router = Router();
const JWT_SECRET = config.security.jwtSecret;

// ============ 工具函数 ============

function generateId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Token 验证中间件
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未登录' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.userId };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token 无效' });
  }
}

/**
 * 获取指定服务器最后一次巡检状态
 */
function getLatestStatus(db, serverId) {
  const logs = db.serverHealthLogs || [];
  const latest = logs
    .filter(l => l.serverId === serverId)
    .sort((a, b) => new Date(b.checkedAt) - new Date(a.checkedAt))[0];
  return latest?.status || null;
}

/**
 * 保存巡检日志
 */
function saveHealthLog(db, entry) {
  if (!db.serverHealthLogs) db.serverHealthLogs = [];
  db.serverHealthLogs.push({
    id: generateId('log_'),
    ...entry,
  });
}

/**
 * 保存通知记录
 */
function saveNotification(db, entry) {
  if (!db.healthNotifications) db.healthNotifications = [];
  db.healthNotifications.push({
    id: generateId('notif_'),
    ...entry,
  });
}

/**
 * 健康检查（参考 subscription.js / servers.js 的 checkServerHealth）
 * 返回 { healthy, responseTime }
 */
async function checkServerHealth(server) {
  const { ip, openclawPort, openclawSession, openclawToken } = server;
  const port = openclawPort || 18789;

  if (!ip) {
    return { healthy: false, responseTime: null };
  }

  const sessionPath = openclawSession ? `/${openclawSession}` : '';
  const url = `http://${ip}:${port}${sessionPath}`;
  const headers = {};
  if (openclawToken) headers['Authorization'] = `Bearer ${openclawToken}`;

  try {
    const start = Date.now();
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
      headers,
    });
    const responseTime = Date.now() - start;
    // 302 重定向 = 认证成功 = 在线
    return { healthy: resp.status === 302 || resp.ok, responseTime };
  } catch {
    return { healthy: false, responseTime: null };
  }
}

/**
 * 清理过期数据
 * - serverHealthLogs: 保留 7 天
 * - healthNotifications: 保留 30 天
 */
function cleanupOldData(db) {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  if (db.serverHealthLogs) {
    const before = db.serverHealthLogs.length;
    db.serverHealthLogs = db.serverHealthLogs.filter(
      l => (now - new Date(l.checkedAt).getTime()) < sevenDays
    );
    const removed = before - db.serverHealthLogs.length;
    if (removed > 0) {
      console.log(`[巡检] 清理 ${removed} 条过期日志（>7天）`);
    }
  }

  if (db.healthNotifications) {
    const before = db.healthNotifications.length;
    db.healthNotifications = db.healthNotifications.filter(
      n => (now - new Date(n.createdAt).getTime()) < thirtyDays
    );
    const removed = before - db.healthNotifications.length;
    if (removed > 0) {
      console.log(`[巡检] 清理 ${removed} 条过期通知（>30天）`);
    }
  }
}

/**
 * 对单个用户的所有服务器执行巡检
 * @returns {Array} 巡检结果列表
 */
export async function runHealthCheckForUser(db, userId) {
  const servers = (db.userServers || []).filter(s => s.userId === userId);
  const results = [];

  for (const server of servers) {
    const previousStatus = getLatestStatus(db, server.id);
    const result = await checkServerHealth(server);
    const currentStatus = result.healthy ? 'online' : 'offline';

    // 记录巡检日志
    saveHealthLog(db, {
      serverId: server.id,
      userId,
      status: currentStatus,
      checkedAt: new Date().toISOString(),
      responseTime: result.responseTime || null,
    });

    // 状态变化时记录通知
    if (previousStatus && previousStatus !== currentStatus) {
      const serverName = server.name || server.ip;
      saveNotification(db, {
        userId,
        serverId: server.id,
        serverName,
        type: result.healthy ? 'server_recovered' : 'server_offline',
        message: result.healthy
          ? `设备 ${serverName} 已恢复在线`
          : `设备 ${serverName} 已离线`,
        createdAt: new Date().toISOString(),
        read: false,
      });
    }

    // 同步更新 userServers 中的状态
    server.status = result.healthy ? 'running' : 'offline';
    server.lastCheck = new Date().toISOString();

    results.push({
      serverId: server.id,
      serverName: server.name || server.ip,
      status: currentStatus,
      responseTime: result.responseTime,
      previousStatus,
      changed: previousStatus && previousStatus !== currentStatus,
    });
  }

  return results;
}

/**
 * 获取所有付费订阅用户 ID
 */
function getSubscribedUserIds(db) {
  return db.users
    .filter(u => {
      const plan = u.subscription?.plan;
      return plan && plan !== 'free';
    })
    .map(u => u.id);
}

// ============ 路由 ============

/**
 * GET /api/healthcheck/run
 * 手动触发巡检
 * - 管理员可传 ?userId=xxx 只检查指定用户
 * - 不传则检查所有订阅用户
 */
router.get('/run', authMiddleware, async (req, res) => {
  try {
    const db = await getDB();
    const targetUserId = req.query.userId;
    const requestUserId = req.user.id;

    // 确定要巡检的用户列表
    let userIds;
    if (targetUserId) {
      // 只能巡检自己的服务器（管理员除外）
      if (targetUserId !== requestUserId) {
        return res.status(403).json({ success: false, error: '无权巡检其他用户的设备' });
      }
      const user = db.users.find(u => u.id === targetUserId);
      if (!user) {
        return res.status(404).json({ success: false, error: '用户不存在' });
      }
      userIds = [targetUserId];
    } else {
      // 不指定用户时，只巡检自己的
      userIds = [requestUserId];
    }

    if (userIds.length === 0) {
      return res.json({ success: true, data: { checked: 0, results: [] } });
    }

    // 执行巡检
    const allResults = [];
    for (const uid of userIds) {
      const userResults = await runHealthCheckForUser(db, uid);
      allResults.push(...userResults);
    }

    // 清理过期数据
    cleanupOldData(db);

    // 持久化
    await saveDB(db);

    console.log(`[巡检] 手动触发完成，检查 ${userIds.length} 个用户，${allResults.length} 台服务器`);

    res.json({
      success: true,
      data: {
        checkedUsers: userIds.length,
        checkedServers: allResults.length,
        results: allResults,
      },
    });
  } catch (error) {
    console.error('[巡检] 手动巡检出错:', error);
    res.status(500).json({ success: false, error: '巡检失败' });
  }
});

/**
 * GET /api/healthcheck/logs/:userId
 * 获取用户最近 7 天的巡检记录，按服务器分组
 */
router.get('/logs/:userId', authMiddleware, async (req, res) => {
  try {
    const requestUserId = req.user.id;
    const targetUserId = req.params.userId;

    // 权限检查：只能查自己的
    if (requestUserId !== targetUserId) {
      return res.status(403).json({ success: false, error: '无权查看' });
    }

    const db = await getDB();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const logs = (db.serverHealthLogs || [])
      .filter(l => l.userId === targetUserId && l.checkedAt >= sevenDaysAgo)
      .sort((a, b) => new Date(b.checkedAt) - new Date(a.checkedAt));

    // 按服务器分组
    const grouped = {};
    for (const log of logs) {
      if (!grouped[log.serverId]) {
        grouped[log.serverId] = [];
      }
      grouped[log.serverId].push(log);
    }

    res.json({
      success: true,
      data: {
        userId: targetUserId,
        grouped,
        totalLogs: logs.length,
      },
    });
  } catch (error) {
    console.error('[巡检] 获取日志失败:', error);
    res.status(500).json({ success: false, error: '获取日志失败' });
  }
});

// ============ 通知 API ============

/**
 * GET /api/healthcheck/notifications
 * 获取当前用户的通知列表（所有未读 + 最近 50 条已读，时间倒序）
 */
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const db = await getDB();
    const userId = req.user.id;

    const allNotifs = (db.healthNotifications || [])
      .filter(n => n.userId === userId);

    const unread = allNotifs.filter(n => !n.read);
    const read = allNotifs
      .filter(n => n.read)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);

    const merged = [...unread, ...read]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data: merged });
  } catch (error) {
    console.error('[通知] 获取通知列表失败:', error);
    res.status(500).json({ success: false, error: '获取通知失败' });
  }
});

/**
 * POST /api/healthcheck/notifications/read
 * 标记通知已读
 * 请求体：{ notificationId: "xxx" } 或 { all: true }
 */
router.post('/notifications/read', authMiddleware, async (req, res) => {
  try {
    const db = await getDB();
    const userId = req.user.id;
    const { notificationId, all } = req.body;

    if (all) {
      // 标记全部已读
      let count = 0;
      for (const n of (db.healthNotifications || [])) {
        if (n.userId === userId && !n.read) {
          n.read = true;
          count++;
        }
      }
      await saveDB(db);
      return res.json({ success: true, markedCount: count });
    }

    if (!notificationId) {
      return res.status(400).json({ success: false, error: '缺少 notificationId' });
    }

    const notif = (db.healthNotifications || []).find(
      n => n.id === notificationId && n.userId === userId
    );
    if (!notif) {
      return res.status(404).json({ success: false, error: '通知不存在' });
    }
    notif.read = true;
    await saveDB(db);

    res.json({ success: true });
  } catch (error) {
    console.error('[通知] 标记已读失败:', error);
    res.status(500).json({ success: false, error: '操作失败' });
  }
});

/**
 * GET /api/healthcheck/notifications/unread-count
 * 获取当前用户未读通知数量
 */
router.get('/notifications/unread-count', authMiddleware, async (req, res) => {
  try {
    const db = await getDB();
    const userId = req.user.id;

    const count = (db.healthNotifications || [])
      .filter(n => n.userId === userId && !n.read)
      .length;

    res.json({ success: true, count });
  } catch (error) {
    console.error('[通知] 获取未读数失败:', error);
    res.status(500).json({ success: false, error: '获取未读数失败' });
  }
});

/**
 * GET /api/healthcheck/latest/:serverId
 * 获取单台服务器最新巡检状态
 */
router.get('/latest/:serverId', authMiddleware, async (req, res) => {
  try {
    const requestUserId = req.user.id;
    const { serverId } = req.params;

    const db = await getDB();

    // 验证服务器归属
    const server = (db.userServers || []).find(
      s => s.id === serverId && s.userId === requestUserId
    );
    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const logs = (db.serverHealthLogs || [])
      .filter(l => l.serverId === serverId)
      .sort((a, b) => new Date(b.checkedAt) - new Date(a.checkedAt));

    const latest = logs[0] || null;

    res.json({
      success: true,
      data: latest
        ? {
            serverId,
            status: latest.status,
            checkedAt: latest.checkedAt,
            responseTime: latest.responseTime,
          }
        : null,
    });
  } catch (error) {
    console.error('[巡检] 获取最新状态失败:', error);
    res.status(500).json({ success: false, error: '获取状态失败' });
  }
});

export default router;
export { cleanupOldData };
