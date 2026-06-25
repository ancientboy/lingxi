import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { getInviteCode, createUser, getUserByInviteCode, updateLastLogin, verifyPassword, getUserByUserInviteCode, getUserByEmail, getUserByNickname } from '../utils/db.js';
import { createEmailCode, verifyEmailCode, isValidEmail } from '../utils/emailCodes.js';
import { sendVerificationCodeEmail } from '../utils/mailer.js';
import { isPaidSubscription } from '../utils/subscription-utils.js';

const router = Router();
const JWT_SECRET = config.security.jwtSecret;

function defaultNicknameFromEmail(email) {
  const local = email.split('@')[0] || 'user';
  const safe = local.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '').slice(0, 20);
  return safe || 'user';
}

function authUserPayload(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    email: user.email || null,
    instanceId: user.instanceId,
    instanceStatus: user.instanceStatus,
    agents: user.agents || [],
    userInviteCode: user.userInviteCode,
    inviteCount: user.inviteCount || 0,
    points: user.points || 0,
    canClaimTeam: (user.points || 0) >= 100,
    onboardingCompleted: user.onboardingCompleted === true,
    subscription: user.subscription || null,
  };
}
async function getInviteCodeInfo(code) {
  // 先检查是否是系统邀请码
  const systemCode = await getInviteCode(code);
  if (systemCode && !systemCode.used) {
    return { type: 'system', code: systemCode, inviterId: null };
  }
  
  // 再检查是否是用户专属邀请码
  const user = await getUserByUserInviteCode(code);
  if (user) {
    return { type: 'user', code: null, inviterId: user.id };
  }
  
  return null;
}

// 发送邮箱验证码（登录/注册合一）
router.post('/send-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: '请提供邮箱' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    const result = createEmailCode(email);
    if (!result.ok) {
      return res.status(429).json({ error: result.error, retryAfter: result.retryAfter });
    }

    await sendVerificationCodeEmail(email.trim().toLowerCase(), result.code);

    const payload = {
      success: true,
      message: '验证码已发送，请查收邮件',
      expiresIn: result.expiresIn,
    };
    if (config.mvpMode) {
      payload.devCode = result.code;
    }
    res.json(payload);
  } catch (error) {
    console.error('发送验证码错误:', error);
    res.status(500).json({ error: '发送失败，请稍后重试' });
  }
});

// 验证码登录/注册（无邀请码可注册；有邀请码则绑定奖励）
router.post('/verify-code', async (req, res) => {
  try {
    const { email, code, inviteCode } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: '请提供邮箱和验证码' });
    }

    const verified = verifyEmailCode(email, code);
    if (!verified.ok) {
      return res.status(400).json({ error: verified.error });
    }

    const normalizedEmail = verified.email;
    let user = await getUserByEmail(normalizedEmail);
    let isNewUser = false;

    if (!user) {
      let invitedBy = null;
      let systemInviteCode = null;

      if (inviteCode && String(inviteCode).trim()) {
        const codeInfo = await getInviteCodeInfo(inviteCode.trim());
        if (!codeInfo) {
          return res.status(400).json({ error: '邀请码无效' });
        }
        if (codeInfo.type === 'system' && codeInfo.code.used) {
          return res.status(400).json({ error: '邀请码已被使用' });
        }
        if (codeInfo.type === 'user') {
          invitedBy = codeInfo.inviterId;
          systemInviteCode = `USER-INVITE-${Date.now()}`;
        } else {
          systemInviteCode = inviteCode.trim();
        }
      }

      const nickname = defaultNicknameFromEmail(normalizedEmail);
      user = await createUser(
        systemInviteCode,
        nickname,
        null,
        invitedBy,
        normalizedEmail
      );
      isNewUser = true;
    }

    await updateLastLogin(user.id);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      token,
      isNewUser,
      user: authUserPayload(user),
    });
  } catch (error) {
    console.error('验证码登录错误:', error);
    res.status(500).json({ error: error.message || '验证失败' });
  }
});

