/**
 * Cron 定时任务代理 API
 *
 * 将前端的定时任务管理请求通过 RPC 转发到用户 OpenClaw Gateway。
 *
 * 路由：
 *  GET  /list          — 获取任务列表
 *  POST /add           — 创建任务
 *  POST /update        — 更新任务
 *  POST /remove        — 删除任务
 *  POST /run           — 立即执行
 *  GET  /runs/:jobId   — 执行历史
 *  GET  /status        — Cron 服务状态
 */

import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import { callOpenClawRPC } from '../utils/openclaw-rpc.js';
import nodemailer from 'nodemailer';

const router = Router();

// 所有路由都需要登录
router.use(verifyToken);

// ============ Constants ============

/** payload.kind 白名单 */
const ALLOWED_PAYLOAD_KINDS = ['agentTurn'];

/** schedule.kind 白名单 */
const ALLOWED_SCHEDULE_KINDS = ['cron', 'interval', 'at'];

/** /update patch 字段白名单 */
const ALLOWED_PATCH_FIELDS = ['name', 'schedule', 'payload', 'enabled'];

/** 通知渠道白名单 */
const ALLOWED_NOTIFY_CHANNELS = ['email', 'webhook', 'none'];

/** jobId 合法字符：字母、数字、短横线 */
const JOB_ID_RE = /^[a-zA-Z0-9-]+$/;

/** 邮箱格式校验 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============ Notify Helpers ============

/**
 * 校验通知配置
 * @returns {string|null} 错误消息，null 表示通过
 */
function validateNotify(notify) {
  if (!notify || typeof notify !== 'object') {
    return null; // 可选，不传不报错
  }
  if (notify.channel && !ALLOWED_NOTIFY_CHANNELS.includes(notify.channel)) {
    return `notify.channel 仅允许: ${ALLOWED_NOTIFY_CHANNELS.join(', ')}`;
  }
  if (notify.channel === 'email' && notify.target) {
    if (!EMAIL_RE.test(notify.target)) {
      return 'notify.target 邮箱格式无效';
    }
  }
  if (notify.channel === 'webhook' && notify.target) {
    try {
      new URL(notify.target);
    } catch {
      return 'notify.target webhook URL 格式无效';
    }
  }
  return null;
}

/**
 * 从 payload.message 中提取通知配置（前端嵌入）
 * 格式: <!--notify:{"channel":"email","target":"a@b.com"}-->
 * @returns {Object|null} 通知配置对象
 */
