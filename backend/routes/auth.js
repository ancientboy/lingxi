import { Router } from 'express';
import { getInviteCode, createUser, getUserByInviteCode, updateLastLogin } from '../utils/db.js';
import jwt from 'jsonwebtoken';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

// 使用邀请码注册/登录
router.post('/register', async (req, res) => {
  try {
    const { inviteCode, nickname } = req.body;
    
    if (!inviteCode) {
      return res.status(400).json({ error: '请提供邀请码' });
    }
    
    // 检查邀请码是否有效
    const code = await getInviteCode(inviteCode);
    if (!code) {
      return res.status(400).json({ error: '邀请码无效' });
    }
    
    if (code.used) {
      // 邀请码已使用，检查是否是该用户
      const existingUser = await getUserByInviteCode(inviteCode);
      if (existingUser) {
        // 已注册用户，直接登录
        await updateLastLogin(existingUser.id);
        const token = jwt.sign({ userId: existingUser.id }, JWT_SECRET, { expiresIn: '30d' });
        return res.json({
          success: true,
          token,
          user: {
            id: existingUser.id,
            nickname: existingUser.nickname,
            instanceId: existingUser.instanceId,
            instanceStatus: existingUser.instanceStatus
          }
        });
      } else {
        return res.status(400).json({ error: '邀请码已被使用' });
      }
    }
    
    // 创建新用户
    const user = await createUser(inviteCode, nickname);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        instanceId: null,
        instanceStatus: 'pending'
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
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

export default router;
