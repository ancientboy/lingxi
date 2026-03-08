import { Router } from 'express';
import { getUser } from '../utils/db.js';

const router = Router();

// ============================================
// 权限配置
// ============================================

const SUBSCRIBED_PLANS = ['lite', 'pro', 'enterprise'];
const LUMECLAW_ADMINS = [
  '1a6e9c9d-7cda-494f-81e5-715e293f654d',  // 古风
];

function checkLumeclawAccess(user) {
  const plan = user.subscription?.plan || 'free';
  const isSubscribed = SUBSCRIBED_PLANS.includes(plan);
  const isAdmin = LUMECLAW_ADMINS.includes(user.id);
  const allowed = isSubscribed || isAdmin;

  return {
    allowed,
    plan,
    isAdmin,
    permissions: allowed ? 'full' : 'none',
  };
}

/**
 * 直接 HTTP 调用 LumeClaw
 */
async function callLumeclaw(url, message, userId) {
  const response = await fetch(`${url}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userId}`,
    },
    body: JSON.stringify({
      message,
      userId,
      groupId: `user-${userId}`,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LumeClaw 请求失败: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * LumeClaw 对话接口
 */
router.post('/chat', async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: '消息不能为空' });
    }

    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const user = await getUser(userId);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const access = checkLumeclawAccess(user);
    if (!access.allowed) {
      return res.status(403).json({
        error: 'LumeClaw 仅对订阅用户开放',
        upgradeRequired: true,
      });
    }

    console.log(`🔧 [LumeClaw] [${user.nickname}] ${message}`);

    // 确定目标 LumeClaw URL
    let lumeclawUrl;
    if (user.server?.type === 'dedicated' && user.server?.ip) {
      // 独立服务器 - 直接 HTTP 调用
      lumeclawUrl = `http://${user.server.ip}:13001`;
      console.log(`📡 转发到独立服务器: ${lumeclawUrl}`);
    } else {
      // 共享服务器 - 本地调用
      lumeclawUrl = 'http://localhost:13001';
      console.log(`📡 本地调用 LumeClaw`);
    }

    const result = await callLumeclaw(lumeclawUrl, message, userId);

    res.json({
      success: true,
      response: result.response,
      agent: 'lumeclaw',
    });
  } catch (error) {
    console.error('LumeClaw 对话错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 清除会话
 */
router.post('/clear', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }

    res.json({
      success: true,
      message: '会话已清除',
    });
  } catch (error) {
    console.error('清除会话错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取 LumeClaw 状态和用户权限
 */
router.get('/status', async (req, res) => {
  try {
    const { userId } = req.query;

    let userAccess = null;
    if (userId) {
      const user = await getUser(userId);
      if (user) {
        userAccess = checkLumeclawAccess(user);
      }
    }

    res.json({
      success: true,
      status: {
        provider: 'dmxapi',
        model: 'qwen-flash',
      },
      userAccess,
    });
  } catch (error) {
    console.error('获取状态错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 检查用户权限（前端调用）
 */
router.get('/permissions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, allowed: false });
    }

    const user = await getUser(userId);
    if (!user) {
      return res.status(404).json({ success: false, allowed: false });
    }

    const access = checkLumeclawAccess(user);

    res.json({
      success: true,
      allowed: access.allowed,
      plan: access.plan,
      isAdmin: access.isAdmin,
      permissions: access.permissions,
    });
  } catch (error) {
    console.error('检查权限错误:', error);
    res.status(500).json({ success: false, allowed: false, error: error.message });
  }
});

export default router;