function extractNotifyFromMessage(message) {
  if (!message || typeof message !== 'string') return null;
  const match = message.match(/<!--notify:({.+?})-->/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * 将通知配置注入到 payload.message 中
 */
function injectNotifyToMessage(message, notify) {
  if (!notify || !notify.channel) return message;
  const notifyStr = `<!--notify:${JSON.stringify(notify)}-->`;
  if (message.includes('<!--notify:')) {
    return message.replace(/<!--notify:{.+?}-->/, notifyStr);
  }
  return message + '\n' + notifyStr;
}

/**
 * 从 payload.message 中移除通知配置标记
 */
function stripNotifyFromMessage(message) {
  if (!message || typeof message !== 'string') return message;
  return message.replace(/\n?<!--notify:{.+?}-->/, '').trim();
}

// ============ Helpers ============

/**
 * 获取用户服务器信息，支持 serverId 参数
 * - 如果传了 serverId（query 或 body），使用指定的服务器
 * - 否则使用活跃服务器
 * @returns {Object|null} userServer，如果已响应则为 null
 */
async function resolveServer(req, res) {
  const db = await getDB();

  // 优先从 query/serverId 或 body.serverId 获取指定服务器
  const serverId = req.query.serverId || req.body?.serverId;
  let userServer = null;

  if (serverId) {
    userServer = db.userServers?.find(s => s.userId === req.user.id && s.id === serverId) || null;
    if (!userServer) {
      res.status(400).json({ success: false, error: '指定的设备不存在' });
      return null;
    }
  } else {
    userServer = getActiveServer(db, req.user.id);
  }

  if (!userServer?.ip) {
    res.status(400).json({ success: false, error: '未配置服务器' });
    return null;
  }

  return userServer;
}

// GET /api/cron/servers — 获取用户的设备列表（用于前端选择器）
router.get('/servers', async (req, res) => {
  const db = await getDB();
  const servers = (db.userServers || []).filter(s => s.userId === req.user.id);
  const activeServer = getActiveServer(db, req.user.id);

  const list = servers.map(s => ({
    id: s.id,
    name: s.name || s.description || s.ip,
    ip: s.ip,
    openclawPort: s.openclawPort,
    isActive: activeServer?.id === s.id,
  }));

  res.json({ success: true, servers: list, activeServerId: activeServer?.id || null });
});

/**
 * 统一 RPC 调用 + 错误处理
 *
 * 返回值语义：
 *  - 成功：返回 result 对象（调用方继续处理）
 *  - 失败：已通过 res 响应，返回 null
 *
 * HTTP 状态码：
 *  - RPC 超时    → 504
 *  - RPC 失败    → 502
 *  - 参数错误    → 400
 */
async function rpc(res, userServer, method, params = {}, timeout = 10000) {
  try {
    const result = await callOpenClawRPC(userServer, method, params, { timeout });

    if (!result.ok) {
      const errMsg = typeof result.error === 'string'
        ? result.error
        : result.error?.message || JSON.stringify(result.error);
      return res.status(502).json({ success: false, error: errMsg });
    }

    return result;
  } catch (err) {
    if (err.message === 'RPC timeout') {
      return res.status(504).json({ success: false, error: '服务器响应超时' });
    }
    return res.status(502).json({ success: false, error: err.message || 'RPC 调用失败' });
  }
}

/**
 * 校验 payload 结构
 * @returns {string|null} 错误消息，null 表示通过
 */
function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'payload 必须是对象';
  }
  if (!payload.kind || !ALLOWED_PAYLOAD_KINDS.includes(payload.kind)) {
    return `payload.kind 仅允许: ${ALLOWED_PAYLOAD_KINDS.join(', ')}`;
  }
  if (typeof payload.message !== 'string') {
    return 'payload 必须包含 message 字符串';
  }
  return null;
}

/**
 * 校验 schedule 结构
 * @returns {string|null} 错误消息，null 表示通过
 */
function validateSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') {
    return 'schedule 必须是对象';
  }
  if (!schedule.kind || !ALLOWED_SCHEDULE_KINDS.includes(schedule.kind)) {
    return `schedule.kind 仅允许: ${ALLOWED_SCHEDULE_KINDS.join(', ')}`;
  }
  // cron 表达式至少 5 段（分 时 日 月 周）
  if (schedule.kind === 'cron') {
    if (typeof schedule.expr !== 'string' || schedule.expr.trim().split(/\s+/).length < 5) {
      return 'cron 表达式格式无效（至少需要 5 段：分 时 日 月 周）';
    }
  }
  return null;
}

/**
 * 校验 jobId 格式
 * @returns {string|null} 错误消息，null 表示通过
 */
function validateJobId(jobId) {
  if (!jobId || typeof jobId !== 'string') {
    return '缺少 jobId';
  }
  if (!JOB_ID_RE.test(jobId)) {
    return 'jobId 格式无效，仅允许字母、数字和短横线';
  }
  return null;
}

// ============ Routes ============

// GET /api/cron/list — 获取任务列表
router.get('/list', async (req, res) => {
  const userServer = await resolveServer(req, res);
  if (!userServer) return;

  const result = await rpc(res, userServer, 'cron.list', { includeDisabled: true }, 10000);
  if (!result) return;

  const jobs = result.payload?.jobs || result.payload || [];
  // 为每个 job 提取 notify 配置
  const jobsWithNotify = jobs.map(function(job) {
    var msg = job.payload?.message;
    return Object.assign({}, job, { notify: extractNotifyFromMessage(msg) || null });
  });
  res.json({ success: true, jobs: jobsWithNotify });
});