// 注册（带密码，邀请码可选）
router.post('/register', async (req, res) => {
  try {
    const { inviteCode, nickname, password, email, code } = req.body;
    
    let invitedBy = null;
    let systemInviteCode = null;

    if (inviteCode && String(inviteCode).trim()) {
      const codeInfo = await getInviteCodeInfo(inviteCode.trim());
      if (!codeInfo) {
        return res.status(400).json({ error: '邀请码无效' });
      }
      if (codeInfo.type === 'system' && codeInfo.code.used) {
        const existingUser = await getUserByInviteCode(inviteCode);
        if (existingUser) {
          return res.status(400).json({ error: '该邀请码已注册，请直接登录' });
        }
        return res.status(400).json({ error: '邀请码已被使用' });
      }
      if (codeInfo.type === 'user') {
        invitedBy = codeInfo.inviterId;
        systemInviteCode = `USER-INVITE-${Date.now()}`;
      } else {
        systemInviteCode = inviteCode.trim();
      }
    }

    if (email) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: '邮箱格式不正确' });
      }
      if (!code) {
        return res.status(400).json({ error: '请填写邮箱验证码' });
      }
      const verified = verifyEmailCode(email, code);
      if (!verified.ok) {
        return res.status(400).json({ error: verified.error });
      }
    }
    
    const finalNickname = nickname || (email ? defaultNicknameFromEmail(email) : null);
    if (!finalNickname) {
      return res.status(400).json({ error: '请提供昵称' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }
    
    const user = await createUser(systemInviteCode, finalNickname, password, invitedBy, email || null);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      success: true,
      token,
      user: authUserPayload(user)
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 登录（邮箱/昵称 + 密码，兼容旧账号）
router.post('/login', async (req, res) => {
  try {
    const { nickname, email, password } = req.body;
    const identifier = (email || nickname || '').trim();
    
    if (!identifier || !password) {
      return res.status(400).json({ error: '请提供邮箱或昵称和密码' });
    }
    
    let user;
    if (isValidEmail(identifier)) {
      user = await getUserByEmail(identifier);
    } else {
      user = await getUserByNickname(identifier);
    }
    
    if (!user) {
      return res.status(400).json({ error: '用户不存在' });
    }
    
    if (!user.passwordHash) {
      return res.status(400).json({ error: '该账号未设置密码，请使用邮箱验证码登录' });
    }
    
    const valid = await verifyPassword(user.id, password);
    if (!valid) {
      return res.status(400).json({ error: '密码错误' });
    }
    
    await updateLastLogin(user.id);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      success: true,
      token,
      user: authUserPayload(user)
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 验证Token
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, userId: decoded.userId });
  } catch (error) {
    res.status(401).json({ error: '令牌无效或已过期' });
  }
});

// 获取用户信息
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { getUser, getDB, isOnboardingCompleted } = await import('../utils/db.js');
    const user = await getUser(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 获取邀请者信息
    let invitedByUser = null;
    if (user.invitedBy) {
      const db = await getDB();
      const inviter = db.users.find(u => u.id === user.invitedBy);
      if (inviter) {
        invitedByUser = { id: inviter.id, nickname: inviter.nickname };
      }
    }
    
    // 计算是否可以领取团队
    const points = user.points || 0;
    const canClaimTeam = points >= 100;
    
    res.json({
      id: user.id,
      nickname: user.nickname,
      email: user.email || null,
      agents: user.agents || [],
      instanceStatus: user.instanceStatus,
      createdAt: user.createdAt,
      hasPassword: !!user.passwordHash,
      // 邀请相关
      userInviteCode: user.userInviteCode,
      inviteCount: user.inviteCount || 0,
      invitedBy: invitedByUser,
      // 积分相关
      points,
      canClaimTeam,
      claimTeamCost: 100,
      inviteReward: 100,
      // 引导状态
      onboardingCompleted: user.onboardingCompleted === true,
      // 订阅状态（模型选择器等依赖此字段）
      subscription: user.subscription || null,
    });
  } catch (error) {
    res.status(401).json({ error: '令牌无效' });
  }
});

// ============ 引导系统 ============

