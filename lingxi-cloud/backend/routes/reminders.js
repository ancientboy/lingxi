/**
 * 智能提醒系统 API
 *
 * 路由：
 *   GET  /list           — 获取提醒列表
 *   POST /create         — 创建提醒
 *   POST /update         — 更新提醒
 *   POST /remove         — 删除提醒
 *   POST /complete/:id   — 标记完成
 *   POST /check          — 手动触发检查（测试用）
 */

import { Router } from 'express';
import crypto from 'crypto';
import { verifyToken } from '../middleware/auth.js';
import { getDB, saveDB } from '../utils/db.js';

const router = Router();

// 所有路由都需要登录
router.use(verifyToken);

// ============ Helpers ============

function generateId() {
  return 'rem_' + crypto.randomUUID();
}

/**
 * 计算重复提醒的下次触发时间
 * @param {string} triggerAt - 当前触发时间（ISO）
 * @param {string} type - once | daily | weekly | monthly
 * @returns {string} 下次触发时间（ISO）
 */
function computeNextTrigger(triggerAt, type) {
  var d = new Date(triggerAt);
  switch (type) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    default:
      return null; // once 类型没有下次
  }
  return d.toISOString();
}

// ============ Routes ============

// GET /api/reminders/list — 获取提醒列表
router.get('/list', async (req, res) => {
  try {
    var db = await getDB();
    var reminders = (db.reminders || [])
      .filter(function(r) { return r.userId === req.user.id; })
      .sort(function(a, b) { return new Date(a.triggerAt) - new Date(b.triggerAt); });

    res.json({ success: true, reminders: reminders });
  } catch (e) {
    console.error('[提醒] 获取列表失败:', e);
    res.status(500).json({ success: false, error: '获取提醒列表失败' });
  }
});

// POST /api/reminders/create — 创建提醒
router.post('/create', async (req, res) => {
  try {
    var title = (req.body.title || '').trim();
    var content = (req.body.content || '').trim();
    var triggerAt = req.body.triggerAt;
    var type = req.body.type || 'once';
    var relatedSession = req.body.relatedSession || null;

    // 校验
    if (!title) {
      return res.status(400).json({ success: false, error: '标题不能为空' });
    }
    if (title.length > 100) {
      return res.status(400).json({ success: false, error: '标题不能超过 100 字' });
    }
    if (content.length > 500) {
      return res.status(400).json({ success: false, error: '内容不能超过 500 字' });
    }
    if (!triggerAt) {
      return res.status(400).json({ success: false, error: '触发时间不能为空' });
    }

    var triggerDate = new Date(triggerAt);
    if (isNaN(triggerDate.getTime())) {
      return res.status(400).json({ success: false, error: '触发时间格式无效' });
    }
    if (triggerDate.getTime() <= Date.now()) {
      return res.status(400).json({ success: false, error: '触发时间必须是未来时间' });
    }

    var validTypes = ['once', 'daily', 'weekly', 'monthly'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, error: '无效的重复类型' });
    }

    var reminder = {
      id: generateId(),
      userId: req.user.id,
      title: title,
      content: content || null,
      triggerAt: triggerDate.toISOString(),
      type: type,
      relatedSession: relatedSession,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    var db = await getDB();
    if (!db.reminders) db.reminders = [];
    db.reminders.push(reminder);
    await saveDB(db);

    res.json({ success: true, reminder: reminder });
  } catch (e) {
    console.error('[提醒] 创建失败:', e);
    res.status(500).json({ success: false, error: '创建提醒失败' });
  }
});