// POST /api/cron/add — 创建任务
router.post('/add', async (req, res) => {
  const { name, schedule, payload, enabled, notify } = req.body;

  // 1. 基本参数检查
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ success: false, error: '缺少必要参数: name' });
  }

  // 2. schedule 校验
  const scheduleErr = validateSchedule(schedule);
  if (scheduleErr) {
    return res.status(400).json({ success: false, error: scheduleErr });
  }

  // 3. payload 校验（有默认值但用户传了就必须合法）
  const finalPayload = payload || { kind: 'agentTurn', message: '' };
  const payloadErr = validatePayload(finalPayload);
  if (payloadErr) {
    return res.status(400).json({ success: false, error: payloadErr });
  }

  // 4. notify 校验 + 注入到 message
  const notifyErr = validateNotify(notify);
  if (notifyErr) {
    return res.status(400).json({ success: false, error: notifyErr });
  }
  if (notify && notify.channel && notify.channel !== 'none') {
    finalPayload.message = injectNotifyToMessage(finalPayload.message, notify);
  }

  // 5. 获取服务器
  const userServer = await resolveServer(req, res);
  if (!userServer) return;

  // 6. RPC 调用（只传必要字段）
  const result = await rpc(res, userServer, 'cron.add', {
    name,
    schedule,
    payload: finalPayload,
    enabled: enabled !== false,
  }, 15000);
  if (!result) return;

  const job = result.payload?.job || result.payload || {};
  // 返回时附带 notify 配置（从 message 中提取）
  const jobNotify = extractNotifyFromMessage(finalPayload.message);
  res.json({ success: true, job, notify: jobNotify });
});

// POST /api/cron/update — 更新任务
router.post('/update', async (req, res) => {
  const { jobId, patch } = req.body;

  // 1. jobId 校验
  const jobIdErr = validateJobId(jobId);
  if (jobIdErr) {
    return res.status(400).json({ success: false, error: jobIdErr });
  }

  // 2. patch 白名单过滤
  if (!patch || typeof patch !== 'object') {
    return res.status(400).json({ success: false, error: '缺少 patch 对象' });
  }

  const safePatch = {};
  for (const key of ALLOWED_PATCH_FIELDS) {
    if (key in patch) {
      safePatch[key] = patch[key];
    }
  }

  if (Object.keys(safePatch).length === 0) {
    return res.status(400).json({ success: false, error: 'patch 无有效字段' });
  }

  // 3. 如果 patch 里包含 payload，校验它
  if (safePatch.payload) {
    const payloadErr = validatePayload(safePatch.payload);
    if (payloadErr) {
      return res.status(400).json({ success: false, error: payloadErr });
    }
  }

  // 4. 如果 patch 里包含 schedule，校验它
  if (safePatch.schedule) {
    const scheduleErr = validateSchedule(safePatch.schedule);
    if (scheduleErr) {
      return res.status(400).json({ success: false, error: scheduleErr });
    }
  }

  // 5. 获取服务器
  const userServer = await resolveServer(req, res);
  if (!userServer) return;

  // 6. 如果传了 notify，注入到 payload.message
  if (safePatch.payload && req.body.notify) {
    const notifyErr = validateNotify(req.body.notify);
    if (notifyErr) {
      return res.status(400).json({ success: false, error: notifyErr });
    }
    if (req.body.notify.channel && req.body.notify.channel !== 'none') {
      safePatch.payload.message = injectNotifyToMessage(safePatch.payload.message || '', req.body.notify);
    } else {
      // channel=none → 移除已有通知配置
      safePatch.payload.message = stripNotifyFromMessage(safePatch.payload.message || '');
    }
  }

  const result = await rpc(res, userServer, 'cron.update', { id: jobId, patch: safePatch }, 15000);
  if (!result) return;

  // 返回时附带 notify 配置
  const jobNotify = safePatch.payload?.message ? extractNotifyFromMessage(safePatch.payload.message) : null;
  res.json({ success: true, job: result.payload?.job || result.payload || {}, notify: jobNotify });
});

