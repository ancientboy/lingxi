import { Router } from 'express';
import { getInviteCode, createUser, getUserByInviteCode, updateLastLogin, verifyPassword } from '../utils/db.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

// 注册（带密码）
router.post('/register', async (req, res) => {
  try {
    const { inviteCode, nickname, password } = req.body;
    
    if (!inviteCode) {
      return res.status(400).json({ error: '请提供邀请码' });
    }
    
    // 检查邀请码是否有效
    const code = await getInviteCode(inviteCode);
    if (!code) {
      return res.status(400).json({ error: '邀请码无效' });
    }
    
    if (code.used) {
      // 邀请码已使用，检查是否是该用户（登录场景）
      const existingUser = await getUserByInviteCode(inviteCode);
      if (existingUser) {
        // 已注册用户，提示去登录
        return res.status(400).json({ error: '该邀请码已注册，请直接登录' });
      } else {
        return res.status(400).json({ error: '邀请码已被使用' });
      }
    }
    
    // 创建新用户（带密码）
    const user = await createUser(inviteCode, nickname, password);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        instanceId: user.instanceId,
        instanceStatus: user.instanceStatus,
        agents: user.agents || []
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
        agents: user.agents || []
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
    const { getUser } = await import('../utils/db.js');
    const user = await getUser(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({
      id: user.id,
      nickname: user.nickname,
      agents: user.agents || [],
      instanceStatus: user.instanceStatus,
      createdAt: user.createdAt,
      hasPassword: !!user.passwordHash
    });
  } catch (error) {
    res.status(401).json({ error: '令牌无效' });
  }
});

// 更新用户信息
router.post('/update', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  const { nickname, password } = req.body;
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { getUser, saveDB, getDB } = await import('../utils/db.js');
    
    const db = await getDB();
    const user = db.users.find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 更新昵称
    if (nickname) {
      user.nickname = nickname;
    }
    
    // 更新密码
    if (password && password.length >= 6) {
      const { hashPassword } = await import('../utils/db.js');
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
