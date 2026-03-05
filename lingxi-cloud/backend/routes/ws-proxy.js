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
      
      // 消息队列：缓存连接建立前的消息
      const messageQueue = [];
      
      // 连接目标 WebSocket（设置 Origin 为用户服务器地址，绕过 CORS 检查）
      targetWs = new WebSocket(targetUrl, {
        headers: {
          'Origin': `http://${wsHost}`,
          'Authorization': `Bearer ${gatewayConfig.token}`,
        }
      });
      
      targetWs.on('open', () => {
        console.log(`✅ [${userId.substring(0, 8)}] 已连接到目标 Gateway`);
        
        // 发送队列中的消息
        if (messageQueue.length > 0) {
          console.log(`📤 [${userId.substring(0, 8)}] 发送队列中的 ${messageQueue.length} 条消息`);
          while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            if (targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(msg);
              console.log(`📤 [${userId.substring(0, 8)}] 队列消息已发送, 大小: ${msg.length} 字节`);
            }
          }
        }
      });
      
      // 双向转发消息（自动处理 challenge）
      targetWs.on("message", (data) => {
        const msgStr = data.toString();
        console.log(`📥 [${userId.substring(0, 8)}] Gateway 消息:`, msgStr.substring(0, 100));
        console.log(`   客户端状态: ${ws.readyState}, OPEN=${WebSocket.OPEN}`);
        
        try {
          const msg = JSON.parse(msgStr);
          
          // 处理 challenge - 重新发送 connect request (用于 token auth)
          if (msg.type === 'event' && msg.event === 'connect.challenge') {
            const nonce = msg.payload?.nonce;
            if (nonce) {
              console.log(`🔐 [${userId.substring(0, 8)}] 收到 challenge，nonce: ${nonce.substring(0, 16)}...`);
              
              // 重新发送 connect request，保持与第一次连接相同
              // 使用 Gateway 允许的 client.id (必须在 GATEWAY_CLIENT_IDS 中)
              const connectRequest = {
                type: 'req',
                id: `connect_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
                method: 'connect',
                params: {
                  minProtocol: 3,
                  maxProtocol: 3,
                  client: {
                    id: 'openclaw-control-ui',  // 使用允许的 client.id
                    displayName: '灵犀云',
                    version: '1.0.0',
                    platform: 'linux',
                    mode: 'backend'
                  },
                  role: 'operator',
                  scopes: ['operator.admin'],
                  caps: [],
                  auth: {
                    token: gatewayConfig.token
                  },
                  userAgent: 'lingxi-cloud/1.0.0',
                  locale: 'zh-CN'
                }
              };
              
              console.log(`📤 [${userId.substring(0, 8)}] 发送 connect request (challenge 响应)`);
              targetWs.send(JSON.stringify(connectRequest));
              return;
            }
          }
          
          // 其他消息正常转发
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        } catch (e) {
          console.error('处理 Gateway 消息失败:', e);
        }
      });
      
      ws.on('message', async (data) => {
        try {
          // 记录原始消息长度
          const msgStr = data.toString();
          console.log(`📤 [${userId?.substring(0, 8)}] 收到客户端消息, 长度: ${msgStr.length} 字节`);
          
          // 检查是否是 chat.send（先解析，再打印）
          let msg;
          try {
            msg = JSON.parse(msgStr);
            
            // ⚠️ 拦截前端发的 connect 请求（后端已处理，不需要前端再发）
            if (msg.method === 'connect') {
              console.log(`🚫 [${userId?.substring(0, 8)}] 拦截前端 connect 请求（后端已处理）`);
              return;  // 不转发
            }
            
            const isChatSend = msg.method === 'chat.send';
            
            if (isChatSend) {
              console.log(`💬 [${userId?.substring(0, 8)}] ★★★ chat.send 检测到 ★★★`);
              console.log(`   - message: ${(msg.params?.message || '').substring(0, 50)}`);
              console.log(`   - attachments: ${msg.params?.attachments?.length || 0} 个`);
              if (msg.params?.attachments?.length > 0) {
                msg.params.attachments.forEach((att, i) => {
                  const urlLen = att.url?.length || 0;
                  const contentLen = att.content?.length || 0;
                  const mimeType = att.mimeType || '未知';
                  console.log(`   - 附件${i + 1}: type=${att.type}, mimeType=${mimeType}, url长度=${urlLen}, content长度=${contentLen}`);
                });
              }
              
              // ✅ 处理 URL 类型的附件：下载图片并转成 base64
              if (msg.params?.attachments?.length > 0) {
                for (let i = 0; i < msg.params.attachments.length; i++) {
                  const att = msg.params.attachments[i];
                  
                  // 如果有 URL 但没有 content，下载图片
                  if (att.url && !att.content) {
                    console.log(`📥 [${userId?.substring(0, 8)}] 下载图片: ${att.url}`);
                    try {
                      const imgRes = await fetch(att.url);
                      if (!imgRes.ok) {
                        console.error(`❌ 下载图片失败: ${imgRes.status}`);
                        continue;
                      }
                      
                      const buffer = await imgRes.arrayBuffer();
                      const base64 = Buffer.from(buffer).toString('base64');
                      
                      // 更新 attachment
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
            // 使用可能已修改的消息（处理过 URL 附件）
            // 转发前再次确认 attachments 状态
            if (msg?.params?.attachments?.length > 0) {
              console.log(`🔍 [${userId?.substring(0, 8)}] 转发前最终检查 attachments:`);
              msg.params.attachments.forEach((att, i) => {
                console.log(`   - 附件${i + 1}: type=${att.type}, mimeType=${att.mimeType}, content长度=${att.content?.length || 0}`);
              });
            }
            const dataToSend = msg ? JSON.stringify(msg) : data;
            targetWs.send(dataToSend);
            console.log(`📤 [${userId?.substring(0, 8)}] 已转发到 Gateway, 消息大小: ${dataToSend.length} 字节`);
          } else if (targetWs && targetWs.readyState === WebSocket.CONNECTING) {
            // Gateway 正在连接中，将消息加入队列
            const dataToSend = msg ? JSON.stringify(msg) : data;
            messageQueue.push(dataToSend);
            console.log(`⏳ [${userId?.substring(0, 8)}] Gateway 连接中，消息已加入队列 (队列长度: ${messageQueue.length})`);
          } else {
            console.log(`❌ [${userId?.substring(0, 8)}] Gateway 未连接，无法转发 (readyState: ${targetWs?.readyState})`);
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
          ws.close(1011, 'Gateway error');  // 1011 = Internal Error
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
