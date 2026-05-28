import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

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
  
  // 检查用户是否有团队（不管是否订阅）
  const hasAgents = user.agents && user.agents.length > 0;
  
  if (!hasAgents) {
    // 没有团队 → 免费 API 对话模式
    return res.status(403).json({ 
      mode: 'free',
      message: '请先领取 AI 团队以使用完整功能',
      needTeam: true
    });
  }
  
  // 有团队，查找活跃服务器
  const userServer = getActiveServer(db, user.id);
  
  // 🔧 修复：使用后端 WebSocket 代理，而不是直接连接用户服务器
  // 前端连接 wss://lumeword.com/api/ws，后端代理到用户服务器
  const host = req.get('host') || 'localhost:3000';
  const protocol = (req.headers['x-forwarded-proto'] || req.protocol) === 'https' ? 'wss' : 'ws';
  const wsHost = protocol === "wss" ? host.split(":")[0] : host;
  const wsUrl = `${protocol}://${wsHost}/api/ws`;
  
  if (userServer && userServer.status === 'running' && userServer.ip) {
    // 用户有独立服务器且已运行
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
  } else if (userServer && userServer.status === 'creating') {
    // 服务器正在创建中
    return res.status(403).json({ 
      error: '服务器正在创建中，请稍候...',
      needServer: true,
      status: 'creating'
    });
  } else {
    // 有团队但没有服务器（异常情况）
    return res.status(403).json({ 
      error: '服务器未就绪，请稍候重试',
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

export default router;
