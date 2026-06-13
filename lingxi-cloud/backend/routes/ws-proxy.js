/**
 * ⚠️ DEPRECATED: Gateway WS 代理路由，已冻结不再新增功能。
 * Lume WS (lume-ws-proxy.js) 是主力通道。本文件仅在 Lume 不可用时降级使用。
 * P2 计划：后续逐步移除，统一为 Lume WS + HTTP 降级。
 *
 * WebSocket 代理路由
 * 
 * 解决 HTTPS 页面无法连接 ws:// 的问题
 * 前端连接 wss://lumeword.com/api/ws → 后端代理到用户服务器
 * 
 * 🔧 2026-03-17: 添加超时机制，防止连接泄漏导致服务器崩溃
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB } from '../utils/db.js';
import WebSocket from 'ws';
import expressWs from 'express-ws';
import crypto from 'crypto';
import { replaceImageUrls, replaceHistoryImageUrls } from '../utils/image-downloader.js';
import { getActiveServer } from '../utils/activeServer.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

// ⏱️ 超时配置（防止连接泄漏）
const WS_CONNECT_TIMEOUT = 15000;    // WebSocket 连接超时：15秒
const HTTP_REQUEST_TIMEOUT = 180000;  // HTTP 请求超时：180秒（大模型长对话需要更久）
const IDLE_TIMEOUT = 300000;         // 空闲超时：5分钟无活动则断开

// MVP 模式配置 - ❌ 已禁用，防止用户连接到本地 OpenClaw
const MVP_MODE = process.env.MVP_MODE === 'true' && false;  // 强制禁用
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
  
  const userServer = getActiveServer(db, user.id);
  
  console.log("🔍 userServer:", userServer?.ip, userServer?.status);
  
  // 🔒 只要有 IP 的服务器就尝试连接（即使 status 是 unhealthy，可能刚恢复）
  if (userServer && userServer.ip) {
    const httpUrl = `http://${userServer.ip === "120.55.192.144" ? "localhost" : userServer.ip}:${userServer.openclawPort}`;
    return {
      wsUrl: `ws://${userServer.ip === "120.55.192.144" ? "localhost" : userServer.ip}:${userServer.openclawPort}`,
      httpUrl: httpUrl,
      basePath: userServer.openclawSession,
      session: userServer.openclawSession,
      token: userServer.openclawToken,
      sessionPrefix: `user_${user.id.substring(0, 8)}`
    };
  }
  
  // ❌ 没有运行中的服务器 → 拒绝连接（防止连接到本地 OpenClaw）
  console.log("⚠️ 用户没有运行中的服务器，拒绝 WebSocket 连接:", userId);
  return null;
}

/**
 * 🆕 通过 HTTP responses API 发送带附件的消息（图片或文档）
 * OpenClaw HTTP API 支持图片 URL 和文档 URL，不需要转 base64
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
  
  // 2. 添加附件（图片或文档）
  // 🆕 同时保存原始 URL 映射，用于历史消息转换
  const allowedDocMimes = [
    'application/pdf',      // PDF
    'text/plain',           // 纯文本
    'text/markdown',        // Markdown
    'text/html',            // HTML
    'text/csv',             // CSV
    'application/json',     // JSON
    // Office 文档（新格式）
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // Word (.docx)
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        // Excel (.xlsx)
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PowerPoint (.pptx)
    // Office 文档（旧格式）
    'application/msword',            // Word (.doc)
    'application/vnd.ms-excel',      // Excel (.xls)
    'application/vnd.ms-powerpoint'  // PowerPoint (.ppt)
  ];
  
  let imageCount = 0;
  let documentCount = 0;
  
  for (const att of attachments) {
    const fileUrl = att.url || att.content;
    if (!fileUrl || !/^https?:\/\//.test(fileUrl)) {
      continue;
    }
    
    const mimeType = att.mimeType || att.type || '';
    
    // 图片类型
    if (mimeType.startsWith('image/')) {
      inputContent.push({
        type: 'input_image',
        source: {
          type: 'url',
          url: fileUrl
        }
      });
      imageCount++;
      console.log(`   📷 添加图片: ${fileUrl}`);
    }
    // 文档类型
    else if (allowedDocMimes.includes(mimeType)) {
      inputContent.push({
        type: 'input_file',
        source: {
          type: 'url',
          url: fileUrl,
          media_type: mimeType,
          filename: att.filename || 'document'
        }
      });
      documentCount++;
      console.log(`   📄 添加文档: ${fileUrl} (${mimeType})`);
    }
  }
  
  // 3. 提取 agentId
  const agentId = sessionKey?.split(':').pop() || 'main';
  
  // 4. 构建 responses API 请求
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
  console.log(`   - 图片数量: ${imageCount}`);
  console.log(`   - 文档数量: ${documentCount}`);
  
  // ⏱️ 使用 AbortController 实现超时
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    console.log(`⏱️ [HTTP] 请求超时，已取消`);
  }, HTTP_REQUEST_TIMEOUT);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayConfig.token}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);  // 清除超时定时器
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`✅ [HTTP] responses API 成功`);
    
    return result;
  } catch (error) {
    clearTimeout(timeoutId);  // 确保清除定时器
    
    // 区分超时错误和其他错误
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }
    
    console.error(`❌ [HTTP] responses API 失败:`, error.message);
    throw error;
  }
}

/**
 * 🆕 生成语音
 */
