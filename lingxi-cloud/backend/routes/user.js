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

export default router;
