import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { getInviteCode, createUser, getUserByInviteCode, updateLastLogin, verifyPassword, getUserByUserInviteCode, getUserByEmail } from '../utils/db.js';
import { sendVerificationCode, verifyCode } from '../services/email-service.js';

const router = Router();
const JWT_SECRET = config.security.jwtSecret;

// ============ 邮箱验证码功能 ============

// 发送验证码
router.post('/send-code', async (req, res) => {
  try {
    const { email, type = 'register' } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '请输入有效的邮箱地址' });
    }

    // 检查邮箱是否已注册（仅注册时需要）
    if (type === 'register') {
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: '该邮箱已注册，请直接登录' });
      }
    }

    await sendVerificationCode(email, type);
    res.json({ success: true, message: '验证码已发送，请检查邮箱' });
  } catch (error) {
    console.error('发送验证码失败:', error);
    res.status(500).json({ 
      error: '发送失败',
      message: error.message.includes('SendGrid') ? '邮箱服务配置错误，请联系管理员' : error.message 
    });
  }
});

// 验证验证码
router.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: '请提供邮箱和验证码' });
    }

    const result = await verifyCode(email, code);
    
    if (result.success) {
      res.json({ success: true, message: '验证成功' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('验证验证码失败:', error);
    res.status(500).json({ error: '验证失败' });
  }
});

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

