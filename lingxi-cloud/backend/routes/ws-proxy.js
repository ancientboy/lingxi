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
import { replaceImageUrls, replaceHistoryImageUrls } from '../utils/image-downloader.js';

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
    const httpUrl = `http://${userServer.ip === "120.55.192.144" ? "localhost" : userServer.ip}:${userServer.openclawPort}`;
    return {
      wsUrl: `ws://${userServer.ip === "120.55.192.144" ? "localhost" : userServer.ip}:${userServer.openclawPort}`,
      httpUrl: httpUrl,  // 👈 新增 HTTP URL
      basePath: userServer.openclawSession,
      session: userServer.openclawSession,
      token: userServer.openclawToken,
      sessionPrefix: `user_${user.id.substring(0, 8)}`
    };
  } else if (MVP_MODE) {
    return {
      wsUrl: `ws://localhost:18789`,
      httpUrl: `http://localhost:18789`,  // 👈 新增 HTTP URL
      basePath: SHARED_GATEWAY.session,
      session: SHARED_GATEWAY.session,
      token: SHARED_GATEWAY.token,
      sessionPrefix: `user_${user.id.substring(0, 8)}`
    };
  }
  
  return null;
}

/**
 * 🆕 通过 HTTP responses API 发送带图片的消息
 * OpenClaw HTTP API 支持图片 URL，不需要转 base64
 */
async function sendImageMessageViaHTTP(params) {
  const { gatewayConfig, message, attachments, sessionKey, requestId } = params;
  
  // 构建 responses API 格式的 input
  const inputContent = [];
  
  // 1. 添加文本
  if (message && message.trim()) {
    inputContent.push({
      type: 'input_text',
      text: message.trim()
    });
  }
  
  // 2. 添加图片（直接传 URL，OpenClaw 会自动下载）
  for (const att of attachments) {
    const imageUrl = att.url || att.content;
    if (imageUrl && /^https?:\/\//.test(imageUrl)) {
      inputContent.push({
        type: 'input_image',
        source: {
          type: 'url',
          url: imageUrl
        }
      });
    }
  }
  
  // 3. 提取 agentId
  const agentId = sessionKey?.split(':').pop() || 'main';
  
  // 4. 构建 responses API 请求（路径不带 basePath）
  const url = `${gatewayConfig.httpUrl}/v1/responses`;
  const body = {
    model: `agent:${agentId}`,
    input: [{
      type: 'message',
      role: 'user',
      content: inputContent
    }]
  };
  
  console.log(`📤 [HTTP] 发送到 responses API: ${url}`);
  console.log(`   - agentId: ${agentId}`);
  console.log(`   - 图片数量: ${attachments.length}`);
  console.log(`   - 请求体:`, JSON.stringify(body, null, 2));
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayConfig.token}`
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`✅ [HTTP] responses API 成功`);
    
    return result;
  } catch (error) {
    console.error(`❌ [HTTP] responses API 失败:`, error.message);
    throw error;
  }
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
      
      const origin = gatewayConfig.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      console.log(`🔧 [${userId.substring(0, 8)}] 设置 Origin: ${origin}`);
      
      targetWs = new WebSocket(gatewayConfig.wsUrl, {
        headers: {
          // 使用目标 Gateway 的地址作为 Origin（绕过 Origin 检查）
          'Origin': origin
        }
      });
      
      targetWs.on('open', () => {
        console.log(`✅ [${userId.substring(0, 8)}] 已连接到 Gateway（透传模式）`);
        
        // 透传模式：不发送 connect，让前端自己发送
        while (messageQueue.length > 0) {
          const msg = messageQueue.shift();
          targetWs.send(msg);
          console.log(`📤 [${userId.substring(0, 8)}] 发送队列消息 (剩余: ${messageQueue.length})`);
        }
      });
      
      targetWs.on('message', async (data) => {
        try {
          const msgStr = data.toString();
          const msg = JSON.parse(msgStr);

          // 🔍 拦截 AI 响应中的图片 URL
          if (msg.type === 'event' && msg.event === 'chat') {
            const text = msg.payload?.message || '';
            if (text && text.includes('dashscope-result')) {
              // 替换图片 URL（下载到本地）
              const modifiedText = await replaceImageUrls(text, userId);
              msg.payload.message = modifiedText;
              console.log(`🖼️ [${userId?.substring(0, 8)}] 已替换图片 URL`);
            }
          }

          // 🔍 拦截历史消息中的图片 URL
          if (msg.type === 'res' && msg.ok && msg.payload?.messages) {
            const messages = msg.payload.messages;
            let modified = false;

            for (let i = 0; i < messages.length; i++) {
              const msgText = messages[i].content || '';
              if (msgText.includes('dashscope-result')) {
                // 替换历史图片 URL（基于文件名匹配）
                messages[i].content = await replaceHistoryImageUrls(msgText, userId);
                modified = true;
              }
            }

            if (modified) {
              console.log(`🔄 [${userId?.substring(0, 8)}] 已替换历史消息中的图片 URL`);
            }
          }

          // 转发给前端
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
          }
        } catch (e) {
          // 解析失败，直接转发
          console.error('解析 Gateway 消息失败:', e);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        }
      });
      
      ws.on('message', async (data) => {
        try {
          const msgStr = data.toString();
          let msg;
          
          try {
            msg = JSON.parse(msgStr);
            
            // 透传模式：不拦截 connect，让前端自己处理
            const isChatSend = msg.method === 'chat.send';
            
            if (isChatSend) {
              console.log(`💬 [${userId?.substring(0, 8)}] chat.send 检测到`);
              console.log(`   - message: ${(msg.params?.message || '').substring(0, 50)}`);
              console.log(`   - attachments: ${msg.params?.attachments?.length || 0} 个`);
              
              if (msg.params?.attachments?.length > 0) {
                // 🆕 有图片 → 使用 HTTP responses API（支持 URL）
                console.log(`🖼️ [${userId?.substring(0, 8)}] 检测到图片，使用 HTTP responses API`);
                
                try {
                  const result = await sendImageMessageViaHTTP({
                    gatewayConfig: gatewayConfig,
                    message: msg.params?.message || '',
                    attachments: msg.params.attachments,
                    sessionKey: msg.params?.sessionKey,
                    requestId: msg.id
                  });
                  
                  // 提取响应文本
                  const responseText = result?.output?.[0]?.content?.[0]?.text || '图片处理完成';
                  
                  console.log(`✅ [${userId?.substring(0, 8)}] HTTP 响应: ${responseText.substring(0, 50)}...`);
                  
                  // 返回前端期望的格式
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'res',
                      id: msg.id,
                      ok: true,
                      payload: {
                        text: responseText,
                        done: true
                      }
                    }));
                    
                    // 发送完成事件（包含 sessionKey）
                    ws.send(JSON.stringify({
                      type: 'event',
                      event: 'chat',
                      payload: {
                        message: responseText,
                        sessionKey: msg.params?.sessionKey,  // ✅ 添加 sessionKey
                        state: 'final',
                        done: true
                      }
                    }));
                  }
                  return;  // 不通过 WebSocket 转发
                } catch (httpError) {
                  // HTTP 失败 → 返回错误
                  console.error(`❌ [${userId?.substring(0, 8)}] HTTP 发送失败:`, httpError.message);
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'res',
                      id: msg.id,
                      ok: false,
                      error: { code: 'IMAGE_SEND_FAILED', message: httpError.message }
                    }));
                  }
                  return;
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
