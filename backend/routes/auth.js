import { Router } from 'express';
import { getInviteCode, createUser, getUserByInviteCode, updateLastLogin, verifyPassword, getUserByUserInviteCode } from '../utils/db.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

// 判断邀请码类型
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

// 注册（带密码）
router.post('/register', async (req, res) => {
  try {
    const { inviteCode, nickname, password } = req.body;
    
    if (!inviteCode) {
      return res.status(400).json({ error: '请提供邀请码' });
    }
    
    // 检查邀请码类型（系统邀请码或用户专属邀请码）
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
    
    // 用户专属邀请码需要生成一个系统邀请码用于记录
    let systemInviteCode = inviteCode;
    if (codeInfo.type === 'user') {
      // 用户邀请码注册时，生成一个虚拟的系统邀请码标记
      systemInviteCode = `USER-INVITE-${Date.now()}`;
    }
    
    // 创建新用户（带密码），传入邀请者ID
    const user = await createUser(systemInviteCode, nickname, password, codeInfo.inviterId);
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
        userInviteCode: user.userInviteCode  // 返回用户专属邀请码
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 登录（用昵称+密码）
router.post('/login', async (req, res) => {
  try {
    const { nickname, password } = req.body;
    
    if (!nickname || !password) {
      return res.status(400).json({ error: '请提供用户名和密码' });
    }
    
    // 按昵称查找用户
    const { getDB } = await import('../utils/db.js');
    const db = await getDB();
    const user = db.users.find(u => u.nickname === nickname);
    
    if (!user) {
      return res.status(400).json({ error: '用户不存在' });
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
        canClaimTeam: (user.points || 0) >= 100
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
    const { getUser, getDB } = await import('../utils/db.js');
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
      inviteReward: 100
    });
  } catch (error) {
    res.status(401).json({ error: '令牌无效' });
  }
});

// 领取 AI 团队（消耗积分）
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
    
    // 更新用户团队
    const db = await getDB();
    const dbUser = db.users.find(u => u.id === user.id);
    dbUser.agents = selectedAgents;
    dbUser.agentsUpdatedAt = new Date().toISOString();
    await saveDB(db);
    
    res.json({
      success: true,
      message: '🎉 恭喜！成功领取 AI 团队',
      agents: selectedAgents,
      points: result.balance
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

export default router;
