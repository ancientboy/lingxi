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
      token: token,  // JWT token，用于 WebSocket 代理验证
      gatewayToken: userServer.openclawToken,  // OpenClaw token，用于 connect 消息
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
      token: token,  // JWT token，用于 WebSocket 代理验证
      gatewayToken: SHARED_GATEWAY.token,  // OpenClaw token，用于 connect 消息
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
    const response = await fetch(`${gatewayUrl}/${gatewaySession}/api/gateway/proxy`, {
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

/**
 * 删除会话 - 直接操作文件系统
 * OpenClaw 没有 HTTP API 删除会话，webchat 客户端也没有权限
 * 解决方案：直接删除文件系统中的会话文件
 */
router.delete('/session/:sessionKey', async (req, res) => {
  const { sessionKey } = req.params;
  
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
  
  // 验证会话归属（sessionKey 应该包含用户的 sessionPrefix）
  const expectedPrefix = `user_${user.id.substring(0, 8)}`;
  if (!sessionKey.startsWith(expectedPrefix) && !sessionKey.startsWith('agent:')) {
    return res.status(403).json({ error: '无权删除此会话' });
  }
  
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    // OpenClaw 工作区路径
    const openclawDir = process.env.OPENCLAW_STATE_DIR || '/root/.openclaw';
    
    // 解析 sessionKey
    // 格式可能是: user_xxx:main, user_xxx:chat_xxx, agent:lingxi:main 等
    let agentId = 'main';  // 默认使用 main agent
    let sessionId = sessionKey;
    
    // 如果是 agent:xxx 格式
    if (sessionKey.startsWith('agent:')) {
      const parts = sessionKey.split(':');
      if (parts.length >= 2) {
        agentId = parts[1];
        sessionId = parts.slice(2).join(':') || 'main';
      }
    } else if (sessionKey.includes(':')) {
      // user_xxx:xxx 格式
      const parts = sessionKey.split(':');
      sessionId = parts.slice(1).join(':');
    }
    
    // 会话目录
    const sessionsDir = path.join(openclawDir, 'agents', agentId, 'sessions');
    const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
    
    // 删除会话文件（.jsonl）
    let deletedFiles = [];
    
    // 查找匹配的文件
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir);
      for (const file of files) {
        // 精确匹配或主题匹配
        if (file === `${sessionId}.jsonl` || 
            file.startsWith(`${sessionId}-topic-`) ||
            file.startsWith(`${sessionId}.jsonl.`)) {
          const filePath = path.join(sessionsDir, file);
          try {
            fs.unlinkSync(filePath);
            deletedFiles.push(file);
            console.log(`🗑️ 删除会话文件: ${file}`);
          } catch (e) {
            console.error(`删除文件失败: ${file}`, e.message);
          }
        }
      }
    }
    
    // 更新 sessions.json
    if (fs.existsSync(sessionsJsonPath)) {
      try {
        const sessionsContent = fs.readFileSync(sessionsJsonPath, 'utf-8');
        const sessionsData = JSON.parse(sessionsContent);
        
        // 删除会话记录
        if (sessionsData.sessions && Array.isArray(sessionsData.sessions)) {
          const before = sessionsData.sessions.length;
          sessionsData.sessions = sessionsData.sessions.filter(s => s.key !== sessionKey);
          const after = sessionsData.sessions.length;
          
          if (before !== after) {
            fs.writeFileSync(sessionsJsonPath, JSON.stringify(sessionsData, null, 2));
            console.log(`📝 已从 sessions.json 中移除 ${before - after} 条记录`);
          }
        }
        
        // 也检查 sessions 对象格式（可能是 key-value 格式）
        if (sessionsData.sessions && typeof sessionsData.sessions === 'object' && !Array.isArray(sessionsData.sessions)) {
          if (sessionsData.sessions[sessionKey]) {
            delete sessionsData.sessions[sessionKey];
            fs.writeFileSync(sessionsJsonPath, JSON.stringify(sessionsData, null, 2));
            console.log(`📝 已从 sessions.json 中移除会话: ${sessionKey}`);
          }
        }
      } catch (e) {
        console.error('更新 sessions.json 失败:', e.message);
      }
    }
    
    if (deletedFiles.length > 0) {
      console.log(`✅ 会话已删除: ${sessionKey}, 文件: ${deletedFiles.join(', ')}`);
      res.json({ 
        success: true, 
        deletedFiles: deletedFiles.length,
        message: '会话已删除'
      });
    } else {
      // 会话可能不存在，也算成功
      console.log(`⚠️ 会话文件未找到: ${sessionKey}`);
      res.json({ 
        success: true, 
        message: '会话不存在或已删除'
      });
    }
    
  } catch (error) {
    console.error('删除会话错误:', error);
    res.status(500).json({ error: '删除会话失败: ' + error.message });
  }
});

// 获取媒体文件（TTS 语音等）
router.get('/media', async (req, res) => {
  const { path: mediaPath } = req.query;
  
  if (!mediaPath) {
    return res.status(400).json({ error: '缺少文件路径' });
  }
  
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
    // 通过 OpenClaw 的静态文件服务获取媒体文件
    const response = await fetch(`${gatewayUrl}/${gatewaySession}${mediaPath}`);
    
    if (!response.ok) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    // 获取 content-type
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    
    // 流式返回
    res.setHeader('Content-Type', contentType);
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
    
  } catch (error) {
    console.error('获取媒体文件错误:', error);
    res.status(500).json({ error: '获取媒体文件失败' });
  }
});

export default router;