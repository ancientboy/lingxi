/**
 * Stripe 支付路由
 * 
 * 支持支付方式：
 * - 信用卡
 * - 支付宝
 * - 微信支付
 */

import { Router } from 'express';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import { getDB, saveDB } from '../utils/db.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

// 初始化 Stripe（使用环境变量）
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_xxx');

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
 * 创建支付意图 - 订阅套餐
 * POST /api/stripe/create-subscription-payment
 */
router.post('/create-subscription-payment', authMiddleware, async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.user.id;
    
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    const plansData = loadPlans();
    const plan = plansData.plans[planId];
    
    if (!plan || plan.price === 0) {
      return res.status(400).json({ success: false, error: '无效的套餐' });
    }
    
    // 创建支付意图（金额单位：分）
    const paymentIntent = await stripe.paymentIntents.create({
      amount: plan.price * 100, // ¥199 → 19900 分
      currency: 'cny',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        userId: userId,
        userNickname: user.nickname,
        planId: planId,
        planName: plan.name,
        type: 'subscription'
      }
    });
    
    console.log(`[Stripe] 创建支付意图: ${user.nickname} - ${plan.name} - ¥${plan.price}`);
    
    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: plan.price,
        planName: plan.name
      }
    });
  } catch (error) {
    console.error('创建支付意图失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建支付意图 - 积分包
 * POST /api/stripe/create-credit-payment
 */
router.post('/create-credit-payment', authMiddleware, async (req, res) => {
  try {
    const { packId } = req.body;
    const userId = req.user.id;
    
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }
    
    const plansData = loadPlans();
    const pack = plansData.creditPacks.find(p => p.id === packId);
    
    if (!pack) {
      return res.status(400).json({ success: false, error: '无效的积分包' });
    }
    
    // 创建支付意图
    const paymentIntent = await stripe.paymentIntents.create({
      amount: pack.price * 100,
      currency: 'cny',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        userId: userId,
        userNickname: user.nickname,
        packId: packId,
        packName: pack.name,
        credits: pack.credits,
        bonus: pack.bonus,
        type: 'credit-pack'
      }
    });
    
    console.log(`[Stripe] 创建积分包支付: ${user.nickname} - ${pack.name} - ¥${pack.price}`);
    
    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: pack.price,
        packName: pack.name,
        credits: pack.credits
      }
    });
  } catch (error) {
    console.error('创建支付意图失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Webhook - 处理支付回调
 * POST /api/stripe/webhook
 */
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;
  
  try {
    // 验证 Webhook 签名
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook 签名验证失败:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // 处理支付成功事件
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const metadata = paymentIntent.metadata;
    
    console.log(`[Stripe] 支付成功: ${metadata.userNickname} - ${metadata.type}`);
    
    try {
      const db = await getDB();
      const user = db.users.find(u => u.id === metadata.userId);
      
      if (user) {
        if (metadata.type === 'subscription') {
          // 处理订阅支付
          await handleSubscriptionPayment(user, metadata.planId, db);
        } else if (metadata.type === 'credit-pack') {
          // 处理积分包支付
          await handleCreditPackPayment(user, metadata, db);
        }
        
        await saveDB(db);
        console.log(`[Stripe] 已为 ${user.nickname} 完成支付处理`);
      }
    } catch (err) {
      console.error('处理支付回调失败:', err);
    }
  }
  
  res.json({ received: true });
});

// 处理订阅支付
async function handleSubscriptionPayment(user, planId, db) {
  const plansData = loadPlans();
  const plan = plansData.plans[planId];
  
  if (!plan) return;
  
  const today = new Date().toISOString().split('T')[0];
  const previousPlan = user.subscription?.plan || null;
  const previousBalance = user.credits?.balance || 0;
  const previousQuota = user.credits?.monthlyQuota || 0;
  
  let creditsToAdd = 0;
  
  if (!previousPlan || previousPlan === 'free') {
    // 新订阅
    creditsToAdd = plan.credits;
  } else if (previousPlan === planId) {
    // 续费：补齐到月额度
    if (previousBalance < plan.credits) {
      creditsToAdd = plan.credits - previousBalance;
    }
  } else {
    // 升级/降级
    const previousPlanData = plansData.plans[previousPlan];
    const previousCredits = previousPlanData?.credits || 0;
    if (plan.credits > previousCredits) {
      creditsToAdd = plan.credits - previousCredits;
    }
  }
  
  // 更新订阅状态
  user.subscription = {
    plan: planId,
    planName: plan.name,
    price: plan.price,
    credits: plan.credits,
    startDate: today,
    endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
    trialUsed: user.subscription?.trialUsed || false,
    autoRenew: false,
    subscribedAt: new Date().toISOString(),
    paidVia: 'stripe'
  };
  
  // 更新积分
  if (!user.credits) user.credits = {};
  user.credits.balance = previousBalance + creditsToAdd;
  user.credits.monthlyQuota = plan.credits;
  user.points = user.credits.balance;
  
  // 设置服务器
  if (plan.serverType === 'dedicated') {
    user.server = user.server || {};
    user.server.type = 'dedicated';
  }
}

// 处理积分包支付
async function handleCreditPackPayment(user, metadata, db) {
  const credits = parseInt(metadata.credits) || 0;
  const bonus = parseFloat(metadata.bonus) || 0;
  const totalCredits = credits + Math.floor(credits * bonus);
  
  if (!user.credits) user.credits = { balance: 0 };
  
  const previousBalance = user.credits.balance || 0;
  user.credits.balance = previousBalance + totalCredits;
  user.credits.lastRecharge = new Date().toISOString();
  user.points = user.credits.balance;
  
  console.log(`[Stripe] 积分充值: ${user.nickname} +${totalCredits} = ${user.credits.balance}`);
}

/**
 * 查询支付状态
 * GET /api/stripe/payment-status/:paymentIntentId
 */
router.get('/payment-status/:paymentIntentId', authMiddleware, async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    res.json({
      success: true,
      data: {
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        metadata: paymentIntent.metadata
      }
    });
  } catch (error) {
    console.error('查询支付状态失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取 Stripe 公钥（前端用）
 * GET /api/stripe/config
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_xxx'
    }
  });
});

export default router;
