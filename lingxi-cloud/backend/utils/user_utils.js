import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { getDB, saveDB, getUser, addPoints } from './db.js';

/**
 * 检查用户是否为免费用户
 * @param {string} userId - 用户ID
 * @returns {boolean} - 是否为免费用户
 */
export function isFreeUser(userId) {
  const db = getDBSync();
  const user = db.users.find(u => u.id === userId);
  if (!user) return false;
  
  const plan = user.subscription?.plan || 'free';
  return plan === 'free';
}

/**
 * 获取用户订阅信息
 * @param {string} userId - 用户ID
 * @returns {object|null} - 订阅信息
 */
export function getSubscription(userId) {
  const db = getDBSync();
  const user = db.users.find(u => u.id === userId);
  if (!user) return null;
  
  return user.subscription || { plan: 'free', status: 'active' };
}

/**
 * 检查每日次数限制（已改为无限次）
 * @param {string} userId - 用户ID
 * @returns {object} - { allowed: boolean, message: string }
 */
export async function checkDailyLimit(userId) {
  return { allowed: true, message: '无限次使用' };
}

/**
 * 记录用户使用次数
 * @param {string} userId - 用户ID
 */
export async function recordUsage(userId) {
  const db = await getDB();
  const user = db.users.find(u => u.id === userId);
  
  if (!user) return;

  const plan = user.subscription?.plan || 'free';
  
  // 只记录免费用户的使用次数
  if (plan === 'free') {
    if (!user.dailyUsage) {
      user.dailyUsage = {
        date: null,
        count: 0,
        limit: 10
      };
    }

    const today = new Date().toISOString().split('T')[0];
    
    if (user.dailyUsage.date !== today) {
      user.dailyUsage.date = today;
      user.dailyUsage.count = 1;
    } else {
      user.dailyUsage.count++;
    }

    await saveDB(db);
    console.log(`📝 用户 ${userId} 今日使用次数: ${user.dailyUsage.count}/${user.dailyUsage.limit}`);
  }
}

/**
 * 同步方式获取数据库（仅用于简单读取）
 */
function getDBSync() {
  // 使用同步的 fs 模块
  const fs = require('fs');
  const path = require('path');
  
  const dataDir = path.join(__dirname, '..', 'data');
  const dbPath = path.join(dataDir, 'db.json');
  
  try {
    const data = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error('同步读取数据库失败:', e);
    return { users: [] };
  }
}
