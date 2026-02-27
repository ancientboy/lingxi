/**
 * 对话总结与记忆提取
 * 
 * 功能：
 * 1. 对话结束时自动提取重要信息
 * 2. 每日总结并记录重要工作
 * 3. 双重存储（本地 + Supermemory）
 */

import { MemoryManager } from './manager.mjs';
import fs from 'fs';
import path from 'path';

const MEMORY_DIR = path.join(process.env.HOME, '.openclaw', 'memory');

let manager = null;

function getManager() {
  if (!manager) {
    manager = new MemoryManager({
      primary: 'supermemory',
      local: { enabled: true },
      supermemory: { enabled: true },
      syncStrategy: 'auto'
    });
  }
  return manager;
}

// ============ 对话结束自动提取 ============

/**
 * 从对话中提取重要信息
 */
export function extractFromConversation(messages) {
  const extracted = {
    decisions: [],
    preferences: [],
    milestones: [],
    learnings: [],
    todos: []
  };
  
  // 关键词模式
  const patterns = {
    decisions: [
      /决定[了用]/,
      /选择.*方案/,
      /确定/,
      /就这样/,
      /敲定/
    ],
    preferences: [
      /我[喜欢讨厌偏好]/,
      /以后.*要/,
      /不要.*了/,
      /希望/,
      /习惯/
    ],
    milestones: [
      /完成[了用]/,
      /成功/,
      /解决/,
      /实现/,
      /达成/
    ],
    learnings: [
      /学到了/,
      /发现了/,
      /明白了/,
      /理解了/,
      /原来/
    ],
    todos: [
      /待办/,
      /要做/,
      /接下来/,
      /明天/,
      /下次/
    ]
  };
  
  // 分析每条消息
  for (const msg of messages) {
    const content = msg.content || msg;
    if (typeof content !== 'string') continue;
    
    for (const [type, regexList] of Object.entries(patterns)) {
      for (const regex of regexList) {
        if (regex.test(content)) {
          // 提取包含关键词的句子
          const sentences = content.split(/[。！？\n]/);
          for (const sentence of sentences) {
            if (regex.test(sentence) && sentence.length > 5) {
              extracted[type].push(sentence.trim());
            }
          }
        }
      }
    }
  }
  
  // 去重
  for (const type of Object.keys(extracted)) {
    extracted[type] = [...new Set(extracted[type])].slice(0, 5);
  }
  
  return extracted;
}

/**
 * 对话结束时自动存储（双重存储）
 */
export async function saveConversationSummary(messages, metadata = {}) {
  const m = getManager();
  
  const extracted = extractFromConversation(messages);
  
  const stored = [];
  const date = new Date().toISOString().split('T')[0];
  
  // 存储决策
  for (const decision of extracted.decisions) {
    try {
      await m.add(`[决策] ${decision}`, {
        type: 'decision',
        domain: 'business',
        importance: 8,
        date,
        conversationId: metadata.conversationId
      });
      stored.push({ type: 'decision', content: decision });
    } catch (e) {
      console.error('存储决策失败:', e.message);
    }
  }
  
  // 存储偏好
  for (const pref of extracted.preferences) {
    try {
      await m.add(`[偏好] ${pref}`, {
        type: 'preference',
        domain: 'personal',
        importance: 8,
        date
      });
      stored.push({ type: 'preference', content: pref });
    } catch (e) {
      console.error('存储偏好失败:', e.message);
    }
  }
  
  // 存储里程碑
  for (const milestone of extracted.milestones) {
    try {
      await m.add(`[里程碑] ${milestone}`, {
        type: 'milestone',
        domain: 'business',
        importance: 9,
        date
      });
      stored.push({ type: 'milestone', content: milestone });
    } catch (e) {
      console.error('存储里程碑失败:', e.message);
    }
  }
  
  // 存储学习
  for (const learning of extracted.learnings) {
    try {
      await m.add(`[学习] ${learning}`, {
        type: 'learning',
        domain: 'personal',
        importance: 7,
        date
      });
      stored.push({ type: 'learning', content: learning });
    } catch (e) {
      console.error('存储学习失败:', e.message);
    }
  }
  
  if (stored.length > 0) {
    console.log(`✅ 对话总结已存储（本地+云端）: ${stored.length} 条`);
  }
  
  return stored;
}

// ============ 每日总结 ============

/**
 * 生成每日总结
 */
