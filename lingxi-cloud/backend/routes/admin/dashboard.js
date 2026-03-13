/**
 * 管理后台 - 仪表盘 API
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB } from '../../utils/db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

// ============ 中间件 ============

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

async function adminMiddleware(req, res, next) {
  try {
    const db = await getDB();
    const user = db.users.find(u => u.id === req.userId);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, error: '需要管理员权限' });
    }
    
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: '服务器错误' });
  }
}

const adminOnly = [authMiddleware, adminMiddleware];

// ============ 统计数据 ============

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = await getDB();
    const users = db.users || [];
    
    const today = new Date().toISOString().split('T')[0];
    
    // 用户统计
    const userStats = {
      total: users.length,
      active: users.filter(u => {
        const lastLogin = u.lastLoginAt;
        if (!lastLogin) return false;
        const diff = (Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 7;
      }).length,
      newToday: users.filter(u => {
        const created = u.createdAt;
        if (!created) return false;
        return created.startsWith(today);
      }).length
    };
    
    // 订阅分布
    const subStats = {
      free: users.filter(u => (u.subscription?.plan || 'free') === 'free').length,
      lite: users.filter(u => u.subscription?.plan === 'lite').length,
      pro: users.filter(u => u.subscription?.plan === 'pro').length
    };
    
    // 使用量统计
    let todayTokens = 0;
    let todayRequests = 0;
    
    for (const user of users) {
      const todayUsage = user.usage?.byDate?.[today];
      if (todayUsage) {
        todayTokens += todayUsage.tokens || 0;
        todayRequests += todayUsage.requests || 0;
      }
    }
    
    const usageStats = {
      todayTokens,
      todayRequests
    };
    
    res.json({
      success: true,
      data: {
        users: userStats,
        subscriptions: subStats,
        usage: usageStats
      }
    });
    
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ============ 使用量趋势 ============

router.get('/usage-trend', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const db = await getDB();
    const users = db.users || [];
    
    const trend = [];
    const today = new Date();
    
    for (let i = parseInt(days) - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      let tokens = 0;
      let requests = 0;
      
      for (const user of users) {
        const dayUsage = user.usage?.byDate?.[dateStr];
        if (dayUsage) {
          tokens += dayUsage.tokens || 0;
          requests += dayUsage.requests || 0;
        }
      }
      
      trend.push({
        date: dateStr,
        tokens,
        requests
      });
    }
    
    res.json({ success: true, trend });
    
  } catch (error) {
    console.error('获取使用量趋势失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

export default router;
