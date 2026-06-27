/**
 * SSE 聊天接口 — 替代 WebSocket 流式
 * 
 * 流程：
 * 1. POST /api/chat-sse/send  → 发送消息
 * 2. GET /api/chat-sse/stream → SSE 流式接收响应
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { getDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import {
  getGatewayClient,
  subscribeEvents,
  sendChatMessage,
  getChatHistory,
  getSessionList,
  getPoolStatus,
} from '../utils/gateway-pool.js';

const router = Router();
const JWT_SECRET = config.security.jwtSecret;

// 认证中间件
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.userId) return res.status(401).json({ error: '登录已过期' });
    
    const db = await getDB();
    const user = db.users?.find(u => u.id === decoded.userId);
    if (!user) return res.status(401).json({ error: '用户不存在' });
    
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期' });
  }
}

/**
 * POST /api/chat-sse/send — 发送消息
 */
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { message, sessionKey, agentId, model } = req.body;

    if (!message || !sessionKey) {
      return res.status(400).json({ error: '消息和会话不能为空' });
    }

    console.log(`[SSE] 发送消息: ${req.user.id.substring(0, 8)} → ${sessionKey}`);

    await sendChatMessage(req.user.id, { message, sessionKey, agentId, model });

    res.json({ success: true });
  } catch (error) {
    console.error('[SSE] 发送失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/chat-sse/stream — SSE 流式接收
 */
router.get('/stream', authMiddleware, async (req, res) => {
  const sessionKey = req.query.sessionKey;

  if (!sessionKey) {
    return res.status(400).json({ error: '缺少 sessionKey' });
  }

  // 设置 SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx 不缓冲

  // 确保连接
  try {
    const client = await getGatewayClient(req.user.id);
    if (!client.connected) {
      await client.connect();
    }
  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    return res.end();
  }

  // 发送连接成功事件
  res.write(`event: connected\ndata: ${JSON.stringify({ sessionKey })}\n\n`);

  // 订阅事件
  const unsubscribe = subscribeEvents(req.user.id, (ev) => {
    // 只转发 chat 事件和 sessions.updated
    if (ev.event === 'chat') {
      const payload = ev.payload || {};
      res.write(`event: chat\ndata: ${JSON.stringify(payload)}\n\n`);
    } else if (ev.event === 'sessions.updated') {
      res.write(`event: sessions.updated\ndata: ${JSON.stringify(ev.payload || {})}\n\n`);
    }
  });

  // 心跳
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30_000);

  // 客户端断开
  req.on('close', () => {
    console.log(`[SSE] 客户端断开: ${req.user.id.substring(0, 8)}`);
    clearInterval(heartbeat);
    unsubscribe();
  });

  console.log(`[SSE] 流建立: ${req.user.id.substring(0, 8)} → ${sessionKey}`);
});

/**
 * GET /api/chat-sse/history — 获取聊天历史
 */
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { sessionKey, limit = 50 } = req.query;

    if (!sessionKey) {
      return res.status(400).json({ error: '缺少 sessionKey' });
    }

    const messages = await getChatHistory(req.user.id, sessionKey, parseInt(limit));
    res.json({ success: true, messages });
  } catch (error) {
    console.error('[SSE] 获取历史失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/chat-sse/sessions — 获取会话列表
 */
router.get('/sessions', authMiddleware, async (req, res) => {
  try {
    const sessions = await getSessionList(req.user.id);
    res.json({ success: true, sessions });
  } catch (error) {
    console.error('[SSE] 获取会话失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/chat-sse/status — 连接池状态（调试）
 */
router.get('/status', authMiddleware, (req, res) => {
  res.json({ success: true, pool: getPoolStatus() });
});

export default router;
