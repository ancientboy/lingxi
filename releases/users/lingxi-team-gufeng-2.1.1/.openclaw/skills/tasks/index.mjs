/**
 * 任务管理技能
 * 
 * 功能：
 * - 添加/查看/完成/删除任务
 * - 智能安排日程
 * - 邮件提醒
 */

import Supermemory from 'supermemory';
import fs from 'fs';
import path from 'path';

const API_KEY = process.env.SUPERMEMORY_API_KEY;
const USER_ID = process.env.SUPERMEMORY_USER_ID || 'default';
const TASKS_FILE = '/home/admin/.openclaw/workspace/memory/tasks.json';
const ALERT_EMAIL = '356328982@qq.com';

let client = null;

function getClient() {
  if (!client && API_KEY) {
    client = new Supermemory({ apiKey: API_KEY });
  }
  return client;
}

// 加载本地任务
function loadTasks() {
  try {
    if (fs.existsSync(TASKS_FILE)) {
      return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

// 保存任务
function saveTasks(tasks) {
  const dir = path.dirname(TASKS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

/**
 * 添加任务
 * @param {string} title - 任务标题
 * @param {object} options - { time, duration, priority, note, repeat, tags }
 *   - repeat: 'daily' | 'weekly' | 'monthly' | null
 *   - tags: ['工作', '生活', '学习']
 */
export async function add(title, options = {}) {
  const tasks = loadTasks();
  
  const task = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    title,
    time: options.time || null,
    duration: options.duration || 60,
    priority: options.priority || 'normal',
    note: options.note || '',
    repeat: options.repeat || null,  // daily, weekly, monthly
    tags: options.tags || [],        // 标签分类
    done: false,
    alerted: false,
    overdue: false,
    createdAt: new Date().toISOString()
  };
  
  tasks.push(task);
  saveTasks(tasks);
  
  // 同步到 Supermemory
  const c = getClient();
  if (c) {
    await c.add({
      content: `待办任务: ${title}${options.time ? ` (时间: ${options.time})` : ''}${options.tags ? ` [${options.tags.join(',')}]` : ''}`,
      containerTag: USER_ID
    });
  }
  
  console.log(`✅ 已添加任务: ${title}`);
  if (options.repeat) console.log(`   🔄 重复: ${options.repeat}`);
  if (options.tags?.length) console.log(`   🏷️ 标签: ${options.tags.join(', ')}`);
  
  return task;
}

/**
 * 查看任务列表
 * @param {object} filter - { date, done, priority, tag }
 */
export function list(filter = {}) {
  let tasks = loadTasks();
  
  if (filter.done !== undefined) {
    tasks = tasks.filter(t => t.done === filter.done);
  }
  
  if (filter.date) {
    tasks = tasks.filter(t => t.time && t.time.startsWith(filter.date));
  }
  
  if (filter.priority) {
    tasks = tasks.filter(t => t.priority === filter.priority);
  }
  
  if (filter.tag) {
    tasks = tasks.filter(t => t.tags && t.tags.includes(filter.tag));
  }
  
  // 按时间排序
  tasks.sort((a, b) => {
    if (!a.time) return 1;
    if (!b.time) return -1;
    return new Date(a.time) - new Date(b.time);
  });
  
  return tasks;
}

/**
 * 按标签分类查看
 */
export function byTag() {
  const tasks = loadTasks().filter(t => !t.done);
  const groups = {};
  
  for (const task of tasks) {
    const tags = task.tags?.length ? task.tags : ['未分类'];
    for (const tag of tags) {
      if (!groups[tag]) groups[tag] = [];
      groups[tag].push(task);
    }
  }
  
  console.log('\n📦 任务分类:\n');
  for (const [tag, items] of Object.entries(groups)) {
    console.log(`【${tag}】${items.length} 项`);
    items.slice(0, 3).forEach(t => {
      const time = t.time ? t.time.split(' ')[1]?.substring(0, 5) || '' : '';
      console.log(`  ${time ? time + ' ' : ''}${t.title}`);
    });
    if (items.length > 3) console.log(`  ... 还有 ${items.length - 3} 项`);
    console.log('');
  }
  
  return groups;
}

/**
 * 查看某天日程
 * @param {string} date - YYYY-MM-DD
 */
export function day(date) {
  const tasks = loadTasks().filter(t => t.time && t.time.startsWith(date));
  
  console.log(`\n📅 ${date} 日程安排:\n`);
  
  if (tasks.length === 0) {
    console.log('  (暂无安排)');
    return tasks;
  }
  
  tasks.sort((a, b) => new Date(a.time) - new Date(b.time));
  
  tasks.forEach((t, i) => {
    const time = t.time.split(' ')[1] || '00:00';
    const status = t.done ? '✅' : '⏳';
    console.log(`  ${status} ${time} - ${t.title} (${t.duration}分钟)`);
  });
  
  return tasks;
}

/**
 * 完成任务
 * @param {string} id - 任务 ID
 */
export function complete(id) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === id);
  
  if (task) {
    task.done = true;
    task.completedAt = new Date().toISOString();
    
    // 如果是重复任务，创建下一个
    if (task.repeat) {
      const nextTask = createNextRepeat(task);
      if (nextTask) {
        tasks.push(nextTask);
        console.log(`🔄 已创建下次重复任务: ${nextTask.title} (${nextTask.time})`);
      }
    }
    
    saveTasks(tasks);
    console.log(`✅ 已完成: ${task.title}`);
    return task;
  }
  
  console.log(`❌ 未找到任务: ${id}`);
  return null;
}

// 创建下一个重复任务
function createNextRepeat(task) {
  if (!task.time || !task.repeat) return null;
  
  const baseTime = new Date(task.time);
  let nextTime;
  
  switch (task.repeat) {
    case 'daily':
      nextTime = new Date(baseTime.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'weekly':
      nextTime = new Date(baseTime.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      nextTime = new Date(baseTime);
      nextTime.setMonth(nextTime.getMonth() + 1);
      break;
    default:
      return null;
  }
  
  return {
    ...task,
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    time: nextTime.toISOString().replace('T', ' ').substring(0, 16),
    done: false,
    alerted: false,
    overdue: false,
    createdAt: new Date().toISOString()
  };
}

/**
 * 检查超期任务
 */
export function checkOverdue() {
  const tasks = loadTasks().filter(t => !t.done && t.time);
  const now = new Date();
  const overdue = [];
  
  for (const task of tasks) {
    const taskTime = new Date(task.time);
    if (taskTime < now) {
      task.overdue = true;
      const hoursLate = Math.round((now - taskTime) / 3600000);
      overdue.push({ ...task, hoursLate });
    }
  }
  
  if (overdue.length > 0) {
    saveTasks(tasks);
  }
  
  return overdue;
}

/**
 * 删除任务
 * @param {string} id
 */
export function remove(id) {
  let tasks = loadTasks();
  const index = tasks.findIndex(t => t.id === id);
  
  if (index > -1) {
    const removed = tasks.splice(index, 1)[0];
    saveTasks(tasks);
    console.log(`🗑️ 已删除: ${removed.title}`);
    return removed;
  }
  
  console.log(`❌ 未找到任务: ${id}`);
  return null;
}

/**
 * 智能安排任务
 * 自动找空闲时间段
 * @param {string} title
 * @param {object} options - { duration, date, preferTime }
 */
export function schedule(title, options = {}) {
  const duration = options.duration || 60;
  const date = options.date || new Date().toISOString().split('T')[0];
  
  // 获取当天已有任务
  const existing = loadTasks().filter(t => 
    t.time && t.time.startsWith(date) && !t.done
  );
  
  // 找空闲时间段
  const slots = findFreeSlots(date, existing, duration);
  
  if (slots.length === 0) {
    console.log('⚠️ 今天没有空闲时间了');
    return null;
  }
  
  // 选择第一个空闲时间段
  const slot = options.preferTime 
    ? slots.find(s => s.start.includes(options.preferTime)) || slots[0]
    : slots[0];
  
  // 添加任务
  return add(title, {
    ...options,
    time: slot.start
  });
}

// 找空闲时间段
function findFreeSlots(date, existing, duration) {
  const slots = [];
  const workStart = 9;  // 9点开始
  const workEnd = 22;   // 22点结束
  
  // 生成所有可能的时间段（每小时一个）
  for (let hour = workStart; hour < workEnd; hour++) {
    const slotStart = `${date} ${hour.toString().padStart(2, '0')}:00`;
    const slotEnd = new Date(new Date(slotStart).getTime() + duration * 60000);
    
    // 检查是否冲突
    const conflict = existing.some(task => {
      if (!task.time) return false;
      const taskStart = new Date(task.time);
      const taskEnd = new Date(taskStart.getTime() + (task.duration || 60) * 60000);
      const slotStartObj = new Date(slotStart);
      
      return slotStartObj >= taskStart && slotStartObj < taskEnd;
    });
    
    if (!conflict) {
      slots.push({
        start: slotStart,
        end: slotEnd.toISOString()
      });
    }
  }
  
  return slots;
}

/**
 * 检查即将到期的任务（用于 heartbeat）
 * @param {number} minutes - 提前多少分钟提醒
 */
export function checkUpcoming(minutes = 30) {
  const tasks = loadTasks().filter(t => !t.done && t.time);
  const now = new Date();
  const upcoming = [];
  
  for (const task of tasks) {
    const taskTime = new Date(task.time);
    const diff = (taskTime - now) / 60000; // 分钟差
    
    if (diff > 0 && diff <= minutes) {
      upcoming.push({
        ...task,
        minutesLeft: Math.round(diff)
      });
    }
  }
  
  return upcoming;
}

/**
 * 检查并提醒即将到期的任务
 * 用于 heartbeat 调用
 */
export async function checkAndAlert() {
  const alerts = [];
  
  // 1. 检查即将到期的任务
  const upcoming = checkUpcoming(30);
  for (const task of upcoming) {
    if (task.alerted) continue;
    
    await sendAlert({
      ...task,
      type: '即将到期'
    });
    
    // 标记已提醒
    const tasks = loadTasks();
    const t = tasks.find(x => x.id === task.id);
    if (t) {
      t.alerted = true;
      saveTasks(tasks);
    }
    
    alerts.push({ ...task, alertType: 'upcoming' });
  }
  
  // 2. 检查超期任务
  const overdue = checkOverdue();
  for (const task of overdue) {
    if (task.overdueAlerted) continue;
    
    await sendAlert({
      ...task,
      title: `⚠️ 超期提醒: ${task.title}`,
      note: `已超期 ${task.hoursLate} 小时\n${task.note || ''}`
    });
    
    // 标记已提醒超期
    const tasks = loadTasks();
    const t = tasks.find(x => x.id === task.id);
    if (t) {
      t.overdueAlerted = true;
      saveTasks(tasks);
    }
    
    alerts.push({ ...task, alertType: 'overdue' });
  }
  
  return alerts;
}

/**
 * 发送微信提醒 (Server酱)
 */
export async function sendAlert(task) {
  const token = 'SCT314733TfrutgzVOaByB4LMIO5GzH8Aw';
  
  try {
    const res = await fetch(`https://sctapi.ftqq.com/${token}.send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        title: `⏰ 任务提醒: ${task.title}`,
        desp: `**任务**: ${task.title}\n\n**时间**: ${task.time}\n\n**时长**: ${task.duration}分钟\n\n${task.note ? '**备注**: ' + task.note + '\n\n' : ''}---\n\n来自灵犀 ⚡`
      })
    });
    
    const data = await res.json();
    
    if (data.code === 0) {
      console.log(`✅ 微信提醒已发送: ${task.title}`);
      return { sent: true };
    } else {
      console.log(`❌ 发送失败:`, data.message);
      return { sent: false, error: data.message };
    }
  } catch (e) {
    console.log(`❌ 发送失败:`, e.message);
    return { sent: false, error: e.message };
  }
}

// 默认导出
export default {
  add,
  list,
  day,
  byTag,
  complete,
  remove,
  schedule,
  checkUpcoming,
  checkOverdue,
  checkAndAlert,
  sendAlert
};
