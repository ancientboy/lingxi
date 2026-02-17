import { Router } from 'express';
import { getDB, saveDB } from '../utils/db.js';
import crypto from 'crypto';

const router = Router();

// 企业微信 API 基础地址
const WECOM_API = 'https://qyapi.weixin.qq.com/cgi-bin';

/**
 * 获取企业微信访问令牌
 */
async function getWeComToken(corpid, corpsecret) {
  const response = await fetch(
    `${WECOM_API}/gettoken?corpid=${corpid}&corpsecret=${corpsecret}`
  );
  
  const data = await response.json();
  
  if (data.errcode !== 0) {
    throw new Error(data.errmsg || '获取令牌失败');
  }
  
  return data.access_token;
}

/**
 * 配置企业微信 - 验证并保存
 */
router.post('/configure', async (req, res) => {
  try {
    const { userId, corpId, agentId, secret, token, encodingAESKey } = req.body;
    
    if (!userId || !corpId || !agentId || !secret) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    console.log(`🔧 配置企业微信: 用户 ${userId}`);
    
    // 1. 验证凭证 - 获取访问令牌
    let accessToken;
    try {
      accessToken = await getWeComToken(corpId, secret);
    } catch (e) {
      return res.status(400).json({ 
        error: '企业微信凭证无效',
        detail: e.message 
      });
    }
    
    // 2. 获取应用信息
    let appInfo = { name: '灵犀云助手' };
    try {
      const appRes = await fetch(
        `${WECOM_API}/agent/get?access_token=${accessToken}&agentid=${agentId}`
      );
      const appData = await appRes.json();
      if (appData.errcode === 0) {
        appInfo = appData;
      }
    } catch (e) {
      console.log('获取应用信息失败，但凭证有效');
    }
    
    // 3. 保存配置
    const db = await getDB();
    
    if (!db.wecomConfigs) {
      db.wecomConfigs = [];
    }
    
    const existingIndex = db.wecomConfigs.findIndex(c => c.userId === userId);
    
    const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
    
    const config = {
      userId,
      corpId,
      agentId,
      secret,
      token: token || 'lingxi2026',  // 消息令牌
      encodingAESKey: encodingAESKey || crypto.randomBytes(43).toString('base64'),
      appName: appInfo.name || '灵犀云助手',
      status: 'active',
      createdAt: new Date().toISOString(),
      callbackUrl: `${serverUrl}/api/wecom/callback/${userId}`
    };
    
    if (existingIndex >= 0) {
      db.wecomConfigs[existingIndex] = config;
    } else {
      db.wecomConfigs.push(config);
    }
    
    await saveDB(db);
    
    console.log(`✅ 企业微信配置成功: ${config.appName}`);
    
    res.json({
      success: true,
      config: {
        appName: config.appName,
        callbackUrl: config.callbackUrl,
        token: config.token,
        encodingAESKey: config.encodingAESKey,
        status: config.status
      },
      message: '企业微信配置成功！请在企微管理后台配置以下回调地址'
    });
    
  } catch (error) {
    console.error('企业微信配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 企业微信消息回调
 */
router.post('/callback/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const body = req.body;
    
    console.log(`📩 收到企业微信消息: 用户 ${userId}`);
    
    // 企业微信消息是 XML 格式
    if (typeof body === 'string' && body.includes('<xml>')) {
      // 解析 XML
      const msg = parseWeComXML(body);
      
      if (msg.MsgType === 'text') {
        const userText = msg.Content;
        console.log('💬 消息内容:', userText);
        
        // 转发到 OpenClaw
        const reply = await callOpenClaw(userId, userText);
        
        // 返回 XML 格式回复
        const replyXML = buildWeComReplyXML(msg, reply);
        res.set('Content-Type', 'application/xml');
        return res.send(replyXML);
      }
    }
    
    res.send('success');
    
  } catch (error) {
    console.error('处理企业微信消息失败:', error);
    res.status(500).send('error');
  }
});

/**
 * 企业微信 URL 验证
 */
router.get('/callback/:userId', (req, res) => {
  const { msg_signature, timestamp, nonce, echostr } = req.query;
  console.log('✅ 企业微信 URL 验证');
  res.send(echostr);
});

/**
 * 获取配置状态
 */
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    const config = db.wecomConfigs?.find(c => c.userId === userId);
    
    if (!config) {
      return res.json({ 
        configured: false,
        message: '尚未配置企业微信' 
      });
    }
    
    res.json({
      configured: true,
      appName: config.appName,
      status: config.status,
      callbackUrl: config.callbackUrl,
      createdAt: config.createdAt
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除配置
 */
router.delete('/config/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    if (db.wecomConfigs) {
      const index = db.wecomConfigs.findIndex(c => c.userId === userId);
      if (index >= 0) {
        db.wecomConfigs.splice(index, 1);
        await saveDB(db);
      }
    }
    
    res.json({ success: true, message: '企业微信配置已删除' });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 辅助函数 ============

/**
 * 解析企业微信 XML
 */
function parseWeComXML(xml) {
  const result = {};
  const regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/g;
  let match;
  
  while ((match = regex.exec(xml)) !== null) {
    const key = match[1] || match[3];
    const value = match[2] || match[4];
    result[key] = value;
  }
  
  return result;
}

/**
 * 构建企业微信回复 XML
 */
function buildWeComReplyXML(msg, content) {
  const timestamp = Date.now();
  return `<xml>
  <ToUserName><![CDATA[${msg.FromUserName}]]></ToUserName>
  <FromUserName><![CDATA[${msg.ToUserName}]]></FromUserName>
  <CreateTime>${timestamp}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${content}]]></Content>
</xml>`;
}

/**
 * 调用 OpenClaw
 */
async function callOpenClaw(userId, text) {
  const openclawUrl = process.env.OPENCLAW_URL || 'http://localhost:18789';
  const openclawToken = process.env.OPENCLAW_TOKEN || '6f3719a52fa12799fea8e4a06655703f';
  const openclawSession = process.env.OPENCLAW_SESSION || 'c308f1f0';
  
  try {
    const response = await fetch(`${openclawUrl}/${openclawSession}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openclawToken}`
      },
      body: JSON.stringify({ message: text, userId })
    });
    
    if (!response.ok) {
      return `收到：${text}\n\n（灵犀正在准备中～）`;
    }
    
    const data = await response.json();
    return data.response || data.message || '灵犀收到你的消息了~';
    
  } catch (error) {
    console.error('调用 OpenClaw 失败:', error.message);
    return `我是灵犀 ⚡\n\n你说：${text}\n\n我已收到~`;
  }
}

/**
 * 发送企业微信消息
 */
async function sendWeComMessage(userId, toUser, content) {
  const db = await getDB();
  const config = db.wecomConfigs?.find(c => c.userId === userId);
  
  if (!config) {
    throw new Error('企业微信未配置');
  }
  
  const token = await getWeComToken(config.corpId, config.secret);
  
  await fetch(`${WECOM_API}/message/send?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: toUser,
      msgtype: 'text',
      agentid: config.agentId,
      text: { content }
    })
  });
}

export default router;
