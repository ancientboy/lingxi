/**
 * 触发器管理 API
 *
 * 允许用户创建 Webhook 触发器，外部 POST 请求触发 Agent 处理。
 *
 * 路由（需要 verifyToken）：
 *  GET  /list            — 获取触发器列表
 *  POST /create          — 创建触发器
 *  POST /update          — 更新触发器
 *  POST /remove          — 删除触发器
 *  GET  /logs/:triggerId — 获取执行日志
 *
 * Webhook 入口（不需要 verifyToken）：
 *  POST /:triggerId      — 外部 Webhook 调用入口
 */

import { Router } from 'express';
import crypto from 'crypto';
import { verifyToken } from '../middleware/auth.js';
import { getDB, saveDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import { callOpenClawRPC } from '../utils/openclaw-rpc.js';

const router = Router();

// ============ Constants ============

const WEBHOOK_BASE = 'http://120.55.192.144:3000/api/webhook';
const MAX_LOGS_PER_TRIGGER = 100;
const TRIGGER_ID_RE = /^[a-f0-9-]+$/;

// ============ Helpers ============

// TODO: 提取 resolveServer 和 rpc 到 utils/route-helpers.js（与 cron.js、memory.js 共用）

async function resolveServer(req, res) {
  var db = await getDB();
  var serverId = req.query.serverId || req.body?.serverId;
  var userServer = null;

  if (serverId) {
    userServer = db.userServers?.find(function(s) { return s.userId === req.user.id && s.id === serverId; }) || null;
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

async function rpc(res, userServer, method, params, timeout) {
  if (!timeout) timeout = 10000;
  try {
    var result = await callOpenClawRPC(userServer, method, params, { timeout: timeout });
    if (!result.ok) {
      var errMsg = typeof result.error === 'string'
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
 * 清理旧日志，保留最近 MAX_LOGS_PER_TRIGGER 条
 */
function cleanupLogs(db, triggerId) {
  if (!db.triggerLogs) return;
  var logs = db.triggerLogs.filter(function(l) { return l.triggerId === triggerId; });
  if (logs.length > MAX_LOGS_PER_TRIGGER) {
    // 按时间排序，保留最近的
    logs.sort(function(a, b) { return new Date(b.triggeredAt) - new Date(a.triggeredAt); });
    var keepIds = new Set(logs.slice(0, MAX_LOGS_PER_TRIGGER).map(function(l) { return l.logId; }));
    db.triggerLogs = db.triggerLogs.filter(function(l) {
      return l.triggerId !== triggerId ? true : keepIds.has(l.logId);
    });
  }
}

// ============ Authenticated Routes ============

router.use(verifyToken);

// GET /list — 获取触发器列表
router.get('/list', async function(req, res) {
  try {
    var db = await getDB();
    if (!db.triggers) db.triggers = [];
    var triggers = db.triggers.filter(function(t) { return t.userId === req.user.id; });
    // 不返回 secret 给前端
    var safeTriggers = triggers.map(function(t) {
      return {
        triggerId: t.triggerId,
        userId: t.userId,
        name: t.name,
        type: t.type,
        targetAgent: t.targetAgent,
        promptTemplate: t.promptTemplate,
        secret: t.secret ? t.secret.substring(0, 4) + '****' : null,
        webhookUrl: t.webhookUrl,
        enabled: t.enabled,
        createdAt: t.createdAt,
        lastTriggeredAt: t.lastTriggeredAt || null,
        triggerCount: t.triggerCount || 0,
        serverId: t.serverId || null
      };
    });
    res.json({ success: true, triggers: safeTriggers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || '获取触发器列表失败' });
  }
});

// POST /create — 创建触发器
router.post('/create', async function(req, res) {
  var name = (req.body.name || '').trim();
  var type = (req.body.type || 'webhook').trim();
  var targetAgent = (req.body.targetAgent || '').trim();
  var promptTemplate = (req.body.promptTemplate || '').trim();

  // 校验
  if (!name) return res.status(400).json({ success: false, error: '触发器名称不能为空' });
  if (name.length > 50) return res.status(400).json({ success: false, error: '触发器名称不能超过 50 字' });
  if (!['webhook', 'github'].includes(type)) return res.status(400).json({ success: false, error: '类型仅支持 webhook / github' });
  if (!targetAgent) return res.status(400).json({ success: false, error: '目标 Agent 不能为空' });
  if (!promptTemplate) return res.status(400).json({ success: false, error: 'Prompt 模板不能为空' });
  if (promptTemplate.length > 2000) return res.status(400).json({ success: false, error: 'Prompt 模板不能超过 2000 字' });

  try {
    var db = await getDB();
    if (!db.triggers) db.triggers = [];

    var triggerId = crypto.randomUUID();
    var secret = crypto.randomBytes(16).toString('hex');

    var trigger = {
      triggerId: triggerId,
      userId: req.user.id,
      name: name,
      type: type,
      targetAgent: targetAgent,
      promptTemplate: promptTemplate,
      secret: secret,
      webhookUrl: WEBHOOK_BASE + '/' + triggerId,
      enabled: true,
      createdAt: new Date().toISOString(),
      lastTriggeredAt: null,
      triggerCount: 0,
      serverId: req.body.serverId || null
    };

    db.triggers.push(trigger);
    await saveDB(db);

    res.json({ success: true, trigger: trigger });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || '创建触发器失败' });
  }
});

// POST /update — 更新触发器
router.post('/update', async function(req, res) {
  var triggerId = req.body.triggerId;
  var patch = req.body.patch || {};

  if (!triggerId) return res.status(400).json({ success: false, error: '缺少 triggerId' });

  try {
    var db = await getDB();
    if (!db.triggers) db.triggers = [];

    var trigger = db.triggers.find(function(t) { return t.triggerId === triggerId && t.userId === req.user.id; });
    if (!trigger) return res.status(404).json({ success: false, error: '触发器不存在' });

    // 白名单字段
    if ('name' in patch) {
      var n = (patch.name || '').trim();
      if (!n || n.length > 50) return res.status(400).json({ success: false, error: '名称不合法' });
      trigger.name = n;
    }
    if ('enabled' in patch) {
      trigger.enabled = !!patch.enabled;
    }
    if ('targetAgent' in patch) {
      if (!patch.targetAgent.trim()) return res.status(400).json({ success: false, error: '目标 Agent 不能为空' });
      trigger.targetAgent = patch.targetAgent.trim();
    }
    if ('promptTemplate' in patch) {
      var pt = (patch.promptTemplate || '').trim();
      if (!pt || pt.length > 2000) return res.status(400).json({ success: false, error: 'Prompt 模板不合法' });
      trigger.promptTemplate = pt;
    }

    await saveDB(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || '更新触发器失败' });
  }
});

// POST /remove — 删除触发器
router.post('/remove', async function(req, res) {
  var triggerId = req.body.triggerId;
  if (!triggerId) return res.status(400).json({ success: false, error: '缺少 triggerId' });

  try {
    var db = await getDB();
    if (!db.triggers) db.triggers = [];

    var idx = db.triggers.findIndex(function(t) { return t.triggerId === triggerId && t.userId === req.user.id; });
    if (idx === -1) return res.status(404).json({ success: false, error: '触发器不存在' });

    db.triggers.splice(idx, 1);

    // 同时删除该触发器的日志
    if (db.triggerLogs) {
      db.triggerLogs = db.triggerLogs.filter(function(l) { return l.triggerId !== triggerId; });
    }

    await saveDB(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || '删除触发器失败' });
  }
});

// GET /logs/:triggerId — 获取执行日志
router.get('/logs/:triggerId', async function(req, res) {
  var triggerId = req.params.triggerId;

  if (!TRIGGER_ID_RE.test(triggerId)) {
    return res.status(400).json({ success: false, error: '无效的触发器 ID' });
  }

  try {
    var db = await getDB();

    // 验证 triggerId 属于当前用户
    if (!db.triggers) db.triggers = [];
    var trigger = db.triggers.find(function(t) { return t.triggerId === triggerId && t.userId === req.user.id; });
    if (!trigger) return res.status(404).json({ success: false, error: '触发器不存在' });

    if (!db.triggerLogs) db.triggerLogs = [];
    var logs = db.triggerLogs
      .filter(function(l) { return l.triggerId === triggerId; })
      .sort(function(a, b) { return new Date(b.triggeredAt) - new Date(a.triggeredAt); })
      .slice(0, 50);

    res.json({ success: true, logs: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || '获取日志失败' });
  }
});

// POST /test/:triggerId — 测试触发器（内部调用 webhook 逻辑）
router.post('/test/:triggerId', async function(req, res) {
  var triggerId = req.params.triggerId;

  if (!TRIGGER_ID_RE.test(triggerId)) {
    return res.status(400).json({ success: false, error: '无效的触发器 ID' });
  }

  try {
    var db = await getDB();
    if (!db.triggers) db.triggers = [];
    var trigger = db.triggers.find(function(t) { return t.triggerId === triggerId && t.userId === req.user.id; });
    if (!trigger) return res.status(404).json({ success: false, error: '触发器不存在' });
    if (!trigger.enabled) return res.status(400).json({ success: false, error: '触发器已禁用' });

    // 使用测试 payload 发送消息
    var testPayload = { test: true, triggeredAt: new Date().toISOString(), source: 'manual-test' };
    var result = await executeTrigger(trigger, JSON.stringify(testPayload), {}, db);
    res.json({ success: true, message: '测试触发已发送', logId: result.logId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || '测试触发失败' });
  }
});

// ============ Webhook Entry Point (no auth) ============

// POST /:triggerId — Webhook 入口（外部调用，不需要登录）
// 注意：这个路由放在 router 末尾，避免和前面的路由冲突
// 由于 router.use(verifyToken) 已经加在上面，这个路由也需要跳过鉴权
// 所以 webhook 入口需要单独的 router（见下方 webhook.js）

// ============ Trigger Execution ============

async function executeTrigger(trigger, bodyStr, headers, db) {
  var startTime = Date.now();
  var logId = crypto.randomUUID();
  var logEntry = {
    logId: logId,
    triggerId: trigger.triggerId,
    status: 'success',
    payload: bodyStr.substring(0, 1000),
    error: null,
    triggeredAt: new Date().toISOString(),
    responseTime: null
  };

  try {
    // 构建 prompt 内容
    var content = trigger.promptTemplate
      .replace(/\{\{payload\}\}/g, bodyStr)
      .replace(/\{\{headers\}\}/g, JSON.stringify(headers))
      .replace(/\{\{body\}\}/g, bodyStr);

    // 找到触发器所属用户的服务器
    var userServer = null;
    if (trigger.serverId) {
      userServer = db.userServers?.find(function(s) { return s.userId === trigger.userId && s.id === trigger.serverId; }) || null;
    }
    if (!userServer) {
      userServer = getActiveServer(db, trigger.userId);
    }

    if (!userServer?.ip) {
      logEntry.status = 'failed';
      logEntry.error = '用户未配置服务器';
      logEntry.responseTime = Date.now() - startTime;
      if (!db.triggerLogs) db.triggerLogs = [];
      db.triggerLogs.push(logEntry);
      cleanupLogs(db, trigger.triggerId);
      await saveDB(db);
      return logEntry;
    }

    // 通过 OpenClaw RPC chat.send 发送消息
    await callOpenClawRPC(userServer, 'chat.send', {
      agentId: trigger.targetAgent,
      text: content,
      channel: 'webhook'
    }, { timeout: 15000, clientId: 'openclaw-control-ui', displayName: 'Webhook触发器' });

    logEntry.responseTime = Date.now() - startTime;
  } catch (err) {
    logEntry.status = 'failed';
    logEntry.error = err.message || 'RPC 调用失败';
    logEntry.responseTime = Date.now() - startTime;
  }

  // 记录日志
  if (!db.triggerLogs) db.triggerLogs = [];
  db.triggerLogs.push(logEntry);
  cleanupLogs(db, trigger.triggerId);

  // 更新触发器统计
  trigger.lastTriggeredAt = new Date().toISOString();
  trigger.triggerCount = (trigger.triggerCount || 0) + 1;

  await saveDB(db);
  return logEntry;
}

export default router;
export { executeTrigger };
