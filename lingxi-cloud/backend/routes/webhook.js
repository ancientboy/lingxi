/**
 * Webhook 入口 API（不需要 verifyToken）
 *
 * 外部 POST 请求触发 Agent 处理。
 * raw body 由 index.js 中的 express.json({ verify }) 中间件提供。
 *
 * 路由：
 *  POST /:triggerId — Webhook 入口
 */

import { Router } from 'express';
import crypto from 'crypto';
import { getDB, saveDB } from '../utils/db.js';
import { executeTrigger } from './triggers.js';

var router = Router();

// POST /:triggerId — Webhook 入口（外部调用，不需要登录）
router.post('/:triggerId', async function(req, res) {
  var triggerId = req.params.triggerId;

  try {
    var db = await getDB();
    if (!db.triggers) db.triggers = [];

    // 1. 根据 triggerId 查找触发器
    var trigger = db.triggers.find(function(t) { return t.triggerId === triggerId; });
    if (!trigger) {
      return res.status(404).json({ success: false, error: '触发器不存在' });
    }
    if (!trigger.enabled) {
      return res.status(400).json({ success: false, error: '触发器已禁用' });
    }

    // 2. 如果触发器有 secret，验证签名（强制）
    var rawBody = req.rawBody || JSON.stringify(req.body);

    if (trigger.secret) {
      var signature = req.headers['x-signature'] || req.headers['x-hub-signature-256'] || '';

      if (!signature) {
        return res.status(403).json({ success: false, error: '缺少签名，请提供 x-signature 头' });
      }

      // 去掉 sha256= 前缀（GitHub 格式）
      var sigHex = signature.replace(/^sha256=/, '');
      var expected = crypto.createHmac('sha256', trigger.secret).update(rawBody).digest('hex');

      // 防止长度不一致导致 timingSafeEqual 报错
      var sigBuf = Buffer.from(sigHex, 'hex');
      var expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        // 签名不匹配 — 记录失败日志
        if (!db.triggerLogs) db.triggerLogs = [];
        db.triggerLogs.push({
          logId: crypto.randomUUID(),
          triggerId: triggerId,
          status: 'failed',
          payload: rawBody.substring(0, 1000),
          error: '签名验证失败',
          triggeredAt: new Date().toISOString(),
          responseTime: 0
        });
        await saveDB(db);
        return res.status(403).json({ success: false, error: '签名验证失败' });
      }
    }

    // 3. 解析请求 body
    var bodyStr = rawBody;

    // 4. 执行触发
    var logEntry = await executeTrigger(trigger, bodyStr, req.headers, db);

    // 5. 返回结果
    if (logEntry.status === 'success') {
      res.json({ success: true, message: '触发成功' });
    } else {
      res.status(502).json({ success: false, error: logEntry.error || '触发失败' });
    }
  } catch (err) {
    console.error('Webhook 处理异常:', err);
    res.status(500).json({ success: false, error: 'Webhook 处理异常' });
  }
});

export default router;
