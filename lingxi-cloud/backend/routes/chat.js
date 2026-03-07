import { Router } from 'express';
import { getUser } from '../utils/db.js';
import { checkDailyLimit, recordUsage } from '../utils/user_utils.js';
import { callModelAPI } from '../utils/model_api.js';

const router = Router();

// OpenClaw 配置
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '6f3719a52fa12799fea8e4a06655703f';
const OPENCLAW_SESSION = process.env.OPENCLAW_SESSION || 'c308f1f0';

/**
 * 免费用户纯模型对话
 */
router.post('/simple', async (req, res) => {
  try {
    const { userId, message, imageUrl } = req.body;

    if (!message && !imageUrl) {
      return res.status(400).json({ error: '消息不能为空' });
    }

    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }

    // 获取用户信息
    const user = await getUser(userId);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 检查是否是免费用户
    const plan = user.subscription?.plan || 'free';
    if (plan !== 'free') {
      return res.status(403).json({ error: '订阅用户请使用完整版' });
    }

    // 检查每日次数限制
    const limitCheck = await checkDailyLimit(userId);
    if (!limitCheck.allowed) {
      return res.status(429).json({ error: limitCheck.message });
    }

    // 直接调用模型 API（不经过 OpenClaw）
    const response = await callModelAPI(message || '请描述这张图片', imageUrl);

    // 记录使用次数
    await recordUsage(userId);

    res.json({
      success: true,
      response: response
    });
  } catch (error) {
    console.error('免费用户对话错误:', error);
    res.status(500).json({ error: error.message });
  }
});

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