export async function generateDailySummary(date = null) {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const dailyFile = path.join(MEMORY_DIR, `${targetDate}.md`);
  
  let summary = {
    date: targetDate,
    work: [],
    decisions: [],
    milestones: [],
    learnings: [],
    nextSteps: []
  };
  
  // 1. 读取当日笔记
  if (fs.existsSync(dailyFile)) {
    const content = fs.readFileSync(dailyFile, 'utf-8');
    
    // 提取关键信息（简单解析）
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.includes('✅') || line.includes('完成')) {
        summary.work.push(line.replace(/[#*✅]/g, '').trim());
      }
      if (line.includes('决定') || line.includes('选择')) {
        summary.decisions.push(line.replace(/[#*]/g, '').trim());
      }
    }
  }
  
  // 2. 从 Supermemory 获取当日的记忆
  const c = getClient();
  if (c) {
    try {
      const profile = await c.profile({
        containerTag: USER_ID,
        q: targetDate
      });
      
      const memories = (profile.searchResults?.results || [])
        .map(r => r.memory?.content || r.content)
        .filter(Boolean);
      
      for (const memory of memories) {
        if (memory.includes('[里程碑]')) {
          summary.milestones.push(memory);
        } else if (memory.includes('[决策]')) {
          summary.decisions.push(memory);
        } else if (memory.includes('[学习]')) {
          summary.learnings.push(memory);
        }
      }
    } catch (e) {
      console.error('获取当日记忆失败:', e.message);
    }
  }
  
  return summary;
}

/**
 * 存储每日总结到 Supermemory
 */
export async function saveDailySummary(date = null) {
  const c = getClient();
  if (!c) return null;
  
  const summary = await generateDailySummary(date);
  const targetDate = summary.date;
  
  // 去重
  summary.work = [...new Set(summary.work)].slice(0, 10);
  summary.decisions = [...new Set(summary.decisions)].slice(0, 5);
  summary.milestones = [...new Set(summary.milestones)].slice(0, 5);
  summary.learnings = [...new Set(summary.learnings)].slice(0, 5);
  
  // 如果没有任何内容，跳过
  if (summary.work.length === 0 && summary.decisions.length === 0 && 
      summary.milestones.length === 0 && summary.learnings.length === 0) {
    console.log('📭 今日无重要内容，跳过总结');
    return null;
  }
  
  // 格式化总结
  const summaryText = [
    `📅 ${targetDate} 工作总结`,
    '',
    summary.work.length > 0 ? `### 完成的工作\n${summary.work.map(w => `- ${w}`).join('\n')}` : '',
    summary.decisions.length > 0 ? `### 重要决策\n${summary.decisions.map(d => `- ${d}`).join('\n')}` : '',
    summary.milestones.length > 0 ? `### 里程碑\n${summary.milestones.map(m => `- ${m}`).join('\n')}` : '',
    summary.learnings.length > 0 ? `### 学习收获\n${summary.learnings.map(l => `- ${l}`).join('\n')}` : ''
  ].filter(Boolean).join('\n');
  
  try {
    await c.add({
      content: summaryText,
      containerTag: USER_ID,
      metadata: {
        type: 'daily-summary',
        domain: 'business',
        importance: 9,
        date: targetDate
      }
    });
    
    console.log(`✅ 每日总结已存储: ${targetDate}`);
    console.log(summaryText);
    
    return summaryText;
  } catch (e) {
    console.error('存储每日总结失败:', e.message);
    return null;
  }
}

/**
 * 存储用户要求的总结（双重存储）
 */
export async function saveUserSummary(summaryContent, type = 'general') {
  const m = getManager();
  
  const date = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString();
  
  try {
    await m.add(`[用户总结] ${summaryContent}`, {
      type: 'user-summary',
      subType: type,
      domain: 'business',
      importance: 9,
      date,
      timestamp
    });
    
    console.log(`✅ 用户总结已存储（本地+云端）: ${summaryContent.substring(0, 50)}...`);
    
    return { success: true, content: summaryContent };
  } catch (e) {
    console.error('存储用户总结失败:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * 检索历史总结（优先本地，后备云端）
 */
export async function recallSummaries(query = null, days = 7) {
  const m = getManager();
  
  try {
    const searchQuery = query 
      ? `${query} 总结 里程碑 决策` 
      : '总结 里程碑 决策 完成';
    
    const results = await m.search(searchQuery, { limit: days * 2 });
    
    const filtered = results
      .map(r => ({
        content: r.content,
        score: r.metadata?.score || 1,
        date: r.metadata?.date || 'unknown'
      }))
      .filter(r => r.content && r.content.length > 10)
      .slice(0, days * 2);
    
    console.log(`📋 检索到 ${filtered.length} 条历史总结（本地+云端）`);
    
    return filtered;
  } catch (e) {
    console.error('检索历史总结失败:', e.message);
    return [];
  }
}

/**
 * 格式化历史总结（用于展示给用户）
 */
export async function formatRecall(query = null) {
  const summaries = await recallSummaries(query);
  
  if (summaries.length === 0) {
    return '没有找到相关的历史记录。';
  }
  
  const parts = ['📚 历史总结记录：\n'];
  
  // 按日期分组
  const grouped = {};
  for (const s of summaries) {
    const date = s.date || 'unknown';
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(s.content);
  }
  
  // 格式化输出
  for (const [date, items] of Object.entries(grouped).slice(0, 7)) {
    parts.push(`### ${date}`);
    for (const item of items.slice(0, 3)) {
      const clean = item.replace(/\[用户总结\]|\[里程碑\]|\[决策\]/g, '').trim();
      parts.push(`- ${clean.substring(0, 100)}${clean.length > 100 ? '...' : ''}`);
    }
    parts.push('');
  }
  
  return parts.join('\n');
}

/**
 * 获取历史总结（按需加载）
 */
export async function getRecentSummaries(days = 7) {
  const c = getClient();
  if (!c) return [];
  
  try {
    const profile = await c.profile({
      containerTag: USER_ID,
      q: '工作总结 daily-summary'
    });
    
    return (profile.searchResults?.results || [])
      .filter(r => r.memory?.content?.includes('工作总结'))
      .slice(0, days)
      .map(r => ({
        content: r.memory?.content,
        score: r.score
      }));
  } catch (e) {
    console.error('获取历史总结失败:', e.message);
    return [];
  }
}

// ============ 导出 ============

export default {
  extractFromConversation,
  saveConversationSummary,
  generateDailySummary,
  saveDailySummary,
  getRecentSummaries
};
