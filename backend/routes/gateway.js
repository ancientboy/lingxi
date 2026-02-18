import { Router } from 'express';
import { getDB } from '../utils/db.js';

const router = Router();

// Gateway 配置（从环境变量读取，不暴露给前端）
const GATEWAY_CONFIG = {
  url: process.env.OPENCLAW_URL || 'http://localhost:18789',
  token: process.env.OPENCLAW_TOKEN || '6f3719a52fa12799fea8e4a06655703f',
  session: process.env.OPENCLAW_SESSION || 'c308f1f0'
};

/**
 * 获取 Gateway WebSocket 地址（不暴露 token）
 */
router.get('/ws-info', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' ? 'wss' : 'ws';
  const wsHost = host.split(':')[0]; // 去掉端口
  
  res.json({
    wsUrl: `${protocol}://${wsHost}:18789`,
    session: GATEWAY_CONFIG.session,
    // 不返回 token！
  });
});

/**
 * 验证用户并返回临时连接凭证
 * 前端需要先登录，才能获取 Gateway 连接信息
 */
router.get('/connect-info', async (req, res) => {
  // 验证用户登录状态
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  
  // 验证 token
  const db = await getDB();
  const user = db.users?.find(u => u.token === token);
  
  if (!user) {
    return res.status(401).json({ error: '登录已过期' });
  }
  
  // 返回连接信息（包含 token）
  // 注意：这里返回 token 是因为前端 WebSocket 需要用
  // 但只有登录用户才能获取
  const host = req.get('host') || 'localhost:3000';
  const wsHost = host.split(':')[0];
  
  res.json({
    wsUrl: `ws://${wsHost}:18789`,
    session: GATEWAY_CONFIG.session,
    token: GATEWAY_CONFIG.token,
    // 用户专属会话前缀
    sessionPrefix: `user_${user.id.substring(0, 8)}`
  });
});

/**
 * 代理 WebSocket 连接（更安全的方案）
 * 前端连接后端，后端再连接 Gateway
 */
router.post('/proxy', async (req, res) => {
  const { message, sessionKey } = req.body;
  
  // 验证用户
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  const db = await getDB();
  const user = db.users?.find(u => u.token === token);
  
  if (!user) {
    return res.status(401).json({ error: '登录已过期' });
  }
  
  try {
    // 代理请求到 Gateway
    const response = await fetch(`${GATEWAY_CONFIG.url}/${GATEWAY_CONFIG.session}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GATEWAY_CONFIG.token}`
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

export default router;