// POST /api/reminders/update — 更新提醒
router.post('/update', async (req, res) => {
  try {
    var id = req.body.id;
    var title = req.body.title;
    var content = req.body.content;
    var triggerAt = req.body.triggerAt;
    var enabled = req.body.enabled;

    if (!id) {
      return res.status(400).json({ success: false, error: '缺少提醒 ID' });
    }

    var db = await getDB();
    var reminder = (db.reminders || []).find(function(r) {
      return r.id === id && r.userId === req.user.id;
    });

    if (!reminder) {
      return res.status(404).json({ success: false, error: '提醒不存在' });
    }
    if (reminder.status !== 'pending') {
      return res.status(400).json({ success: false, error: '只能更新待办提醒' });
    }

    // 应用更新
    if (title !== undefined) {
      title = String(title).trim();
      if (!title) return res.status(400).json({ success: false, error: '标题不能为空' });
      if (title.length > 100) return res.status(400).json({ success: false, error: '标题不能超过 100 字' });
      reminder.title = title;
    }
    if (content !== undefined) {
      content = String(content).trim();
      if (content.length > 500) return res.status(400).json({ success: false, error: '内容不能超过 500 字' });
      reminder.content = content || null;
    }
    if (triggerAt !== undefined) {
      var triggerDate = new Date(triggerAt);
      if (isNaN(triggerDate.getTime())) {
        return res.status(400).json({ success: false, error: '触发时间格式无效' });
      }
      if (triggerDate.getTime() <= Date.now()) {
        return res.status(400).json({ success: false, error: '触发时间必须是未来时间' });
      }
      reminder.triggerAt = triggerDate.toISOString();
    }
    if (enabled !== undefined) {
      // enabled=false 相当于暂停，enabled=true 恢复
      reminder.enabled = !!enabled;
    }

    await saveDB(db);
    res.json({ success: true });
  } catch (e) {
    console.error('[提醒] 更新失败:', e);
    res.status(500).json({ success: false, error: '更新提醒失败' });
  }
});

// POST /api/reminders/remove — 删除提醒
router.post('/remove', async (req, res) => {
  try {
    var id = req.body.id;
    if (!id) {
      return res.status(400).json({ success: false, error: '缺少提醒 ID' });
    }

    var db = await getDB();
    var idx = (db.reminders || []).findIndex(function(r) {
      return r.id === id && r.userId === req.user.id;
    });

    if (idx === -1) {
      return res.status(404).json({ success: false, error: '提醒不存在' });
    }

    db.reminders.splice(idx, 1);
    await saveDB(db);

    res.json({ success: true });
  } catch (e) {
    console.error('[提醒] 删除失败:', e);
    res.status(500).json({ success: false, error: '删除提醒失败' });
  }
});

// POST /api/reminders/complete/:id — 标记完成
router.post('/complete/:id', async (req, res) => {
  try {
    var id = req.params.id;
    var db = await getDB();
    var reminder = (db.reminders || []).find(function(r) {
      return r.id === id && r.userId === req.user.id;
    });

    if (!reminder) {
      return res.status(404).json({ success: false, error: '提醒不存在' });
    }

    reminder.status = 'completed';
    reminder.completedAt = new Date().toISOString();
    await saveDB(db);

    res.json({ success: true });
  } catch (e) {
    console.error('[提醒] 标记完成失败:', e);
    res.status(500).json({ success: false, error: '操作失败' });
  }
});

// POST /api/reminders/check — 手动触发检查（测试用）
router.post('/check', async (req, res) => {
  try {
    var count = await checkReminders();
    res.json({ success: true, fired: count });
  } catch (e) {
    console.error('[提醒] 手动检查失败:', e);
    res.status(500).json({ success: false, error: '检查失败' });
  }
});

// ============ 自动检查函数 ============

/**
 * 检查并触发到期提醒
 * - 遍历所有 pending 且 triggerAt <= now 的提醒
 * - 创建通知（写入 healthNotifications）
 * - once 类型 → status 改为 fired
 * - 重复类型 → 计算下次触发时间
 * @returns {number} 触发的提醒数量
 */
export async function checkReminders() {
  var db = await getDB();
  if (!db.reminders || db.reminders.length === 0) return 0;

  var now = Date.now();
  var firedCount = 0;

  // 只处理 pending 且未暂停的到期提醒
  var dueReminders = db.reminders.filter(function(r) {
    return r.status === 'pending' && r.enabled !== false && new Date(r.triggerAt).getTime() <= now;
  });

  for (var i = 0; i < dueReminders.length; i++) {
    var r = dueReminders[i];

    // 创建通知
    if (!db.healthNotifications) db.healthNotifications = [];
    db.healthNotifications.push({
      id: 'notif_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
      userId: r.userId,
      type: 'reminder',
      message: '提醒：' + r.title + (r.content ? ' — ' + r.content : ''),
      createdAt: new Date().toISOString(),
      read: false
    });

    // 更新提醒状态
    if (r.type === 'once') {
      r.status = 'fired';
    } else {
      // 重复类型：计算下次触发时间
      var nextTrigger = computeNextTrigger(r.triggerAt, r.type);
      if (nextTrigger) {
        r.triggerAt = nextTrigger;
      } else {
        r.status = 'fired';
      }
    }

    firedCount++;
  }

  if (firedCount > 0) {
    await saveDB(db);
    console.log('[提醒] 触发 ' + firedCount + ' 条到期提醒');
  }

  return firedCount;
}

export default router;
