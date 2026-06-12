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

/** jobId 合法字符：字母、数字、短横线 */
const JOB_ID_RE = /^[a-zA-Z0-9-]+$/;

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
  res.json({ success: true, jobs });
});

// POST /api/cron/add — 创建任务
router.post('/add', async (req, res) => {
  const { name, schedule, payload, enabled } = req.body;

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

  // 4. 获取服务器
  const userServer = await resolveServer(req, res);
  if (!userServer) return;

  // 5. RPC 调用（只传必要字段）
  const result = await rpc(res, userServer, 'cron.add', {
    name,
    schedule,
    payload: finalPayload,
    enabled: enabled !== false,
  }, 15000);
  if (!result) return;

  const job = result.payload?.job || result.payload || {};
  res.json({ success: true, job });
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

  // 6. RPC 调用 — jobId 独立传递，patch 经白名单过滤
  const result = await rpc(res, userServer, 'cron.update', { id: jobId, patch: safePatch }, 15000);
  if (!result) return;

  res.json({ success: true, job: result.payload?.job || result.payload || {} });
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

export default router;