// 获取职业类型列表
router.get('/onboarding/job-types', async (req, res) => {
  try {
    const { getJobTypes } = await import('../utils/db.js');
    res.json({ jobTypes: getJobTypes() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取推荐配置
router.get('/onboarding/recommendation/:jobType', async (req, res) => {
  try {
    const { jobType } = req.params;
    const { getRecommendation } = await import('../utils/db.js');
    const recommendation = getRecommendation(jobType);
    res.json({ recommendation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 完成引导
router.post('/onboarding/complete', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  const { jobType, agents } = req.body;
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { completeOnboarding, getUser } = await import('../utils/db.js');
    
    const user = await completeOnboarding(decoded.userId, jobType, agents);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({
      success: true,
      message: '🎉 引导完成！你的 AI 团队已就绪',
      user: {
        id: user.id,
        nickname: user.nickname,
        agents: user.agents || [],
        onboardingCompleted: true
      }
    });
  } catch (error) {
    console.error('完成引导错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 领取 AI 团队（消耗积分 + 完整部署流程）
router.post('/claim-team', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  const { agents } = req.body;
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { getUser, spendPoints, saveDB, getDB } = await import('../utils/db.js');
    
    const user = await getUser(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 检查是否已有团队
    if (user.agents && user.agents.length > 0) {
      return res.status(400).json({ error: '你已经领取过 AI 团队了' });
    }
    
    // 检查积分
    const points = user.points || 0;
    if (points < 100) {
      return res.status(400).json({ 
        error: '积分不足',
        points,
        required: 100,
        need: 100 - points
      });
    }
    
    // 默认团队
    const defaultAgents = ['lingxi', 'coder', 'ops', 'inventor', 'pm', 'noter', 'media', 'smart'];
    const selectedAgents = agents || defaultAgents;
    
    // 扣除积分
    const result = await spendPoints(user.id, 100, '领取 AI 团队');
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    // 更新用户团队配置
    const db = await getDB();
    const dbUser = db.users.find(u => u.id === user.id);
    dbUser.agents = selectedAgents;
    dbUser.agentsUpdatedAt = new Date().toISOString();
    await saveDB(db);

    // 云端 ECS 部署仅面向付费订阅；免费用户仅领取团队配置，走共享 Lume 能力
    if (!isPaidSubscription(dbUser)) {
      return res.json({
        success: true,
        message: '🎉 已领取 AI 团队，登录即可使用 Lume 聊天（升级套餐可开通专属云服务器）',
        agents: selectedAgents,
        points: result.balance,
        status: 'team_only',
        needSubscription: true,
      });
    }
    
    // 🚀 付费用户：调用云端一键部署
    const deployResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/deploy/one-click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id })
    });
    
    const deployData = await deployResponse.json();
    
    if (!deployResponse.ok) {
      console.error('部署失败:', deployData);
      // 部署失败，返还积分并清空 agents
      await spendPoints(user.id, -100, '部署失败返还');
      const db2 = await getDB();
      const dbUser2 = db2.users.find(u => u.id === user.id);
      dbUser2.agents = [];
      await saveDB(db2);
      return res.status(500).json({ 
        error: '部署失败，积分已返还', 
        details: deployData.error 
      });
    }
    
    // 检查是否已有运行中的服务器（直接返回）
    if (deployData.server && deployData.openclawUrl) {
      // 更新用户的 instanceId
      const db2 = await getDB();
      const dbUser2 = db2.users.find(u => u.id === user.id);
      dbUser2.instanceId = deployData.server.id;
      dbUser2.instanceStatus = deployData.server.status;
      dbUser2.openclawUrl = deployData.openclawUrl;
      await saveDB(db2);
      
      return res.json({
        success: true,
        message: '🎉 恭喜！成功领取 AI 团队',
        agents: selectedAgents,
        points: result.balance,
        // 直接返回访问地址
        openclawUrl: deployData.openclawUrl,
        status: 'ready'
      });
    }
    
    // 部署已启动，返回任务 ID 供前端轮询
    res.json({
      success: true,
      message: '🎉 部署已启动，正在为你创建专属服务器...',
      agents: selectedAgents,
      points: result.balance,
      // 需要轮询的部署任务
      taskId: deployData.taskId,
      serverId: deployData.serverId,
      status: 'deploying'
    });
    
  } catch (error) {
    console.error('领取团队错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 更新用户信息
router.post('/update', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  const { nickname, password, currentPassword } = req.body;
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { getUser, saveDB, getDB, verifyPassword, hashPassword } = await import('../utils/db.js');
    
    const db = await getDB();
    const user = db.users.find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 更新昵称
    if (nickname) {
      user.nickname = nickname;
    }
    
    // 更新密码（需要验证当前密码）
    if (password && password.length >= 6) {
      // 如果用户已设置密码，需要验证当前密码
      if (user.passwordHash && currentPassword) {
        const valid = await verifyPassword(user.id, currentPassword);
        if (!valid) {
          return res.status(400).json({ error: '当前密码错误' });
        }
      }
      user.passwordHash = hashPassword(password);
    }
    
    await saveDB(db);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        nickname: user.nickname,
        hasPassword: !!user.passwordHash
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 每日签到
router.post('/checkin', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { getDB, saveDB } = await import('../utils/db.js');
    
    const db = await getDB();
    const user = db.users.find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 检查今天是否已签到
    const today = new Date().toDateString();
    const lastCheckin = user.lastCheckinDate;
    
    if (lastCheckin && new Date(lastCheckin).toDateString() === today) {
      // 今天已签到
      return res.json({
        success: false,
        message: '今天已经签到过了',
        alreadyCheckedIn: true,
        points: user.points || 0,
        checkinStreak: user.checkinStreak || 0
      });
    }
    
    // 计算连续签到天数
    let streak = user.checkinStreak || 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (lastCheckin && new Date(lastCheckin).toDateString() === yesterday.toDateString()) {
      streak++;
    } else {
      streak = 1;
    }
    
    // 签到奖励：基础10分 + 连续签到奖励
    let bonus = 10;
    if (streak >= 7) bonus = 20;      // 连续7天+：20分
    else if (streak >= 3) bonus = 15; // 连续3天+：15分
    
    // 更新用户数据
    user.points = (user.points || 0) + bonus;
    user.lastCheckinDate = new Date().toISOString();
    user.checkinStreak = streak;
    
    await saveDB(db);
    
    res.json({
      success: true,
      message: `签到成功！获得 ${bonus} 积分`,
      bonus,
      points: user.points,
      checkinStreak: streak,
      alreadyCheckedIn: false
    });
  } catch (error) {
    console.error('签到错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取签到状态
router.get('/checkin/status', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { getDB } = await import('../utils/db.js');
    
    const db = await getDB();
    const user = db.users.find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    const today = new Date().toDateString();
    const lastCheckin = user.lastCheckinDate;
    const alreadyCheckedIn = lastCheckin && new Date(lastCheckin).toDateString() === today;
    
    res.json({
      alreadyCheckedIn: !!alreadyCheckedIn,
      points: user.points || 0,
      checkinStreak: user.checkinStreak || 0,
      lastCheckinDate: user.lastCheckinDate || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
