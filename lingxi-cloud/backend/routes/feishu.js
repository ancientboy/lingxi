/**
 * 飞书配置路由
 */

import { Router } from 'express';
import { getDB, saveDB } from '../utils/db.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

const router = Router();

// 飞书 API 基础地址
const FEISHU_API = 'https://open.feishu.cn/open-apis';

/**
 * 获取飞书访问令牌
 */
async function getFeishuToken(appId, appSecret) {
  const response = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    })
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.msg || '获取令牌失败');
  }
  
  return data.tenant_access_token;
}

/**
 * 获取应用信息
 */
async function getAppInfo(token) {
  const response = await fetch(`${FEISHU_API}/bot/v3/info`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return await response.json();
}

/**
 * 配置飞书 - 验证并保存
 */
router.post('/configure', async (req, res) => {
  try {
    const { userId, appId, appSecret } = req.body;
    
    if (!userId || !appId || !appSecret) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    console.log(`🔧 配置飞书: 用户 ${userId}`);
    
    // 1. 验证凭证 - 获取访问令牌
    let token;
    try {
      token = await getFeishuToken(appId, appSecret);
    } catch (e) {
      return res.status(400).json({ 
        error: '飞书凭证无效',
        detail: e.message 
      });
    }
    
    // 2. 获取应用信息
    let appInfo;
    try {
      appInfo = await getAppInfo(token);
    } catch (e) {
      console.log('获取应用信息失败，但凭证有效');
      appInfo = { bot: { app_name: '灵犀云助手' } };
    }
    
    // 3. 保存配置
    const db = await getDB();
    
    // 确保有 feishuConfigs 数组
    if (!db.feishuConfigs) {
      db.feishuConfigs = [];
    }
    
    // 检查是否已存在配置
    const existingIndex = db.feishuConfigs.findIndex(c => c.userId === userId);
    
    const config = {
      userId,
      appId,
      appSecret,  // 注意：生产环境应该加密存储
      botName: appInfo.bot?.app_name || '灵犀云助手',
      status: 'active',
      createdAt: new Date().toISOString(),
      webhookUrl: `${process.env.SERVER_URL || 'http://localhost:3000'}/api/feishu/webhook/${userId}`
    };
    
    if (existingIndex >= 0) {
      db.feishuConfigs[existingIndex] = config;
    } else {
      db.feishuConfigs.push(config);
    }
    
    await saveDB(db);
    
    console.log(`✅ 飞书配置成功: ${config.botName}`);
    
    res.json({
      success: true,
      config: {
        botName: config.botName,
        webhookUrl: config.webhookUrl,
        status: config.status
      },
      message: '飞书配置成功！请在飞书开放平台配置以下事件订阅地址'
    });
    
  } catch (error) {
    console.error('飞书配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取飞书配置状态
 */
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    const config = db.feishuConfigs?.find(c => c.userId === userId);
    
    if (!config) {
      return res.json({ 
        configured: false,
        message: '尚未配置飞书' 
      });
    }
    
    res.json({
      configured: true,
      botName: config.botName,
      status: config.status,
      webhookUrl: config.webhookUrl,
      createdAt: config.createdAt
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 飞书消息回调 Webhook
 */
router.post('/webhook/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const event = req.body;
    
    // URL 验证（飞书要求）
    if (event.type === 'url_verification') {
      console.log('✅ 飞书 URL 验证:', event.challenge);
      return res.json({ challenge: event.challenge });
    }
    
    console.log(`📩 收到飞书消息: 用户 ${userId}`);
    
    // 处理消息事件
    if (event.header?.event_type === 'im.message.receive_v1') {
      const message = event.event?.message;
      const content = JSON.parse(message?.content || '{}');
      const userText = content.text || '';
      
      console.log('💬 消息内容:', userText);
      
      // 转发到 OpenClaw
      const reply = await callOpenClaw(userId, userText);
      
      // 发送回复到飞书
      if (reply) {
        await sendFeishuMessage(userId, message.chat_id, reply);
      }
      
      return res.json({ code: 0, msg: 'success' });
    }
    
    res.json({ code: 0, msg: 'ignored' });
    
  } catch (error) {
    console.error('处理飞书消息失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 调用 OpenClaw 进行对话（多用户隔离版本）
 */
async function callOpenClaw(userId, text) {
  const db = await getDB();
  
  // 获取用户信息
  const user = db.users?.find(u => u.id === userId);
  const feishuConfig = db.feishuConfigs?.find(c => c.userId === userId);
  
  // 🔒 从 userServers 表获取用户的专属实例信息
  const userServer = db.userServers?.find(s => s.userId === userId && s.status === 'running');
  
  // 优先级：飞书配置 > 用户服务器 > 环境变量（共享实例）
  const openclawUrl = feishuConfig?.openclawUrl || 
                      (userServer ? `http://${userServer.ip}:${userServer.openclawPort}` : null) ||
                      config.openclaw.url;
                      
  const openclawToken = feishuConfig?.openclawToken || 
                        userServer?.openclawToken ||
                        config.openclaw.token;
                        
  const openclawSession = feishuConfig?.openclawSession || 
                          userServer?.openclawSession ||
                          config.openclaw.session;
  
  // 检查是否有专属实例
  if (!userServer) {
    logger.warn(`用户 ${userId} 没有专属实例，使用共享实例`);
  }
  
  // 用户标签
  const userTag = user?.nickname || userId.substring(0, 8);
  const taggedMessage = `[${userTag}] ${text}`;
  
  logger.debug(`用户隔离: 用户=${userId}, Session=${openclawSession}, 实例=${openclawUrl}`);
  
  try {
    const response = await fetch(`${openclawUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openclawToken}`
      },
      body: JSON.stringify({ 
        message: taggedMessage,  // 带用户标识的消息
        userId: userId,           // 传递真实用户ID
        source: 'feishu',
        userTag: userTag          // 用户标签
      })
    });
    
    if (!response.ok) {
      console.log('OpenClaw 调用失败，使用降级回复');
      return buildFallbackReply(text);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || data.response || data.message || '灵犀收到了你的消息~';
    
  } catch (error) {
    console.error('调用 OpenClaw 失败:', error.message);
    return buildFallbackReply(text);
  }
}

/**
 * 降级回复
 */
function buildFallbackReply(text) {
  return `我是灵犀 ⚡\n\n你说：${text}\n\n我已收到，稍后为你处理～`;
}

/**
 * 删除飞书配置
 */
router.delete('/config/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    if (!db.feishuConfigs) {
      return res.json({ success: true, message: '无配置需要删除' });
    }
    
    const index = db.feishuConfigs.findIndex(c => c.userId === userId);
    if (index >= 0) {
      db.feishuConfigs.splice(index, 1);
      await saveDB(db);
    }
    
    res.json({ success: true, message: '飞书配置已删除' });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 发送飞书消息
 */
async function sendFeishuMessage(userId, chatId, content) {
  const db = await getDB();
  const config = db.feishuConfigs?.find(c => c.userId === userId);
  
  if (!config) {
    throw new Error('飞书未配置');
  }
  
  const token = await getFeishuToken(config.appId, config.appSecret);
  
  await fetch(`${FEISHU_API}/im/v1/messages?receive_id_type=chat_id`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text: content })
    })
  });
}

export default router;