// POST /api/cron/remove — 删除任务
router.post('/remove', async (req, res) => {
  const { jobId } = req.body;

  const jobIdErr = validateJobId(jobId);
  if (jobIdErr) {
    return res.status(400).json({ success: false, error: jobIdErr });
  }

  const userServer = await resolveServer(req, res);
  if (!userServer) return;

  const result = await rpc(res, userServer, 'cron.remove', { id: jobId }, 15000);
  if (!result) return;

  res.json({ success: true });
});

// POST /api/cron/run — 立即执行
router.post('/run', async (req, res) => {
  const { jobId } = req.body;

  const jobIdErr = validateJobId(jobId);
  if (jobIdErr) {
    return res.status(400).json({ success: false, error: jobIdErr });
  }

  const userServer = await resolveServer(req, res);
  if (!userServer) return;

  const result = await rpc(res, userServer, 'cron.run', { id: jobId }, 30000);
  if (!result) return;

  res.json({ success: true, run: result.payload?.run || result.payload || {} });
});

// GET /api/cron/runs/:jobId — 执行历史
router.get('/runs/:jobId', async (req, res) => {
  const { jobId } = req.params;

  // jobId 校验
  const jobIdErr = validateJobId(jobId);
  if (jobIdErr) {
    return res.status(400).json({ success: false, error: jobIdErr });
  }

  const userServer = await resolveServer(req, res);
  if (!userServer) return;

  // 分页参数透传（limit 范围限制 1-100，默认 20）
  let limit = parseInt(req.query.limit, 10) || 20;
  limit = Math.max(1, Math.min(100, limit));

  const result = await rpc(res, userServer, 'cron.runs', { id: jobId, limit }, 10000);
  if (!result) return;

  const runs = result.payload?.runs || result.payload || [];
  res.json({ success: true, runs });
});

// GET /api/cron/status — Cron 服务状态
router.get('/status', async (req, res) => {
  const userServer = await resolveServer(req, res);
  if (!userServer) return;

  const result = await rpc(res, userServer, 'cron.status', {}, 10000);
  if (!result) return;

  res.json({ success: true, status: result.payload?.status || result.payload || {} });
});

// ============ 邮件通知服务 ============

/**
 * 获取邮件发送器（支持用户自定义 SMTP 或 fallback 到系统默认）
 * @param {Object} customSmtp - 用户自定义 SMTP 配置 {host, port, secure, user, pass, from}
 */
function getMailTransporter(customSmtp) {
  // 优先使用用户自定义 SMTP
  if (customSmtp && customSmtp.host && customSmtp.user && customSmtp.pass) {
    return nodemailer.createTransport({
      host: customSmtp.host,
      port: parseInt(customSmtp.port || '587', 10),
      secure: customSmtp.secure === true || customSmtp.port === '465',
      auth: { user: customSmtp.user, pass: customSmtp.pass },
    });
  }

  // Fallback: 系统默认 SMTP
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpSecure = process.env.SMTP_SECURE === 'true';

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error('[邮件] SMTP 未配置');
    return null;
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
  });
}

// POST /api/cron/notify — 发送邮件通知（供 Agent 调用）
router.post('/notify', async (req, res) => {
  try {
    const { to, subject, body, html, smtp } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ success: false, error: '缺少 to/subject/body' });
    }

    const transporter = getMailTransporter(smtp);
    if (!transporter) {
      return res.status(503).json({ success: false, error: '邮件服务未配置' });
    }

    await transporter.sendMail({
      from: smtp?.from || process.env.SMTP_FROM || process.env.SMTP_USER,
      to: to,
      subject: subject,
      text: body,
      html: html || undefined,
    });

    res.json({ success: true, message: '邮件已发送' });
  } catch (err) {
    console.error('[邮件] 发送失败:', err.message);
    res.status(500).json({ success: false, error: err.message || '邮件发送失败' });
  }
});

