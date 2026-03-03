/**
 * 订阅管理路由
 * - 订阅计划管理
 * - 用户订阅状态管理
 * - 免费试用逻辑
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getDB, saveDB } from '../utils/db.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

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

// 加载订阅计划数据
function loadPlans() {
  const dataPath = join(import.meta.dirname, '..', 'data', 'plans.json');
  const data = readFileSync(dataPath, 'utf-8');
  return JSON.parse(data);
}

/**
 * 获取所有订阅计划
 * GET /api/subscription/plans
 */
router.get('/plans', async (req, res) => {
  try {
    const plansData = loadPlans();
    
    res.json({
      success: true,
      data: {
        plans: plansData.plans,
        creditPacks: plansData.creditPacks
      }
    });
  } catch (error) {
    console.error('获取订阅计划失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * 获取当前用户的订阅状态
 * GET /api/subscription/current
 */
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    const plansData = loadPlans();
    const subscription = user.subscription || null;
    const server = user.server || null;
    const credits = user.credits || {};
    
    // 检查试用状态
    let trialStatus = 'not-started';
    if (subscription && subscription.plan === 'free' && subscription.trialUsed) {
      const startDate = new Date(subscription.startDate);
      const today = new Date();
      const diffTime = Math.abs(today - startDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays >= 3) {
        trialStatus = 'expired';
      } else {
        trialStatus = 'active';
      }
    } else if (subscription && subscription.plan === 'free' && !subscription.trialUsed) {
      trialStatus = 'pending';
    }
    
    // 计算剩余天数
    let remainingDays = 0;
    if (subscription && subscription.endDate) {
      const endDate = new Date(subscription.endDate);
      const today = new Date();
      const diffTime = endDate - today;
      remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    
    res.json({
      success: true,
      data: {
        subscription: subscription,
        server: server,
        credits: credits,
        trialStatus: trialStatus,
        remainingDays: Math.max(0, remainingDays),
        plans: plansData.plans,
        creditPacks: plansData.creditPacks
      }
    });
  } catch (error) {
    console.error('获取订阅状态失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * 开始免费试用
 * POST /api/subscription/trial
 */
router.post('/trial', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    // 检查是否已使用过试用
    if (user.subscription && user.subscription.trialUsed) {
      return res.status(400).json({ 
        success: false, 
        error: '您已经使用过免费试用，无法再次开通' 
      });
    }
    
    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 3); // 3天试用期
    
    // 更新用户订阅状态
    user.subscription = {
      plan: 'free',
      planName: 'Free',
      startDate: today,
      endDate: endDate.toISOString().split('T')[0],
      trialUsed: true,
      autoRenew: false
    };
    
    // 初始化积分系统
    if (!user.credits) user.credits = {};
    user.credits.balance = user.credits.balance || 0;
    user.credits.trialStart = today;
    user.credits.lastDailyReset = today;
    user.credits.freeDaily = 100; // 试用期间每日积分
    user.credits.freeDailyUsed = 0;
    
    // 设置为共享服务器
    user.server = {
      type: 'shared',
      ip: process.env.GATEWAY_IP || '120.55.192.144',
      port: parseInt(process.env.GATEWAY_PORT) || 18789,
      status: 'running'
    };
    
    await saveDB(db);
    
    console.log(`用户 ${user.nickname} 开始免费试用 3 天`);
    
    res.json({
      success: true,
      data: {
        subscription: user.subscription,
        server: user.server,
        credits: user.credits,
        message: '试用已开启！享受 3 天免费体验，每日 100 积分'
      }
    });
  } catch (error) {
    console.error('开启试用失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * 订阅套餐（暂时跳过支付）
 * POST /api/subscription/subscribe
 */
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId } = req.body;
    
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    const plansData = loadPlans();
    const plan = plansData.plans[planId];
    
    if (!plan) {
      return res.status(400).json({ success: false, error: '套餐不存在' });
    }
    
    // 检查是否正在试用
    if (user.subscription && user.subscription.plan === 'free' && !user.subscription.trialUsed) {
      return res.status(400).json({ 
        success: false, 
        error: '您正在试用期间，请先体验完成或试用过期后再订阅付费套餐' 
      });
    }
    
    const existingSubscription = user.subscription || null;
    const today = new Date().toISOString().split('T')[0];
    
    // 更新用户订阅状态
    user.subscription = {
      plan: planId,
      planName: plan.name,
      price: plan.price,
      credits: plan.credits,
      startDate: today,
      endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
      trialUsed: existingSubscription ? existingSubscription.trialUsed : false,
      autoRenew: false,
      subscribedAt: new Date().toISOString()
    };
    
    // 🔥 关键修复：给用户增加套餐积分
    if (!user.credits) user.credits = {};
    const previousBalance = user.credits.balance || 0;
    user.credits.balance = previousBalance + plan.credits;
    user.credits.monthlyQuota = plan.credits;
    user.credits.monthlyUsed = 0;
    user.credits.lastSubscribe = new Date().toISOString();
    
    // 同时更新旧系统的 points（兼容）
    user.points = (user.points || 0) + plan.credits;
    
    // 如果是付费用户，设置为独享服务器
    if (plan.serverType === 'dedicated') {
      user.server = user.server || {};
      user.server.type = 'dedicated';
    }
    
    await saveDB(db);
    
    console.log(`用户 ${user.nickname} 订阅了 ${plan.name}，积分: ${previousBalance} → ${user.credits.balance}`);
    
    res.json({
      success: true,
      data: {
        subscription: user.subscription,
        server: user.server,
        credits: user.credits,
        message: `订阅成功！已获得 ${plan.credits.toLocaleString()} 积分，当前余额: ${user.credits.balance.toLocaleString()}`
      }
    });
  } catch (error) {
    console.error('订阅失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * 充值积分包（暂时跳过支付）
 * POST /api/subscription/credit-pack
 */
router.post('/credit-pack', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { packId } = req.body;
    
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    const plansData = loadPlans();
    const pack = plansData.creditPacks.find(p => p.id === packId);
    
    if (!pack) {
      return res.status(400).json({ success: false, error: '积分包不存在' });
    }
    
    // 计算实际积分（包含赠送）
    const bonusCredits = Math.floor(pack.credits * pack.bonus);
    const totalCredits = pack.credits + bonusCredits;
    
    // 初始化 credits
    if (!user.credits) user.credits = {};
    const previousBalance = user.credits.balance || 0;
    user.credits.balance = previousBalance + totalCredits;
    user.credits.lastRecharge = new Date().toISOString();
    
    // 同时更新旧系统的 points（兼容）
    user.points = (user.points || 0) + totalCredits;
    
    await saveDB(db);
    
    console.log(`用户 ${user.nickname} 充值了 ${pack.name}，积分: ${previousBalance} → ${user.credits.balance}`);
    
    res.json({
      success: true,
      data: {
        balance: user.credits.balance,
        added: totalCredits,
        message: `充值成功！获得 ${totalCredits.toLocaleString()} 积分，当前余额: ${user.credits.balance.toLocaleString()}`
      }
    });
  } catch (error) {
    console.error('充值失败:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

export default router;
