import { Router } from 'express';
import { getUser } from '../utils/db.js';
import { LumeClaw } from '/root/.openclaw/workspace/lumeclaw/src/agent.js';

const router = Router();

// LumeClaw 实例（按用户隔离）
const lumeclawInstances = new Map();

// ============================================
// 权限配置
// ============================================

/**
 * LumeClaw 权限等级
 * 
 * Level 0: 无权限（免费用户）
 * Level 1: 基础权限（订阅用户 - 只读操作）
 * Level 2: 高级权限（Pro 用户 - 可重启服务）
 * Level 3: 管理员（完全权限 - 所有操作）
 */
const LUMECLAW_PERMISSIONS = {
  // 管理员（完全权限）
  admins: [
    '1a6e9c9d-7cda-494f-81e5-715e293f654d',  // 古风
  ],
  
  // 白名单用户（测试权限）
  whitelist: [
    'c74dbcdb-0207-4b1d-952b-70fcc07c4357',  // 57
    'a2cb0411-3d4a-471a-a274-d502965d5867',  // 褚时
    'afa92243-aa1b-4410-b39c-ac29e65f415a',  // kryon
  ],
};

/**
 * 获取用户的 LumeClaw 权限等级
 */
function getLumeclawPermissionLevel(user) {
  // 管理员
  if (LUMECLAW_PERMISSIONS.admins.includes(user.id)) {
    return 3;
  }
  
  // 白名单用户
  if (LUMECLAW_PERMISSIONS.whitelist.includes(user.id)) {
    return 2;
  }
  
  // 订阅用户
  const plan = user.subscription?.plan || 'free';
  if (plan === 'pro' || plan === 'enterprise') {
    return 2;
  }
  if (plan === 'lite') {
    return 1;
  }
  
  // 免费用户
  return 0;
}

/**
 * 检查用户是否有 LumeClaw 访问权限
 */
function checkLumeclawAccess(user) {
  const level = getLumeclawPermissionLevel(user);
  
  return {
    allowed: level > 0,
    level,
    permissions: {
      canViewLogs: level >= 1,        // 查看日志
      canCheckStatus: level >= 1,     // 检查状态
      canRestartService: level >= 2,  // 重启服务
      canExecuteCommands: level >= 2, // 执行命令
      canModifyConfig: level >= 3,    // 修改配置
      canManageUsers: level >= 3,     // 管理用户
    },
    levelName: ['无权限', '基础', '高级', '管理员'][level],
  };
}

/**
 * 获取或创建用户的 LumeClaw 实例
 */
function getLumeClawInstance(userId) {
  if (!lumeclawInstances.has(userId)) {
    const instance = new LumeClaw();
    lumeclawInstances.set(userId, instance);
  }
  return lumeclawInstances.get(userId);
}

/**
 * LumeClaw 对话接口
 * 
 * 用于服务器维护、故障排查、日志分析等
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

    // 获取用户信息
    const user = await getUser(userId);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 检查权限
    const access = checkLumeclawAccess(user);
    if (!access.allowed) {
      return res.status(403).json({ 
        error: 'LumeClaw 仅对订阅用户开放',
        upgradeRequired: true 
      });
    }

    console.log(`🔧 [LumeClaw] [${user.nickname}] ${message}`);

    // 获取用户的 LumeClaw 实例
    const lumeclaw = getLumeClawInstance(userId);

    // 调用 LumeClaw
    const response = await lumeclaw.chat(message);

    res.json({
      success: true,
      response,
      agent: 'lume'
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

    const lumeclaw = lumeclawInstances.get(userId);
    if (lumeclaw) {
      lumeclaw.clearSession();
      lumeclawInstances.delete(userId);
    }

    res.json({
      success: true,
      message: '会话已清除'
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

    const instanceCount = lumeclawInstances.size;
    const hasSession = userId ? lumeclawInstances.has(userId) : false;

    // 获取用户权限
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
        totalInstances: instanceCount,
        hasActiveSession: hasSession,
        provider: process.env.API_PROVIDER || 'dmxapi',
        model: process.env.DMXAPI_MODEL || 'qwen-flash'
      },
      userAccess
    });
  } catch (error) {
    console.error('获取状态错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取用户权限信息
 */
router.get('/permissions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await getUser(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const access = checkLumeclawAccess(user);

    res.json({
      success: true,
      userId,
      nickname: user.nickname,
      plan: user.subscription?.plan || 'free',
      ...access
    });
  } catch (error) {
    console.error('获取权限错误:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