router.post('/register', async (req, res) => {
  try {
    const { inviteCode, nickname, password, email, code } = req.body;
    
    // 必填检查
    if (!nickname || nickname.trim().length < 2) {
      return res.status(400).json({ error: '昵称至少 2 个字符' });
    }
    
    if (!password || password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }
    
    // 邮箱必填
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '请输入有效的邮箱地址' });
    }
    
    // 验证码必填
    if (!code) {
      return res.status(400).json({ error: '请填写邮箱验证码' });
    }
    
    // 验证邮箱验证码
    const verifyResult = await verifyCode(email, code);
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error });
    }
    
    // 检查邮箱是否已注册
    const existingUserByEmail = await getUserByEmail(email);
    if (existingUserByEmail) {
      return res.status(400).json({ error: '该邮箱已注册，请直接登录' });
    }
    
    // 邀请码可选处理
    let inviterId = null;
    if (inviteCode && inviteCode.trim()) {
      const codeInfo = await getInviteCodeInfo(inviteCode);
      
      if (!codeInfo) {
        return res.status(400).json({ error: '邀请码无效' });
      }
      
      // 系统邀请码已使用的检查
      if (codeInfo.type === 'system' && codeInfo.code.used) {
        const existingUser = await getUserByInviteCode(inviteCode);
        if (existingUser) {
          return res.status(400).json({ error: '该邀请码已注册，请直接登录' });
        } else {
          return res.status(400).json({ error: '邀请码已被使用' });
        }
      }
      
      // 获取邀请者 ID
      if (codeInfo.type === 'user') {
        inviterId = codeInfo.inviterId;
      }
    }
    
    // 创建新用户（带密码），传入邀请者 ID 和邮箱
    const user = await createUser('DIRECT-' + Date.now(), nickname, password, inviterId, email);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        instanceId: user.instanceId,
        instanceStatus: user.instanceStatus,
        agents: user.agents || [],
        userInviteCode: user.userInviteCode,
        emailVerified: user.emailVerified,
        // 新用户默认免费订阅
        subscription: {
          plan: 'free',
          planName: 'Free',
          status: 'active'
        }
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 登录（支持邮箱或昵称 + 密码）
router.post('/login', async (req, res) => {
  try {
    let { nickname, password, email } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: '请提供密码' });
    }
    
    // 支持邮箱或昵称登录
    let user;
    const { getDB } = await import('../utils/db.js');
    const db = await getDB();
    
    if (email) {
      // 邮箱登录
      user = db.users.find(u => u.email === email);
      if (!user) {
        return res.status(400).json({ 
          error: '该邮箱未注册',
          friendlyMessage: '该邮箱尚未注册，要不要先注册一个账号？',
          suggestion: 'register'
        });
      }
    } else if (nickname) {
      // 昵称登录
      user = db.users.find(u => u.nickname === nickname);
      if (!user) {
        return res.status(400).json({ 
          error: '用户不存在',
          friendlyMessage: '找不到这个用户，是不是账号输错了？',
          suggestion: 'check_input'
        });
      }
    } else {
      return res.status(400).json({ 
        error: '请提供邮箱或昵称',
        friendlyMessage: '请输入邮箱或昵称进行登录'
      });
    }
    
    // 验证密码
    if (!user.passwordHash) {
      return res.status(400).json({ error: '该账号未设置密码，请联系管理员' });
    }
    
    const { verifyPassword, updateLastLogin } = await import('../utils/db.js');
    const valid = await verifyPassword(user.id, password);
    if (!valid) {
      return res.status(400).json({ error: '密码错误' });
    }
    
    // 更新登录时间
    await updateLastLogin(user.id);
    
    // 生成 token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        instanceId: user.instanceId,
        instanceStatus: user.instanceStatus,
        agents: user.agents || [],
        userInviteCode: user.userInviteCode,  // 返回用户专属邀请码
        inviteCount: user.inviteCount || 0,    // 邀请人数
        points: user.points || 0,              // 积分
        canClaimTeam: (user.subscription && user.subscription.plan !== 'free' && user.subscription.status === 'active') || (user.points || 0) >= 5000,
        // 订阅信息
        subscription: user.subscription || {
          plan: 'free',
          planName: 'Free',
          status: 'active'
        }
      }
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
    
    // 计算是否可以领取团队（订阅用户 或 累计消耗 >= 5000 积分）
    const points = user.points || 0;
    const totalSpent = user.totalSpent || 0;
    
    // 检查订阅状态（兼容有无 status 字段的情况）
    const isSubscribed = user.subscription && 
                         user.subscription.plan && 
                         user.subscription.plan !== 'free' && 
                         (user.subscription.status === 'active' || 
                          !user.subscription.endDate || 
                          new Date(user.subscription.endDate) > new Date());
    
    const canClaimTeam = isSubscribed || totalSpent >= 5000;
    
    res.json({
      id: user.id,
      nickname: user.nickname,
      agents: user.agents || [],
      team: user.team || null,
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
      // 订阅和积分详情
      credits: user.credits || {
        balance: points,
        freeDaily: 100,
        freeDailyUsed: 0,
        monthlyQuota: 0
      },
      subscription: user.subscription || {
        plan: 'free',
        planName: 'Free',
        status: 'active'
      },
      // 引导状态
      onboardingCompleted: user.onboardingCompleted === true
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

// 领取 AI 团队（必须是订阅用户或累计消耗5000积分）
router.post('/claim-team', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  const { agents } = req.body;
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { getUser, saveDB, getDB } = await import('../utils/db.js');
    
    const user = await getUser(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 检查是否已有团队
    if (user.agents && user.agents.length > 0) {
      return res.status(400).json({ error: '你已经领取过 AI 团队了' });
    }
    
    // 检查资格：订阅用户 或 累计消耗 >= 5000 积分
    const isSubscribed = user.subscription && 
                         user.subscription.plan !== 'free' && 
                         user.subscription.status === 'active';
    const totalSpent = user.totalSpent || 0;
    const hasEnoughSpent = totalSpent >= 5000;
    
    if (!isSubscribed && !hasEnoughSpent) {
      return res.status(400).json({ 
        error: '领取 AI 团队需要订阅或累计消耗5000积分',
        isSubscribed,
        totalSpent,
        required: 5000,
        need: 5000 - totalSpent
      });
    }
    
    // 默认团队
    const defaultAgents = ['lingxi', 'coder', 'ops', 'inventor', 'pm', 'noter', 'media', 'smart'];
    const selectedAgents = agents || defaultAgents;
    
    // 更新用户团队配置
    const db = await getDB();
    const dbUser = db.users.find(u => u.id === user.id);
    dbUser.agents = selectedAgents;
    dbUser.agentsUpdatedAt = new Date().toISOString();
    await saveDB(db);
    
    // 🚀 调用完整部署流程
    // 内部调用 deploy/one-click API
    const deployResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/deploy/one-click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id })
    });
    
    const deployData = await deployResponse.json();
    
    if (!deployResponse.ok) {
      console.error('部署失败:', deployData);
      // 部署失败，清空 agents
      const db2 = await getDB();
      const dbUser2 = db2.users.find(u => u.id === user.id);
      dbUser2.agents = [];
      await saveDB(db2);
      return res.status(500).json({ 
        error: '部署失败', 
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
