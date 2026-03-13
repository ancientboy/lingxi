/**
 * 管理后台路由 - 服务器管理
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB } from '../../utils/db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

// ============ 中间件 ============

// Token 验证
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

// 管理员验证
async function adminMiddleware(req, res, next) {
  try {
    const db = await getDB();
    const user = db.users.find(u => u.id === req.userId);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, error: '需要管理员权限' });
    }
    
    req.adminUser = user;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: '服务器错误' });
  }
}

// 组合中间件
const adminOnly = [authMiddleware, adminMiddleware];

// ============ 服务器列表 ============

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = await getDB();
    
    // 从 userServers 表读取服务器信息
    const userServers = db.userServers || [];
    
    // 关联用户信息
    const servers = userServers.map(server => {
      const user = db.users.find(u => u.id === server.userId);
      return {
        serverId: server.id || server.instanceId,
        userId: server.userId,
        nickname: user?.nickname || '未知用户',
        isAdmin: user?.isAdmin || false,
        subscription: user?.subscription || { plan: 'free' },
        serverInfo: {
          ip: server.ip,
          host: server.ip,
          port: server.openclawPort || 18789,
          url: `http://${server.ip}:${server.openclawPort || 18789}/${server.openclawSession || 'main'}/`,
          session: server.openclawSession || 'main',
          token: server.openclawToken
        },
        aliyunInstanceId: server.aliyunInstanceId,
        region: server.region,
        spec: server.spec,
        status: server.status,
        healthCheckedAt: server.healthCheckedAt,
        createdAt: server.createdAt,
        lastLoginAt: user?.lastLoginAt,
        credits: user?.credits
      };
    });
    
    res.json({
      success: true,
      servers,
      total: servers.length
    });
    
  } catch (error) {
    console.error('获取服务器列表失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ============ 服务器详情 ============

router.get('/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    let serverInfo = null;
    
    if (user.openclawUrl) {
      try {
        const url = new URL(user.openclawUrl);
        serverInfo = {
          url: user.openclawUrl,
          host: url.hostname,
          port: user.openclawPort || url.port || (url.protocol === 'https:' ? 443 : 80),
          session: user.openclawSession || 'main',
          ip: user.ip || url.hostname
        };
      } catch (e) {
        serverInfo = {
          url: user.openclawUrl,
          host: user.ip || 'unknown',
          port: user.openclawPort || 80,
          session: user.openclawSession || 'main',
          ip: user.ip || 'unknown'
        };
      }
    } else if (user.serverInfo) {
      serverInfo = user.serverInfo;
    }
    
    if (!serverInfo) {
      return res.status(404).json({ success: false, error: '该用户没有配置服务器' });
    }
    
    res.json({
      success: true,
      server: {
        userId: user.id,
        nickname: user.nickname,
        isAdmin: user.isAdmin,
        serverInfo,
        instanceId: user.instanceId,
        instanceStatus: user.instanceStatus,
        credits: user.credits,
        subscription: user.subscription
      }
    });
    
  } catch (error) {
    console.error('获取服务器详情失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

export default router;