// GET /api/cron/notify/config — 检查邮件配置状态
router.get('/notify/config', async (req, res) => {
  const configured = !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
  res.json({
    success: true,
    configured,
    host: process.env.SMTP_HOST || null,
    from: process.env.SMTP_FROM || process.env.SMTP_USER || null,
  });
});

// ============ 用户 SMTP 配置 ============

/**
 * 获取用户的邮件配置（脱敏）
 * GET /api/cron/smtp/config
 * 返回 configured + 邮箱地址（用于前端显示"默认通知邮箱"）
 */
router.get('/smtp/config', async (req, res) => {
  try {
    const db = await getDB();
    const userSmtp = (db.userSmtpConfigs || []).find(s => s.userId === req.user.id);

    if (!userSmtp) {
      return res.json({ success: true, configured: false });
    }

    // 脱敏返回（不返回密码）
    res.json({
      success: true,
      configured: true,
      email: userSmtp.recipientEmail || userSmtp.user, // 收件邮箱（默认=发件邮箱）
      config: {
        host: userSmtp.host,
        port: userSmtp.port,
        secure: userSmtp.secure,
        user: userSmtp.user,
        from: userSmtp.from || userSmtp.user,
        recipientEmail: userSmtp.recipientEmail || userSmtp.user,
      }
    });
  } catch (e) {
    console.error('[SMTP] 获取配置失败:', e);
    res.status(500).json({ success: false, error: '获取配置失败' });
  }
});

/**
 * 保存用户的 SMTP 配置
 * POST /api/cron/smtp/config
 * body: { host, port, secure, user, pass, from }
 */
router.post('/smtp/config', async (req, res) => {
  try {
    const { host, port, secure, user, pass, from, recipientEmail } = req.body;

    // 校验必填
    if (!host || !user || !pass) {
      return res.status(400).json({ success: false, error: '缺少 host/user/pass' });
    }

    // 校验邮箱格式
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) {
      return res.status(400).json({ success: false, error: 'user 邮箱格式无效' });
    }

    const db = await getDB();
    if (!db.userSmtpConfigs) db.userSmtpConfigs = [];

    const idx = db.userSmtpConfigs.findIndex(s => s.userId === req.user.id);
    const newConfig = {
      userId: req.user.id,
      host,
      port: parseInt(port || '587', 10),
      secure: secure === true || port === '465',
      user,
      pass,
      from: from || user,
      recipientEmail: recipientEmail || user, // 收件邮箱，默认=发件邮箱
      updatedAt: new Date().toISOString(),
    };

    if (idx >= 0) {
      db.userSmtpConfigs[idx] = newConfig;
    } else {
      db.userSmtpConfigs.push(newConfig);
    }

    await saveDB(db);
    res.json({ success: true, message: 'SMTP 配置已保存' });
  } catch (e) {
    console.error('[SMTP] 保存配置失败:', e);
    res.status(500).json({ success: false, error: '保存配置失败' });
  }
});

/**
 * 测试邮件发送
 * POST /api/cron/smtp/test
 * body: { to }
 */
router.post('/smtp/test', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ success: false, error: '缺少 to' });
    }

    const db = await getDB();
    const userSmtp = (db.userSmtpConfigs || []).find(s => s.userId === req.user.id);
    if (!userSmtp) {
      return res.status(400).json({ success: false, error: '请先配置 SMTP' });
    }

    const transporter = getMailTransporter(userSmtp);
    if (!transporter) {
      return res.status(503).json({ success: false, error: '邮件服务配置无效' });
    }

    await transporter.sendMail({
      from: userSmtp.from || userSmtp.user,
      to: to,
      subject: '【灵犀云】SMTP 测试邮件',
      text: '这是一封测试邮件，确认你的 SMTP 配置正常工作。',
      html: '<h2>✅ SMTP 配置成功</h2><p>这是一封测试邮件，确认你的 SMTP 配置正常工作。</p><p>—— 灵犀云</p>',
    });

    res.json({ success: true, message: '测试邮件已发送' });
  } catch (e) {
    console.error('[SMTP] 测试失败:', e);
    res.status(500).json({ success: false, error: e.message || '测试发送失败' });
  }
});

