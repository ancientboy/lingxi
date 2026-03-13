/**
 * 管理后台路由 - 邀请码管理
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB, saveDB, generateInviteCodes, getAllInviteCodes } from '../../utils/db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

// ============ 中间件 ============

// Token 验证
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token 无效' });
  }
}

// 管理员验证
async function adminMiddleware(req, res, next) {
  try {
    const db = await getDB();
    const user = db.users.find(u => u.id === req.userId);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, error: '需要管理员权限' });
    }
    
    req.adminUser = user;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: '服务器错误' });
  }
}

// 组合中间件
const adminOnly = [authMiddleware, adminMiddleware];

// ============ 获取邀请码列表 ============

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status } = req.query;
    const db = await getDB();
    
    let codes = [...db.inviteCodes];
    
    // 筛选状态
    if (status === 'used') {
      codes = codes.filter(c => c.used);
    } else if (status === 'unused') {
      codes = codes.filter(c => !c.used);
    }
    
    const total = codes.length;
    
    // 分页
    const start = (page - 1) * pageSize;
    const end = start + parseInt(pageSize);
    const pagedCodes = codes.slice(start, end);
    
    res.json({
      success: true,
      codes: pagedCodes,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
    
  } catch (error) {
    console.error('获取邀请码列表失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ============ 批量生成邀请码 ============

router.post('/generate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { count = 10 } = req.body;
    
    if (!count || count <= 0 || count > 100) {
      return res.status(400).json({ success: false, error: '生成数量必须在 1-100 之间' });
    }
    
    const db = await getDB();
    const codes = await generateInviteCodes(count);
    
    console.log(`[管理后台] ${req.adminUser.nickname} 批量生成 ${count} 个邀请码`);
    
    res.json({
      success: true,
      message: `成功生成 ${count} 个邀请码`,
      codes
    });
    
  } catch (error) {
    console.error('批量生成邀请码失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ============ 禁用邀请码 ============

router.post('/:code/disable', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { code } = req.params;
    const db = await getDB();
    
    const inviteCode = db.inviteCodes.find(c => c.code === code);
    
    if (!inviteCode) {
      return res.status(404).json({ success: false, error: '邀请码不存在' });
    }
    
    inviteCode.disabled = true;
    inviteCode.disabledAt = new Date().toISOString();
    inviteCode.disabledBy = req.adminUser.id;
    
    await saveDB(db);
    
    console.log(`[管理后台] ${req.adminUser.nickname} 禁用邀请码: ${code}`);
    
    res.json({
      success: true,
      message: '邀请码已禁用'
    });
    
  } catch (error) {
    console.error('禁用邀请码失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

export default router;