/**
 * 智能判断是否需要生成语音
 * @param {string} message - 回复文本
 * @returns {boolean} - 是否需要生成语音
 */
function shouldGenerateTTS(message) {
  if (!message || typeof message !== 'string') return false;
  
  // 1. 不包含代码块
  if (message.includes('```')) {
    console.log('⚠️ 包含代码块，跳过语音生成');
    return false;
  }
  
  // 2. 不包含文件路径（/path/to/file 或 C:\path\to\file）
  if (/[\/\\]/.test(message) && message.match(/[\/\\]/g).length > 2) {
    console.log('⚠️ 包含文件路径，跳过语音生成');
    return false;
  }
  
  // 3. 不包含命令行（$ command 或 > command）
  if (/^\$\s|^>\s/m.test(message)) {
    console.log('⚠️ 包含命令行，跳过语音生成');
    return false;
  }
  
  // 4. 长度适中（< 300 字）
  if (message.length > 300) {
    console.log(`⚠️ 消息过长 (${message.length} 字)，跳过语音生成`);
    return false;
  }
  
  // 5. 不包含过多技术符号（{}, (), [], ;, :）
  const techSymbols = (message.match(/[{}()\[\];:]/g) || []).length;
  if (techSymbols > 10) {
    console.log(`⚠️ 技术符号过多 (${techSymbols} 个)，跳过语音生成`);
    return false;
  }
  
  // 6. 不包含 Markdown 标题（# ## ###）
  if (/^#{1,3}\s/m.test(message)) {
    console.log('⚠️ 包含 Markdown 标题，跳过语音生成');
    return false;
  }
  
  console.log(`✅ 适合生成语音 (${message.length} 字，${techSymbols} 个符号)`);
  return true;
}

