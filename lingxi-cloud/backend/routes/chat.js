import { Router } from 'express';

const router = Router();

// OpenClaw 配置
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '6f3719a52fa12799fea8e4a06655703f';
const OPENCLAW_SESSION = process.env.OPENCLAW_SESSION || 'c308f1f0';

/**
 * 聊天代理 - 转发请求到 OpenClaw
 */
router.post('/send', async (req, res) => {
  try {
    const { message, userId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: '消息不能为空' });
    }
    
    console.log(`💬 [${userId || 'anonymous'}] ${message}`);
    
    // 调用 OpenClaw API
    const response = await fetch(`${OPENCLAW_URL}/${OPENCLAW_SESSION}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENCLAW_TOKEN}`
      },
      body: JSON.stringify({
        message,
        userId: userId || 'web-user',
        source: 'lingxi-cloud'
      })
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error('OpenClaw 响应错误:', response.status, text);
      return res.status(500).json({ error: 'AI 服务暂时不可用' });
    }
    
    const data = await response.json();
    
    res.json({
      success: true,
      response: data.response || data.message || '收到~'
    });
    
  } catch (error) {
    console.error('聊天代理错误:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
