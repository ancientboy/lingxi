import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB } from '../utils/db.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

// MVP 模式：默认关闭
const MVP_MODE = process.env.MVP_MODE === 'true';

const SHARED_GATEWAY = {
  url: process.env.OPENCLAW_URL || 'http://localhost:18789',
  token: process.env.MVP_OPENCLAW_TOKEN || process.env.OPENCLAW_TOKEN || '6f3719a52fa12799fea8e4a06655703f',
  session: process.env.MVP_OPENCLAW_SESSION || process.env.OPENCLAW_SESSION || 'c308f1f0'
};

router.get('/ws-info', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' ? 'wss' : 'ws';
  const wsHost = host.split(':')[0];
  
  res.json({
    wsUrl: `${protocol}://${wsHost}:18789`,
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
  
  // 🔒 生产模式：检查用户是否有团队
  if (!MVP_MODE) {
    if (!user.agents || user.agents.length === 0) {
      return res.status(403).json({ 
        error: '请先领取 AI 团队',
        needTeam: true 
      });
    }
  }
  
  // 查找用户的独立服务器
  const userServer = db.userServers?.find(s => s.userId === user.id);
  
  // 🔧 修复：使用后端 WebSocket 代理，而不是直接连接用户服务器
  // 前端连接 wss://lumeword.com/api/ws，后端代理到用户服务器
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${host}/api/ws`;
  
  if (userServer && userServer.status === 'running' && userServer.ip) {
    // 用户有独立服务器且已运行
    res.json({
      mode: 'dedicated',
      wsUrl: wsUrl,
      session: userServer.openclawSession,
      token: token,  // 返回用户的 JWT token，代理需要它来验证身份
      sessionPrefix: `user_${user.id.substring(0, 8)}`,
      server: {
        ip: userServer.ip,
        port: userServer.openclawPort,
        status: userServer.status
      }
    });
  } else if (userServer && userServer.status === 'creating') {
    // 服务器正在创建中
    return res.status(403).json({ 
      error: '服务器正在创建中，请稍候...',
      needServer: true,
      status: 'creating'
    });
  } else if (MVP_MODE) {
    // MVP 模式：使用共享实例
    res.json({
      mode: 'shared',
      wsUrl: wsUrl,
      session: SHARED_GATEWAY.session,
      token: token,  // 返回用户的 JWT token
      sessionPrefix: `user_${user.id.substring(0, 8)}`,
      server: null
    });
  } else {
    // 生产模式且无独立服务器：返回错误
    return res.status(403).json({ 
      error: '您还没有专属服务器，请联系管理员',
      needServer: true 
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
  
  const userServer = db.userServers?.find(s => s.userId === user.id && s.status === 'running');
  
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

export default router;
