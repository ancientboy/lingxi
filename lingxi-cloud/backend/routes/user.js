/**
 * 用户相关路由 - 使用量统计、积分等
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB, saveDB } from '../utils/db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

// 用户配额配置（按会员等级）
const USER_QUOTA = {
  free: 1000000,      // 免费用户: 100万 tokens
  basic: 5000000,     // 基础版: 500万 tokens
  pro: 20000000,      // 专业版: 2000万 tokens
  enterprise: 100000000  // 企业版: 1亿 tokens
};

// 免费用户每日积分额度
const FREE_DAILY_CREDITS = 100;

// Token 验证中间件
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.userId };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token 无效' });
  }
}

// 管理员验证中间件
async function adminMiddleware(req, res, next) {
  try {
    const userId = req.user.id;
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, error: '需要管理员权限' });
    }
    
    req.adminUser = user;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: '服务器错误' });
  }
}

/**
 * 获取用户使用量统计
 * GET /api/user/usage
 */
router.get('/usage', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    // 获取使用量数据
    const usage = user.usage || {
      totalTokens: 0,
      totalRequests: 0,
      byModel: {},
      byDate: {}
    };
    
    // 获取用户配额（根据会员等级）
    const memberLevel = user.memberLevel || 'free';
    const quota = USER_QUOTA[memberLevel] || USER_QUOTA.free;
    
    // 计算时间段统计
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    let todayStats = { tokens: 0, requests: 0 };
    let weekStats = { tokens: 0, requests: 0 };
    let monthStats = { tokens: 0, requests: 0 };
    let recentUsage = [];
    
    // 遍历日期统计
    for (const [date, stats] of Object.entries(usage.byDate || {})) {
      if (date === today) {
        todayStats = stats;
      }
      if (date >= weekAgo) {
        weekStats.tokens += stats.tokens || 0;
        weekStats.requests += stats.requests || 0;
        recentUsage.push({ date, ...stats });
      }
      if (date >= monthAgo) {
        monthStats.tokens += stats.tokens || 0;
        monthStats.requests += stats.requests || 0;
      }
    }
    
    // 排序最近使用记录
    recentUsage.sort((a, b) => a.date.localeCompare(b.date));
    recentUsage = recentUsage.slice(-7);
    
    // 计算使用百分比
    const usagePercent = quota > 0 ? Math.min((usage.totalTokens / quota * 100), 100) : 0;
    
    // 获取积分信息
    let credits = user.credits || {
      balance: user.points || 0,
      freeDaily: FREE_DAILY_CREDITS,
      freeDailyUsed: 0,
      lastDailyReset: today
    };
    
    // 检查每日重置
    if (credits.lastDailyReset !== today) {
      credits.freeDailyUsed = 0;
      credits.lastDailyReset = today;
    }
    
    const freeRemaining = credits.freeDaily - credits.freeDailyUsed;
    const totalCredits = credits.balance + freeRemaining;
    
    res.json({
      success: true,
      data: {
        totalTokens: usage.totalTokens || 0,
        totalRequests: usage.totalRequests || 0,
        today: todayStats,
        week: weekStats,
        month: monthStats,
        byModel: usage.byModel || {},
        recentUsage,
        // 配额信息
        quota: {
          total: quota,
          used: usage.totalTokens || 0,
          remaining: Math.max(quota - (usage.totalTokens || 0), 0),
          percent: usagePercent.toFixed(1),
          memberLevel
        },
        // 积分信息
        credits: {
          balance: credits.balance,
          freeDaily: credits.freeDaily,
          freeDailyUsed: credits.freeDailyUsed,
          freeRemaining,
          total: totalCredits
        }
      }
    });
    
  } catch (error) {
    console.error('获取使用量失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * 获取用户积分信息
 * GET /api/user/credits
 */
router.get('/credits', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    let credits = user.credits || {
      balance: user.points || 0,
      freeDaily: FREE_DAILY_CREDITS,
      freeDailyUsed: 0,
      lastDailyReset: today
    };
    
    // 检查每日重置
    if (credits.lastDailyReset !== today) {
      credits.freeDailyUsed = 0;
      credits.lastDailyReset = today;
    }
    
    res.json({
      success: true,
      data: {
        balance: credits.balance,
        freeDaily: credits.freeDaily,
        freeDailyUsed: credits.freeDailyUsed,
        freeRemaining: credits.freeDaily - credits.freeDailyUsed,
        total: credits.balance + (credits.freeDaily - credits.freeDailyUsed)
      }
    });
    
  } catch (error) {
    console.error('获取积分失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * 管理员赠送积分
 * POST /api/user/gift-credits
 * Body: { userId: string, points: number, reason: string }
 */
router.post('/gift-credits', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, points, reason } = req.body;
    
    if (!userId || !points || points <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: '参数错误：需要 userId 和正数 points' 
      });
    }
    
    const db = await getDB();
    
    // 支持通过 ID 或昵称查找用户
    const targetUser = db.users.find(u => 
      u.id === userId || u.nickname === userId || u.id.includes(userId)
    );
    
    if (!targetUser) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    const today = new Date().toISOString();
    const giftReason = reason || '管理员赠送';
    
    // 1. 初始化 credits（如果不存在）
    if (!targetUser.credits) {
      targetUser.credits = {
        balance: targetUser.points || 0,
        freeDaily: FREE_DAILY_CREDITS,
        freeDailyUsed: 0,
        lastDailyReset: new Date().toISOString().split('T')[0]
      };
    }
    
    // 2. 更新 credits.balance
    targetUser.credits.balance += points;
    
    // 3. 同步 points 字段
    targetUser.points = targetUser.credits.balance;
    
    // 4. 添加历史记录
    if (!targetUser.pointsHistory) {
      targetUser.pointsHistory = [];
    }
    targetUser.pointsHistory.push({
      type: 'earn',
      points: points,
      reason: giftReason,
      balance: targetUser.credits.balance,
      time: today,
      adminId: req.user.id
    });
    
    // 5. 保存
    await saveDB(db);
    
    console.log(`[赠送积分] ${req.adminUser.nickname} -> ${targetUser.nickname}: +${points} (${giftReason})`);
    
    res.json({
      success: true,
      data: {
        userId: targetUser.id,
        nickname: targetUser.nickname,
        pointsAdded: points,
        newBalance: targetUser.credits.balance,
        reason: giftReason
      }
    });
    
  } catch (error) {
    console.error('赠送积分失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * 管理员查询所有用户积分
 * GET /api/user/admin/credits
 */
router.get('/admin/credits', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = await getDB();
    const today = new Date().toISOString().split('T')[0];
    
    const users = db.users.map(u => {
      const credits = u.credits || { balance: u.points || 0, freeDaily: 100, freeDailyUsed: 0 };
      return {
        id: u.id,
        nickname: u.nickname,
        balance: credits.balance,
        freeRemaining: credits.freeDaily - (credits.freeDailyUsed || 0),
        total: credits.balance + (credits.freeDaily - (credits.freeDailyUsed || 0)),
        lastLogin: u.lastLoginAt
      };
    });
    
    res.json({ success: true, data: users });
    
  } catch (error) {
    console.error('查询用户积分失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

export default router;