// ============ Cron Webhook — 任务完成后自动发邮件 ============

// POST /api/cron/webhook — 接收 OpenClaw cron 任务完成事件
// OpenClaw delivery.mode=webhook 会 POST 到这里
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const jobId = body.jobId || body.id || '';
    const jobName = body.jobName || body.name || '定时任务';
    const status = body.status || body.runStatus || '';
    const result = body.result || body.output || body.payload || '';
    const errorMsg = body.error || body.errorReason || '';

    console.log(`[Cron Webhook] 收到任务事件: ${jobName} (${jobId}) status=${status}`);

    // 从 message 中提取 notify 配置（可选）
    const message = body.message || body.payload?.message || '';
    const notifyMatch = message.match(/<!--notify:(\{[\s\S]*?\})-->/);
    const notify = notifyMatch ? JSON.parse(notifyMatch[1]) : null;

    // notify:none → 明确跳过
    if (notify && notify.channel === 'none') {
      console.log('[Cron Webhook] notify=none，跳过');
      return res.json({ success: true, skipped: true });
    }

    // 获取用户 SMTP 配置 — webhook 无用户身份，取第一条配置（单用户场景）
    const db = await getDB();
    const userSmtp = (db.userSmtpConfigs || [])[0];
    if (!userSmtp) {
      console.log('[Cron Webhook] 无 SMTP 配置，跳过');
      return res.json({ success: true, skipped: true });
    }

    // 收件人优先级：notify.target > recipientEmail > user
    const recipient = (notify && notify.target) || userSmtp.recipientEmail || userSmtp.user;

    const transporter = getMailTransporter(userSmtp);
    if (!transporter) {
      console.log('[Cron Webhook] transporter 创建失败，跳过');
      return res.json({ success: true, skipped: true });
    }

    // 构建邮件内容
    const isSuccess = status === 'ok' || status === 'success' || status === 'completed';
    const subject = isSuccess
      ? `✅ [${jobName}] 任务完成报告`
      : `❌ [${jobName}] 任务执行失败`;

    // 把结果转成简洁文本
    const resultText = typeof result === 'string'
      ? result.slice(0, 5000)
      : JSON.stringify(result, null, 2).slice(0, 5000);

    const textBody = isSuccess
      ? `任务「${jobName}」已完成执行。\n\n--- 执行结果 ---\n${resultText}\n\n--- \n灵犀云`
      : `任务「${jobName}」执行失败。\n\n--- 错误信息 ---\n${errorMsg || '未知错误'}\n\n--- \n灵犀云`;

    const htmlBody = isSuccess
      ? `<h2>✅ 任务「${jobName}」已完成</h2><hr><pre style="white-space:pre-wrap;font-size:14px;">${resultText}</pre><hr><p style="color:#999;font-size:12px;">灵犀云</p>`
      : `<h2>❌ 任务「${jobName}」执行失败</h2><hr><pre style="white-space:pre-wrap;font-size:14px;color:red;">${errorMsg || '未知错误'}</pre><hr><p style="color:#999;font-size:12px;">灵犀云</p>`;

    await transporter.sendMail({
      from: userSmtp.from || userSmtp.user,
      to: recipient,
      subject,
      text: textBody,
      html: htmlBody,
    });

    console.log(`[Cron Webhook] 邮件已发送到 ${recipient}`);
    res.json({ success: true, sent: true });
  } catch (err) {
    console.error('[Cron Webhook] 错误:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
