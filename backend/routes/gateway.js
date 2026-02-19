import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB } from '../utils/db.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

const SHARED_GATEWAY = {
  url: process.env.OPENCLAW_URL || 'http://localhost:18789',
  token: process.env.OPENCLAW_TOKEN || '6f3719a52fa12799fea8e4a06655703f',
  session: process.env.OPENCLAW_SESSION || 'c308f1f0'
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
  
  const userServer = db.userServers?.find(s => s.userId === user.id && s.status === 'running');
  
  if (userServer && userServer.ip) {
    res.json({
      mode: 'dedicated',
      wsUrl: `ws://${userServer.ip}:${userServer.openclawPort}`,
      session: userServer.openclawSession,
      token: userServer.openclawToken,
      sessionPrefix: `user_${user.id.substring(0, 8)}`,
      server: {
        ip: userServer.ip,
        port: userServer.openclawPort,
        status: userServer.status
      }
    });
  } else {
    const host = req.get('host') || 'localhost:3000';
    const wsHost = host.split(':')[0];
    
    res.json({
      mode: 'shared',
      wsUrl: `ws://${wsHost}:18789`,
      session: SHARED_GATEWAY.session,
      token: SHARED_GATEWAY.token,
      sessionPrefix: `user_${user.id.substring(0, 8)}`,
      server: null
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
