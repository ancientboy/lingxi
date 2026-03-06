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
import crypto from 'crypto';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

// MVP 模式配置
const MVP_MODE = process.env.MVP_MODE === 'true' || true;
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
  
  const userServer = db.userServers?.find(s => s.userId === user.id);
  
  console.log("🔍 userServer:", userServer?.ip, userServer?.status);
  if (userServer && userServer.status === 'running' && userServer.ip) {
    return {
      wsUrl: `ws://${userServer.ip === "120.55.192.144" ? "localhost" : userServer.ip}:${userServer.openclawPort}`,
      session: userServer.openclawSession,
      token: userServer.openclawToken,
      sessionPrefix: `user_${user.id.substring(0, 8)}`
    };
  } else if (MVP_MODE) {
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
 */
export function setupWebSocketProxy(app) {
  expressWs(app);
  
  app.ws('/api/ws', async (ws, req) => {
    let targetWs = null;
    let userId = null;
    const messageQueue = [];
    
    try {
      const token = req.query.token;
      
      if (!token) {
        console.log('❌ WebSocket 缺少 token');
        ws.send(JSON.stringify({ type: 'error', error: '未授权' }));
        ws.close();
        return;
      }
      
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
      
      const gatewayConfig = await getUserGatewayConfig(userId);

      if (!gatewayConfig) {
        console.log('❌ 未找到用户 Gateway 配置:', userId);
        ws.send(JSON.stringify({ type: 'error', error: '未找到服务器配置' }));
        ws.close();
        return;
      }

      console.log(`🔌 [${userId.substring(0, 8)}] WebSocket 连接建立`);
      console.log(`   - Gateway: ${gatewayConfig.wsUrl}`);
      
      targetWs = new WebSocket(gatewayConfig.wsUrl, {
        headers: {
          'Authorization': `Bearer ${gatewayConfig.token}`
        }
      });
      
      targetWs.on('open', async () => {
        console.log(`✅ [${userId.substring(0, 8)}] 已连接到 Gateway`);
        
        const connectMsg = {
          type: 'req',
          id: `connect_${Date.now()}`,
          method: 'connect',
          params: {
            session: gatewayConfig.session,
            sessionPrefix: gatewayConfig.sessionPrefix
          }
        };
        targetWs.send(JSON.stringify(connectMsg));
        console.log(`📤 [${userId.substring(0, 8)}] 已发送 connect 请求`);
        
        while (messageQueue.length > 0) {
          const msg = messageQueue.shift();
          targetWs.send(msg);
          console.log(`📤 [${userId.substring(0, 8)}] 发送队列消息 (剩余: ${messageQueue.length})`);
        }
      });
      
      targetWs.on('message', (data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
      
      ws.on('message', async (data) => {
        try {
          const msgStr = data.toString();
          let msg;
          
          try {
            msg = JSON.parse(msgStr);
            
            if (msg.method === 'connect') {
              console.log(`🚫 [${userId?.substring(0, 8)}] 拦截前端 connect 请求（后端已处理）`);
              return;
            }
            
            const isChatSend = msg.method === 'chat.send';
            
            if (isChatSend) {
              console.log(`💬 [${userId?.substring(0, 8)}] chat.send 检测到`);
              console.log(`   - message: ${(msg.params?.message || '').substring(0, 50)}`);
              console.log(`   - attachments: ${msg.params?.attachments?.length || 0} 个`);
              
              if (msg.params?.attachments?.length > 0) {
                msg.params.attachments.forEach((att, i) => {
                  const urlLen = att.url?.length || 0;
                  const contentLen = att.content?.length || 0;
                  console.log(`   - 附件${i + 1}: type=${att.type}, url长度=${urlLen}, content长度=${contentLen}`);
                });
                
                // OpenClaw Gateway 只接受 content (base64)，不接受 url
                // 所以需要下载图片并转成 base64
                for (let i = 0; i < msg.params.attachments.length; i++) {
                  const att = msg.params.attachments[i];
                  
                  // 如果有 URL 但没有 content，需要下载并转换
                  if (att.url && !att.content) {
                    console.log(`📥 [${userId?.substring(0, 8)}] 下载图片: ${att.url}`);
                    
                    try {
                      const imgRes = await fetch(att.url);
                      
                      if (!imgRes.ok) {
                        console.error(`❌ [${userId?.substring(0, 8)}] 下载图片失败: ${imgRes.status}`);
                        continue;
                      }
                      
                      const buffer = await imgRes.arrayBuffer();
                      const base64 = Buffer.from(buffer).toString('base64');
                      
                      // OpenClaw 期望的格式: { type, mimeType, content }
                      msg.params.attachments[i] = {
                        type: att.type || 'image',
                        mimeType: att.mimeType || imgRes.headers.get('content-type') || 'image/png',
                        content: base64
                      };
                      
                      console.log(`✅ [${userId?.substring(0, 8)}] 图片已转 base64, 大小: ${base64.length} 字节`);
                    } catch (e) {
                      console.error(`❌ [${userId?.substring(0, 8)}] 下载图片失败:`, e.message);
                    }
                  }
                }
              }
            } else {
              console.log(`📤 [${userId?.substring(0, 8)}] 方法: ${msg.method}`);
            }
          } catch (e) {
            console.log(`📤 [${userId?.substring(0, 8)}] 客户端消息(解析失败):`, msgStr.substring(0, 200));
          }
          
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            const dataToSend = msg ? JSON.stringify(msg) : data;
            targetWs.send(dataToSend);
            console.log(`📤 [${userId?.substring(0, 8)}] 已转发到 Gateway, 消息大小: ${dataToSend.length} 字节`);
          } else if (targetWs && targetWs.readyState === WebSocket.CONNECTING) {
            const dataToSend = msg ? JSON.stringify(msg) : data;
            messageQueue.push(dataToSend);
            console.log(`⏳ [${userId?.substring(0, 8)}] Gateway 连接中，消息已加入队列 (队列长度: ${messageQueue.length})`);
          } else {
            console.log(`❌ [${userId?.substring(0, 8)}] Gateway 未连接, 无法转发 (readyState: ${targetWs?.readyState})`);
          }
        } catch (e) {
          console.error('转发消息到 Gateway 失败:', e);
        }
      });
      
      targetWs.on('close', (code, reason) => {
        console.log(`🔌 [${userId.substring(0, 8)}] 目标 Gateway 已断开: ${code}`);
        if (ws.readyState === WebSocket.OPEN) {
          const validCode = (code >= 1000 && code < 5000) ? code : 1000;
          ws.close(validCode, (reason && typeof reason === 'string') ? reason : '');
        }
      });
      
      ws.on('close', (code, reason) => {
        console.log(`🔌 [${userId.substring(0, 8)}] 客户端已断开: ${code}`);
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
          if (code && code >= 1000 && code <= 1015) {
            targetWs.close(code, (reason && typeof reason === 'string') ? reason : '');
          } else {
            targetWs.close(1000, (reason && typeof reason === 'string') ? reason : '');
          }
        }
      });
      
      targetWs.on('error', (error) => {
        console.error(`❌ [${userId.substring(0, 8)}] 目标 Gateway 错误:`, error.message);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', error: 'Gateway 连接失败' }));
          ws.close(1011, 'Gateway error');
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
}

export default router;
