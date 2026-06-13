/**
 * 管理后台 - 认证 API
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB } from '../../utils/db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

// ============ 管理员登录 ============

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, error: '用户名和密码必填' });
    }
    
    const db = await getDB();
    
    // 查找用户
    const user = db.users.find(u => 
      u.nickname === username || u.id === username
    );
    
    if (!user) {
      return res.status(401).json({ success: false, error: '用户不存在' });
    }
    
    // 检查是否是管理员
    if (!user.isAdmin) {
      return res.status(403).json({ success: false, error: '需要管理员权限' });
    }
    
    // 验证密码（简单的密码比对，生产环境应该用 bcrypt）
    // 这里假设密码存储在 passwordHash 字段
    // 为了简化，我们用一个固定的管理员密码
    
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'lingxi2026';
    
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, error: '密码错误' });
    }
    
    // 生成 Token
    const token = jwt.sign(
      { userId: user.id, isAdmin: true },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token,
      admin: {
        id: user.id,
        nickname: user.nickname
      }
    });
    
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ============ 验证 Token ============

router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: '未登录' });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const db = await getDB();
    const user = db.users.find(u => u.id === decoded.userId);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, error: '需要管理员权限' });
    }
    
    res.json({
      success: true,
      admin: {
        id: user.id,
        nickname: user.nickname
      }
    });
    
  } catch (err) {
    res.status(401).json({ success: false, error: 'Token 无效' });
  }
});

export default router;
