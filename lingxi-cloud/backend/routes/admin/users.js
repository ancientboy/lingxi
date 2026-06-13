/**
 * 管理后台 - 用户管理 API
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB, saveDB } from '../../utils/db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

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

// ============ 用户列表 ============

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, plan, search } = req.query;
    const db = await getDB();
    
    let users = [...db.users];
    
    // 筛选订阅
    if (plan && plan !== 'all') {
      users = users.filter(u => (u.subscription?.plan || 'free') === plan);
    }
    
    // 搜索
    if (search) {
      const q = search.toLowerCase();
      users = users.filter(u => 
        u.nickname?.toLowerCase().includes(q) ||
        u.id?.toLowerCase().includes(q)
      );
    }
    
    const total = users.length;
    
    // 分页
    const start = (page - 1) * pageSize;
    const end = start + parseInt(pageSize);
    const pagedUsers = users.slice(start, end);
    
    // 简化返回数据
    const result = pagedUsers.map(u => ({
      id: u.id,
      nickname: u.nickname,
      isAdmin: u.isAdmin,
      subscription: u.subscription,
      credits: u.credits,
      usage: u.usage,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt
    }));
    
    res.json({
      success: true,
      users: result,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
    
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ============ 用户详情 ============

router.get('/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    res.json({ success: true, user });
    
  } catch (error) {
    console.error('获取用户详情失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ============ 订阅授权 ============

router.post('/:userId/subscribe', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { plan, months = 1, reason } = req.body;
    
    if (!plan || !['free', 'lite', 'pro'].includes(plan)) {
      return res.status(400).json({ success: false, error: '无效的套餐' });
    }
    
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    // 套餐配置
    const planConfig = {
      free: { name: 'Free', credits: 0 },
      lite: { name: 'Lite', credits: 20000 },
      pro: { name: 'Pro', credits: 60000 }
    };
    
    const config = planConfig[plan];
    const today = new Date();
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + months);
    
    // 更新订阅
    user.subscription = {
      plan,
      planName: config.name,
      status: 'active',  // ✅ 添加状态字段
      startDate: today.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      grantedBy: req.adminUser.id,
      grantedAt: today.toISOString(),
      reason: reason || '管理员授权'
    };
    
    // 更新积分（订阅套餐才给积分）
    if (plan !== 'free') {
      if (!user.credits) {
        user.credits = { balance: 0, monthlyQuota: 0 };
      }
      user.credits.balance = config.credits;
      user.credits.monthlyQuota = config.credits;
      user.credits.lastSubscribe = today.toISOString();
      user.points = config.credits; // 同步旧字段
    }
    
    await saveDB(db);
    
    console.log(`[管理后台] ${req.adminUser.nickname} 授权 ${user.nickname} ${config.name} (${months}个月)`);
    
    res.json({
      success: true,
      message: `已授权 ${config.name} 套餐 ${months} 个月`,
      subscription: user.subscription,
      credits: user.credits
    });
    
  } catch (error) {
    console.error('订阅授权失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ============ 积分操作 ============

router.post('/:userId/credits', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { points, reason, type = 'gift' } = req.body;
    
    if (!points || points <= 0) {
      return res.status(400).json({ success: false, error: '积分数必须大于 0' });
    }
    
    if (!reason) {
      return res.status(400).json({ success: false, error: '必须填写原因' });
    }
    
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    // 初始化积分
    if (!user.credits) {
      user.credits = { balance: user.points || 0 };
    }
    
    const before = user.credits.balance || 0;
    
    if (type === 'gift') {
      user.credits.balance = before + points;
    } else if (type === 'deduct') {
      user.credits.balance = Math.max(0, before - points);
    }
    
    user.points = user.credits.balance; // 同步旧字段
    
    // 记录历史
    if (!user.pointsHistory) {
      user.pointsHistory = [];
    }
    
    user.pointsHistory.push({
      type: type === 'gift' ? 'earn' : 'spend',
      points: type === 'gift' ? points : -points,
      reason: `[管理后台] ${reason}`,
      balance: user.credits.balance,
      time: new Date().toISOString(),
      adminId: req.adminUser.id,
      adminName: req.adminUser.nickname
    });
    
    await saveDB(db);
    
    console.log(`[管理后台] ${req.adminUser.nickname} ${type === 'gift' ? '赠送' : '扣除'} ${user.nickname} ${points} 积分`);
    
    res.json({
      success: true,
      message: `已${type === 'gift' ? '赠送' : '扣除'} ${points} 积分`,
      before,
      after: user.credits.balance
    });
    
  } catch (error) {
    console.error('积分操作失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ============ 积分流水 ============

router.get('/:userId/credits/history', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    res.json({
      success: true,
      history: user.pointsHistory || []
    });
    
  } catch (error) {
    console.error('获取积分流水失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

export default router;
