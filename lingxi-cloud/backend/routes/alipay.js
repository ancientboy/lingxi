/**
 * 支付宝支付路由 - 电脑扫码 + 手机H5
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import AlipayService from '../services/alipay.js';
import { getDB, saveDB } from '../utils/db.js';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026';

const alipay = new AlipayService({
  appId: process.env.ALIPAY_APP_ID,
  privateKey: process.env.ALIPAY_PRIVATE_KEY,
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
  sandbox: process.env.ALIPAY_SANDBOX === 'true',
  notifyUrl: process.env.ALIPAY_NOTIFY_URL,
  returnUrl: process.env.ALIPAY_RETURN_URL
});

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  try {
    const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
    req.user = { id: decoded.userId };
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Token 无效' });
  }
}

function loadPlans() {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'plans.json'), 'utf-8'));
}

function loadOrders() {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'orders.json'), 'utf-8'));
  } catch {
    return { orders: [] };
  }
}

function saveOrders(data) {
  writeFileSync(join(__dirname, '..', 'data', 'orders.json'), JSON.stringify(data, null, 2));
}

function isMobileUA(userAgent) {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent || '');
}

// 订阅支付
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.user.id;
    const plan = loadPlans().plans[planId];
    
    if (!plan || planId === 'free') {
      return res.status(400).json({ success: false, error: '套餐不存在' });
    }
    
    const outTradeNo = 'SUB' + Date.now() + userId.substring(0, 6);
    const ordersData = loadOrders();
    ordersData.orders.push({
      outTradeNo, userId, type: 'subscription', planId,
      planName: plan.name, amount: plan.price,
      status: 'pending', createdAt: new Date().toISOString()
    });
    saveOrders(ordersData);
    
    const isMobile = isMobileUA(req.headers['user-agent']);
    const payUrl = isMobile 
      ? alipay.createWapPay({ outTradeNo, totalAmount: String(plan.price), subject: 'Lume' + plan.id.charAt(0).toUpperCase() + plan.id.slice(1) + ' 订阅' })
      : alipay.createPagePay({ outTradeNo, totalAmount: String(plan.price), subject: 'Lume' + plan.id.charAt(0).toUpperCase() + plan.id.slice(1) + ' 订阅' });
    
    res.json({ success: true, data: { payUrl, outTradeNo, amount: plan.price } });
  } catch (error) {
    console.error('创建订阅订单失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 积分充值
router.post('/credit-pack', authMiddleware, async (req, res) => {
  try {
    const { packId } = req.body;
    const userId = req.user.id;
    const pack = loadPlans().creditPacks.find(p => p.id === packId);
    
    if (!pack) {
      return res.status(400).json({ success: false, error: '积分包不存在' });
    }
    
    const totalCredits = pack.credits + Math.floor(pack.credits * pack.bonus);
    const outTradeNo = 'CRED' + Date.now() + userId.substring(0, 6);
    
    const ordersData = loadOrders();
    ordersData.orders.push({
      outTradeNo, userId, type: 'credit-pack', packId,
      packName: pack.name, amount: pack.price, credits: totalCredits,
      status: 'pending', createdAt: new Date().toISOString()
    });
    saveOrders(ordersData);
    
    const isMobile = isMobileUA(req.headers['user-agent']);
    const payUrl = isMobile
      ? alipay.createWapPay({ outTradeNo, totalAmount: String(pack.price), subject: 'LumeCloud 积分充值' })
      : alipay.createPagePay({ outTradeNo, totalAmount: String(pack.price), subject: 'LumeCloud 积分充值' });
    
    res.json({ success: true, data: { payUrl, outTradeNo, amount: pack.price, credits: totalCredits } });
  } catch (error) {
    console.error('创建充值订单失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 支付回调（POST）
router.post('/notify', async (req, res) => {
  try {
    const notifyData = alipay.parseNotify(req.body);
    console.log('[支付宝回调]', notifyData);
    
    if (notifyData.tradeStatus === 'TRADE_SUCCESS' || notifyData.tradeStatus === 'TRADE_FINISHED') {
      const { outTradeNo, totalAmount, tradeNo } = notifyData;
      const ordersData = loadOrders();
      const order = ordersData.orders.find(o => o.outTradeNo === outTradeNo);
      
      if (!order || order.status === 'paid') {
        return res.send(order ? 'success' : 'fail');
      }
      
      if (parseFloat(totalAmount) !== order.amount) {
        console.error('[支付回调] 金额不匹配');
        return res.send('fail');
      }
      
      order.status = 'paid';
      order.tradeNo = tradeNo;
      order.paidAt = new Date().toISOString();
      saveOrders(ordersData);
      
      const db = await getDB();
      const user = db.users.find(u => u.id === order.userId);
      if (!user) return res.send('fail');
      
      if (order.type === 'subscription') {
        const plan = loadPlans().plans[order.planId];
        const prev = user.credits?.balance || 0;
        user.subscription = {
          plan: order.planId, planName: plan.name, price: plan.price, credits: plan.credits,
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
          trialUsed: true, autoRenew: false, paidAt: new Date().toISOString()
        };
        if (!user.credits) user.credits = { balance: 0 };
        user.credits.balance = prev + plan.credits;
        user.credits.monthlyQuota = plan.credits;
        user.points = user.credits.balance;
        console.log('[支付成功] ' + user.nickname + ' 订阅 ' + plan.name);
      } else if (order.type === 'credit-pack') {
        const prev = user.credits?.balance || 0;
        if (!user.credits) user.credits = { balance: 0 };
        user.credits.balance = prev + order.credits;
        user.points = user.credits.balance;
        console.log('[支付成功] ' + user.nickname + ' 充值 ' + order.packName);
      }
      
      await saveDB(db);
    }
    res.send('success');
  } catch (error) {
    console.error('[支付回调失败]', error);
    res.send('fail');
  }
});

// 支付返回（GET）- 跳过签名验证，直接跳转
router.get('/return', async (req, res) => {
  try {
    const params = req.query;
    console.log('[支付返回]', params);
    
    // 直接跳转成功页面（签名验证在 notify 已完成）
    const outTradeNo = params.out_trade_no || '';
    const totalAmount = params.total_amount || '0';
    
    // 查询订单状态确认支付成功
    if (outTradeNo) {
      const ordersData = loadOrders();
      const order = ordersData.orders.find(o => o.outTradeNo === outTradeNo);
      if (order && order.status === 'paid') {
        res.redirect('/payment/success.html?out_trade_no=' + outTradeNo + '&total_amount=' + totalAmount);
      } else {
        // 订单未支付，可能回调还没到，等一下再查
        res.redirect('/payment/success.html?out_trade_no=' + outTradeNo + '&total_amount=' + totalAmount + '&pending=1');
      }
    } else {
      res.redirect('/payment/fail.html?message=订单信息丢失');
    }
  } catch (error) {
    console.error('[支付返回失败]', error);
    res.redirect('/payment/fail.html?message=' + encodeURIComponent(error.message));
  }
});

// 查询订单
router.get('/order/:outTradeNo', authMiddleware, async (req, res) => {
  const order = loadOrders().orders.find(o => o.outTradeNo === req.params.outTradeNo && o.userId === req.user.id);
  if (!order) return res.status(404).json({ success: false, error: '订单不存在' });
  res.json({ success: true, data: order });
});

// 原始接口
router.post('/create', async (req, res) => {
  try {
    const { outTradeNo, totalAmount, subject, body, type } = req.body;
    if (!outTradeNo || !totalAmount || !subject) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    const order = { outTradeNo, totalAmount, subject, body };
    const payType = type || (isMobileUA(req.headers['user-agent']) ? 'wap' : 'page');
    const payUrl = payType === 'wap' ? alipay.createWapPay(order) : alipay.createPagePay(order);
    res.json({ success: true, data: { payUrl } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/query/:outTradeNo', async (req, res) => {
  try {
    const resp = await fetch(alipay.queryOrder(req.params.outTradeNo));
    res.json({ success: true, data: await resp.json() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
