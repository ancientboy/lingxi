/**
 * WebSocket 代理路由
 * 
 * 解决 HTTPS 页面无法连接 ws:// 的问题
 * 前端连接 wss://lumeword.com/api/ws → 后端代理到用户服务器
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB } from '../utils/db.js';
import WebSocket from 'ws';
import expressWs from 'express-ws';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

// MVP 模式配置
const MVP_MODE = process.env.MVP_MODE === 'true' || true; // 临时强制启用 MVP 模式
const SHARED_GATEWAY = {
  url: process.env.OPENCLAW_URL || 'http://localhost:18789',
  token: process.env.MVP_OPENCLAW_TOKEN || process.env.OPENCLAW_TOKEN || '6f3719a52fa12799fea8e4a06655703f',
  session: process.env.MVP_OPENCLAW_SESSION || process.env.OPENCLAW_SESSION || 'c308f1f0'
};

/**
 * 获取用户的 Gateway 配置
 */
async function getUserGatewayConfig(userId) {
  const db = await getDB();
  const user = db.users?.find(u => u.id === userId);
  console.log("🔍 getUserGatewayConfig userId:", userId, "user:", user?.nickname);
  
  if (!user) {
    return null;
  }
  
  // 查找用户的独立服务器
  const userServer = db.userServers?.find(s => s.userId === user.id);
  
  console.log("🔍 userServer:", userServer?.ip, userServer?.status);
  if (userServer && userServer.status === 'running' && userServer.ip) {
    // 用户有独立服务器
    return {
      wsUrl: `ws://${userServer.ip === "120.55.192.144" ? "localhost" : userServer.ip}:${userServer.openclawPort}`,
      session: userServer.openclawSession,
      token: userServer.openclawToken,
      sessionPrefix: `user_${user.id.substring(0, 8)}`
    };
  } else if (MVP_MODE) {
    // MVP 模式：使用共享实例
    return {
      wsUrl: `ws://localhost:18789`,
      session: SHARED_GATEWAY.session,
      token: SHARED_GATEWAY.token,
      sessionPrefix: `user_${user.id.substring(0, 8)}`
    };
  }
  
  return null;
}

/**
 * WebSocket 升级处理函数
 * 需要在 express-ws 初始化后使用
 */
export function setupWebSocketProxy(app) {
  // 使用 express-ws
  expressWs(app);
  
  // WebSocket 代理端点
  app.ws('/api/ws', async (ws, req) => {
    let targetWs = null;
    let userId = null;
    
    try {
      // 从查询参数获取 token
      const token = req.query.token;
      
      if (!token) {
        console.log('❌ WebSocket 缺少 token');
        ws.send(JSON.stringify({ type: 'error', error: '未授权' }));
        ws.close();
        return;
      }
      
      // 验证 token
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId;
      } catch (e) {
        console.log('❌ WebSocket token 无效:', e.message);
        ws.send(JSON.stringify({ type: 'error', error: '登录已过期' }));
        ws.close();
        return;
      }
      
      // 获取用户 Gateway 配置
      const gatewayConfig = await getUserGatewayConfig(userId);
      
      if (!gatewayConfig) {
        console.log('❌ 用户无可用 Gateway:', userId);
        ws.send(JSON.stringify({ type: 'error', error: '无可用服务器' }));
        ws.close();
        return;
      }
      
      const targetUrl = `${gatewayConfig.wsUrl}/${gatewayConfig.session}/ws?token=${gatewayConfig.token}`;
      const wsHost = gatewayConfig.wsUrl.replace('ws://', '');
      console.log(`🔌 [${userId.substring(0, 8)}] 代理 WebSocket → ${targetUrl}`);
      console.log(`   Gateway Token: ${gatewayConfig.token}`);
      console.log(`   JWT Token: ${token.substring(0, 20)}...`);
      console.log(`   Host: ${req.get('host')}`);
      console.log(`   Protocol: ${req.headers['x-forwarded-proto'] || req.protocol}`);
      
      // 连接目标 WebSocket（设置 Origin 为用户服务器地址，绕过 CORS 检查）
      targetWs = new WebSocket(targetUrl, {
        headers: {
          'Origin': `http://${wsHost}`,
          'Authorization': `Bearer ${gatewayConfig.token}`,
        }
      });
      
      targetWs.on('open', () => {
        console.log(`✅ [${userId.substring(0, 8)}] 已连接到目标 Gateway`);
      });
      
      // 双向转发消息（自动处理 challenge）
      targetWs.on("message", (data) => {
        console.log(`📥 [${userId.substring(0, 8)}] Gateway 消息:`, data.toString().substring(0, 100));
        console.log(`   客户端状态: ${ws.readyState}, OPEN=${WebSocket.OPEN}`);
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        } catch (e) {
          console.error('转发消息到客户端失败:', e);
        }
      });
      
      ws.on('message', (data) => {
        try {
          // 记录客户端发来的消息
          const msgStr = data.toString();
          const msgPreview = msgStr.substring(0, 500);
          console.log(`📤 [${userId?.substring(0, 8)}] 客户端消息:`, msgPreview);
          
          // 检查是否是 chat.send 且有 attachments
          try {
            const msg = JSON.parse(msgStr);
            if (msg.method === 'chat.send' && msg.params?.attachments) {
              console.log(`📎 [${userId?.substring(0, 8)}] 发送附件:`, msg.params.attachments.length, '个');
              console.log(`   附件类型:`, msg.params.attachments.map(a => a.type).join(', '));
            }
          } catch (e) {}
          
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(data);
          }
        } catch (e) {
          console.error('转发消息到 Gateway 失败:', e);
        }
      });
      
      // 处理连接关闭
      targetWs.on('close', (code, reason) => {
        console.log(`🔌 [${userId.substring(0, 8)}] 目标 Gateway 已断开: ${code}`);
        if (ws.readyState === WebSocket.OPEN) {
          const validCode = (code >= 1000 && code < 5000) ? code : 1000;
          ws.close(validCode, (reason && typeof reason === 'string') ? reason : "")
        }
      });
      
      ws.on('close', (code, reason) => {
        console.log(`🔌 [${userId.substring(0, 8)}] 客户端已断开: ${code}`);
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
          if (code && code >= 1000 && code <= 1015) { targetWs.close(code, (reason && typeof reason === 'string') ? reason : ''); } else { targetWs.close(1000, (reason && typeof reason === 'string') ? reason : ''); }
        }
      });
      
      // 处理错误
      targetWs.on('error', (error) => {
        console.error(`❌ [${userId.substring(0, 8)}] 目标 Gateway 错误:`, error.message);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', error: 'Gateway 连接失败' }));
          ws.close();
        }
      });
      
      ws.on('error', (error) => {
        console.error(`❌ [${userId.substring(0, 8)}] 客户端 WebSocket 错误:`, error.message);
      });
      
    } catch (error) {
      console.error('WebSocket 代理错误:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', error: error.message }));
        ws.close();
      }
    }
  });
  
  console.log('✅ WebSocket 代理已启用: /api/ws');
}

export default router;