async function generateTTS(text) {
  try {
    const response = await fetch('http://localhost:3000/api/tts/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    
    if (!response.ok) {
      throw new Error(`TTS API 失败: ${response.status}`);
    }
    
    const result = await response.json();
    return result.success ? result.audio_url : null;
  } catch (error) {
    console.error('❌ 生成语音失败:', error.message);
    return null;
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
    let needsTTS = false; // 🆕 标记是否需要语音回复
    let connectTimer = null;  // ⏱️ 连接超时定时器
    let idleTimer = null;     // ⏱️ 空闲超时定时器
    
    // ⏱️ 清理所有定时器和连接
    const cleanup = () => {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (targetWs) {
        try {
          if (targetWs.readyState === WebSocket.OPEN || targetWs.readyState === WebSocket.CONNECTING) {
            targetWs.close(1000, 'cleanup');
          }
        } catch (e) {
          // 忽略关闭错误
        }
        targetWs = null;
      }
    };
    
    // ⏱️ 重置空闲定时器
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        console.log(`⏱️ [${userId?.substring(0, 8)}] 连接空闲超时，自动断开`);
        cleanup();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', error: '连接超时，请重新连接' }));
          ws.close(1000, 'idle timeout');
        }
      }, IDLE_TIMEOUT);
    };
    
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
      
      // ⏱️ 设置连接超时
      connectTimer = setTimeout(() => {
        if (targetWs && targetWs.readyState === WebSocket.CONNECTING) {
          console.error(`⏱️ [${userId?.substring(0, 8)}] 连接 Gateway 超时`);
          cleanup();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', error: '服务器连接超时，请稍后重试' }));
            ws.close(1001, 'connect timeout');
          }
        }
      }, WS_CONNECT_TIMEOUT);
      
      // ⏱️ 启动空闲定时器
      resetIdleTimer();
      
      targetWs.on('open', () => {
        // ⏱️ 清除连接超时定时器
        if (connectTimer) {
          clearTimeout(connectTimer);
          connectTimer = null;
        }
        
        console.log(`✅ [${userId.substring(0, 8)}] 已连接到 Gateway（透传模式）`);
        
        // 透传模式：不发送 connect，让前端自己发送
        while (messageQueue.length > 0) {
          const msg = messageQueue.shift();
          targetWs.send(msg);
          console.log(`📤 [${userId.substring(0, 8)}] 发送队列消息 (剩余: ${messageQueue.length})`);
        }
      });
      
      targetWs.on('message', async (data) => {
        // ⏱️ 收到消息，重置空闲定时器
        resetIdleTimer();
        
        // 🔍 调试日志：确认 Gateway 回复到达
        try {
          const debugMsg = JSON.parse(data.toString());
          console.log(`📥 [${userId?.substring(0, 8)}] Gateway 回复: type=${debugMsg.type} method=${debugMsg.method||debugMsg.event||'?'} ok=${debugMsg.ok}`);
        } catch(e) {}
        
        try {
          const msgStr = data.toString();
          const msg = JSON.parse(msgStr);

          // 🔍 拦截 AI 响应中的图片 URL
          if (msg.type === 'event' && msg.event === 'chat') {
            // 提取文本（兼容多种消息格式）
            const rawMessage = msg.payload?.message;
            let text = '';
            
            // 调试：打印完整的消息结构
            if (needsTTS && msg.payload?.state === 'final') {
              console.log(`🔍 [${userId?.substring(0, 8)}] 完整消息结构:`);
              console.log(JSON.stringify(rawMessage, null, 2).substring(0, 500));
            }
            
            // 尝试提取文本（兼容多种消息格式）
            if (typeof rawMessage === 'string') {
              text = rawMessage;
            } else if (rawMessage?.content) {
              if (typeof rawMessage.content === 'string') {
                text = rawMessage.content;
              } else if (Array.isArray(rawMessage.content)) {
                // Anthropic 格式：content 是数组，只取 text 类型的 block
                text = rawMessage.content
                  .filter(block => block.type === 'text')
                  .map(block => block.text)
                  .join('');
                // 如果全是 tool_use 块没有 text 块，text 为空
              } else {
                text = rawMessage.content.text || '';
              }
            } else if (rawMessage?.text) {
              text = rawMessage.text;
            } else if (rawMessage?.parts && Array.isArray(rawMessage.parts)) {
              // Anthropic 格式：{parts: [{text: "..."}]}
              text = rawMessage.parts.map(p => p.text || '').join('');
            }
            
            // 🚫 过滤心跳/静默消息 — 不转发给前端
            if (text === 'HEARTBEAT_OK' || text === 'NO_REPLY' || 
                (text && text.includes('HEARTBEAT.md')) ||
                (text && text.includes('HEARTBEAT_OK'))) {
              console.log(`⏭️ [${userId?.substring(0, 8)}] 拦截心跳消息: ${text?.substring(0, 30)}`);
              return; // 不转发给前端
            }
            
            // 🚫 过滤工具调用消息（无实际文本内容，只含 tool_use 块）
            if (!text || text.trim().length === 0) {
              // 检查是否是纯工具调用（有 content 数组但全是 tool_use 类型）
              const content = rawMessage?.content;
              if (Array.isArray(content) && content.length > 0 && 
                  content.every(block => block.type !== 'text')) {
                console.log(`⏭️ [${userId?.substring(0, 8)}] 跳过工具调用消息`);
                return;
              }
              // 其他空文本也跳过（避免空气泡）
              if (msg.payload?.state === 'final') {
                console.log(`⏭️ [${userId?.substring(0, 8)}] 跳过空 final 消息`);
                return;
              }
            }

            // 🔍 调试：打印收到的消息
            if (needsTTS) {
              console.log(`🔍 [${userId?.substring(0, 8)}] 收到 chat 事件:`);
              console.log(`   - state: ${msg.payload?.state}`);
              console.log(`   - text: ${text.substring(0, 100)}`);
              console.log(`   - needsTTS: ${needsTTS}`);
            }
            
            if (typeof text === 'string' && text.includes('dashscope-result')) {
              // 替换图片 URL（下载到本地）
              const modifiedText = await replaceImageUrls(text, userId);
              msg.payload.message = modifiedText;
              console.log(`🖼️ [${userId?.substring(0, 8)}] 已替换图片 URL`);
            }
            
            // 🆕 自动生成语音（如果需要且内容适合）
            if (needsTTS && text && typeof text === 'string' && text.length > 0) {
              // 智能判断是否需要生成语音
              if (shouldGenerateTTS(text)) {
                console.log(`🔊 [${userId?.substring(0, 8)}] 自动生成语音...`);
                const audioUrl = await generateTTS(text);
                if (audioUrl) {
                  msg.payload.audio_url = audioUrl;
                  console.log(`✅ [${userId?.substring(0, 8)}] 语音已生成: ${audioUrl}`);
                }
              } else {
                console.log(`⏭️ [${userId?.substring(0, 8)}] 跳过语音生成（内容不适合）`);
              }
              needsTTS = false; // 重置标记
            }
          }

          // 🔍 拦截历史消息中的图片 URL + 过滤心跳消息
          if (msg.type === 'res' && msg.ok && msg.payload?.messages) {
            const messages = msg.payload.messages;
            let modified = false;

            for (let i = 0; i < messages.length; i++) {
              const msgText = messages[i].content || '';
              if (typeof msgText === 'string' && msgText.includes('dashscope-result')) {
                // 替换历史图片 URL（基于文件名匹配）
                messages[i].content = await replaceHistoryImageUrls(msgText, userId);
                modified = true;
              }
            }

            if (modified) {
              console.log(`🔄 [${userId?.substring(0, 8)}] 已替换历史消息中的图片 URL`);
            }

            // 🚫 过滤非用户可见消息（心跳、工具调用、系统消息、空消息）
            const beforeLen = msg.payload.messages.length;
            msg.payload.messages = msg.payload.messages.filter(m => {
              const role = m.role || '';
              // 过滤非对话角色（工具、系统等）
              if (role === 'toolResult' || role === 'system' || role === 'tool' || 
                  role === 'tool_use' || role === 'function_call') return false;
              if (role !== 'user' && role !== 'assistant') return false;
              
              const content = typeof m.content === 'string' ? m.content : 
                              (Array.isArray(m.content) 
                                ? m.content.filter(b => b.type === 'text').map(b => b.text).join('')
                                : (m.content?.text || m.text || ''));
              // 过滤助手的心跳/静默回复
              if (content === 'HEARTBEAT_OK' || content === 'NO_REPLY') return false;
              // 过滤包含心跳关键词的消息（prompt + 回复 + 系统通知）
              if (typeof content === 'string' && content.includes('HEARTBEAT.md')) return false;
              if (typeof content === 'string' && content.includes('HEARTBEAT_OK')) return false;
              if (typeof content === 'string' && content.includes('Exec completed (') && content.includes('Read HEARTBEAT')) return false;
              if (typeof content === 'string' && content.includes('Exec failed (') && content.includes('Read HEARTBEAT')) return false;
              // 过滤空消息（工具调用的 text block 为空）
              if (!content || content.trim().length === 0) return false;
              // 过滤纯元数据消息
              if (content.includes('<<<EXTERNAL_UNTRUSTED_CONTENT') && 
                  content.includes('"url":') && !content.includes('[附件:')) return false;
              return true;
            });
            const filtered = beforeLen - msg.payload.messages.length;
            if (filtered > 0) {
              console.log(`🧹 [${userId?.substring(0, 8)}] 过滤了 ${filtered} 条心跳消息 (剩余 ${msg.payload.messages.length} 条)`);
            }
          }

          // 🆕 注入模型信息到 final 事件
          if (msg.payload?.state === 'final' && userId) {
            try {
              // 优先从 OpenClaw payload 中提取 model/usage
              const msgObj = msg.payload.message;
              const ocModel = msgObj?.model || msgObj?.modelProvider;
              const ocUsage = msgObj?.usage;
              
              if (ocModel || ocUsage) {
                msg.payload.modelInfo = {
                  model: ocModel || 'auto',
                  inputTokens: ocUsage?.input || ocUsage?.inputTokens || null,
                  outputTokens: ocUsage?.output || ocUsage?.outputTokens || null,
                };
              } else {
                // 降级：从用户偏好获取模型名
                const db = await getDB();
                const u = (db.users || []).find(u => u.id === userId);
                const preferredModel = u?.preferredModel || 'auto';
                msg.payload.modelInfo = { model: preferredModel };
              }
              console.log(`🏷️ [${userId?.substring(0, 8)}] 注入 modelInfo:`, JSON.stringify(msg.payload.modelInfo));
            } catch (_) {}
          }

          // 转发给前端
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
            // 🔍 Debug: dump final payload keys to see if usage exists
            if (msg.payload?.state === 'final') {
              console.log(`📋 [${userId?.substring(0, 8)}] final payload keys:`, Object.keys(msg.payload));
            }
            console.log(`➡️ [${userId?.substring(0, 8)}] 已转发给前端: type=${msg.type} event=${msg.event||'-'} state=${msg.payload?.state||'-'}`);
          } else {
            console.log(`❌ [${userId?.substring(0, 8)}] 前端 WebSocket 已关闭，无法转发`);
          }
        } catch (e) {
          // 解析失败，直接转发
          console.error('❌ 解析/处理 Gateway 消息失败:', e.message);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        }
      });
      
      ws.on('message', async (data) => {
        // ⏱️ 收到客户端消息，重置空闲定时器
        resetIdleTimer();
        
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
              
              // 🆕 检测语音输入（消息以 "[语音]" 开头或包含音频标记）
              const message = msg.params?.message || '';
              if (message.includes('[语音]') || message.includes('🎤')) {
                needsTTS = true;
                console.log(`🎤 [${userId?.substring(0, 8)}] 检测到语音输入，启用 TTS 回复`);
              }
              
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
                  const isTimeout = httpError.message && (httpError.message.includes('超时') || httpError.message.includes('timeout'));
                  
                  // 🔧 超时自动重试 1 次
                  if (isTimeout) {
                    console.warn('[WS] HTTP 超时，自动重试 1 次...');
                    try {
                      const retryResult = await sendImageMessageViaHTTP({
                        gatewayConfig: gatewayConfig,
                        message: msg.params?.message || '',
                        attachments: msg.params.attachments,
                        sessionKey: msg.params?.sessionKey,
                        requestId: msg.id
                      });
                      const retryText = retryResult?.output?.[0]?.content?.[0]?.text || '图片处理完成';
                      if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: true, payload: { text: retryText, done: true } }));
                        ws.send(JSON.stringify({ type: 'event', event: 'chat', payload: { message: retryText, sessionKey: msg.params?.sessionKey, state: 'final', done: true } }));
                      }
                      return;
                    } catch (retryErr) {
                      console.error('[WS] 重试也失败:', retryErr.message);
                      // Fall through to error response
                    }
                  }
                  
                  // HTTP 失败 → 返回错误
                  console.error('[WS] HTTP 发送最终失败:', httpError.message);
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
            console.log(`📤 [${userId?.substring(0, 8)}] 已转发到 Gateway, method=${msg?.method}, 消息大小: ${dataToSend.length} 字节`);
            // 临时文件日志
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
        console.log(`🔌 [${userId?.substring(0, 8)}] 目标 Gateway 已断开: ${code}`);
        cleanup();
        if (ws.readyState === WebSocket.OPEN) {
          const validCode = (code >= 1000 && code < 5000) ? code : 1000;
          ws.close(validCode, (reason && typeof reason === 'string') ? reason : '');
        }
      });
      
      ws.on('close', (code, reason) => {
        console.log(`🔌 [${userId?.substring(0, 8)}] 客户端已断开: ${code}`);
        cleanup();
      });
      
      targetWs.on('error', (error) => {
        console.error(`❌ [${userId?.substring(0, 8)}] 目标 Gateway 错误:`, error.message);
        cleanup();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', error: 'Gateway 连接失败: ' + error.message }));
          ws.close(1011, 'Gateway error');
        }
      });
      
      ws.on('error', (error) => {
        console.error(`❌ [${userId?.substring(0, 8)}] 客户端 WebSocket 错误:`, error.message);
        cleanup();
      });
      
    } catch (error) {
      console.error('WebSocket 代理错误:', error);
      cleanup();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', error: error.message }));
        ws.close();
      }
    }
  });
}

/**
 * 媒体文件代理路由
 * 用于访问 OpenClaw 存储的图片/文档
 * 
 * 格式：GET /api/media/inbound/:filename
 * 代理到：http://用户服务器IP/media/inbound/:filename (nginx)
 */
router.get('/media/inbound/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const userId = req.query.user_id || req.headers['x-user-id'];
    
    if (!userId) {
      return res.status(401).json({ error: '未授权访问' });
    }
    
    // 获取用户的 Gateway 配置
    const gatewayConfig = await getUserGatewayConfig(userId);
    const userServerIP = gatewayConfig.httpUrl?.replace('http://', '').split(':')[0] || '120.26.33.181';
    
    // 构建媒体文件 URL（通过 nginx 访问）
    const mediaUrl = `http://${userServerIP}/media/inbound/${filename}`;
    console.log(`📷 代理媒体文件: ${mediaUrl}`);
    
    // 代理请求
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: '文件不存在' });
    }
    
    // 获取 Content-Type
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    
    // 流式传输文件内容
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
    
  } catch (error) {
    console.error('媒体文件代理错误:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
