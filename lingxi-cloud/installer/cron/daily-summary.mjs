#!/usr/bin/env node
/**
 * 每日总结 Cron 任务
 * 每天晚上 22:00 执行
 */

import { saveDailySummary } from '../skills/memory-system/conversation-summary.mjs';

console.log('🌙 开始执行每日总结...');

try {
  const summary = await saveDailySummary();
  
  if (summary) {
    console.log('✅ 每日总结完成');
    console.log(summary);
  } else {
    console.log('📭 今日无重要内容');
  }
} catch (error) {
  console.error('❌ 每日总结失败:', error.message);
  process.exit(1);
}
