/**
 * 自动记忆系统
 * 
 * 功能：
 * 1. 自动检测重要信息并存储
 * 2. 智能检索（本地 + 云端双重存储）
 * 3. Token 优化（分层加载）
 * 4. 自动同步（本地 + Supermemory）
 */

import { MemoryManager } from './manager.mjs';

let manager = null;
let profileCache = null;
let lastProfileUpdate = 0;

// ============ 初始化 ============

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

// ============ 自动检测关键词 ============

const MEMORY_TRIGGERS = {
  explicit: [
    '记住', '记下来', '以后要', '别忘了', '下次',
    'remember', '记忆', '重要'
  ],
  preference: [
    '我喜欢', '我讨厌', '我不喜欢', '我希望',
    '我偏好', '我的习惯', '我一般'
  ],
  decision: [
    '决定了', '选择', '确定', '就这样', '敲定'
  ],
  milestone: [
    '完成了', '成功了', '解决了', '实现了', '达成了'
  ]
};

/**
 * 检测是否应该存储
 */
export function shouldRemember(message) {
  const lower = message.toLowerCase();
  
  for (const [type, keywords] of Object.entries(MEMORY_TRIGGERS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return { shouldStore: true, type, keyword };
      }
    }
  }
  
  return { shouldStore: false };
}

/**
 * 提取关键信息
 */
export function extractKeyInfo(userMessage, assistantReply) {
  const info = [];
  
  // 检测用户明确要求记住
  const trigger = shouldRemember(userMessage);
  if (trigger.shouldStore) {
    info.push({
      content: userMessage,
      type: trigger.type,
      importance: trigger.type === 'explicit' ? 9 : 7
    });
  }
  
  // 检测偏好
  if (userMessage.includes('我喜欢') || userMessage.includes('我不喜欢')) {
    info.push({
      content: `用户偏好：${userMessage}`,
      type: 'preference',
      importance: 8
    });
  }
  
  // 检测决策
  if (userMessage.includes('决定') || userMessage.includes('选择')) {
    info.push({
      content: `决策：${userMessage}`,
      type: 'decision',
      importance: 8
    });
  }
  
  return info;
}

// ============ 自动存储 ============

/**
 * 自动存储重要信息（同步到本地 + 云端）
 */
export async function autoStore(userMessage, assistantReply, context = {}) {
  const m = getManager();
  
  const keyInfo = extractKeyInfo(userMessage, assistantReply);
  
  if (keyInfo.length === 0) {
    return null;
  }
  
  const stored = [];
  
  for (const info of keyInfo) {
    try {
      await m.add(info.content, {
        type: info.type,
        importance: info.importance,
        domain: context.domain || 'general',
        timestamp: new Date().toISOString(),
        conversationId: context.conversationId
      });
      
      stored.push(info);
      console.log(`✅ 自动存储: ${info.content.substring(0, 50)}...`);
    } catch (e) {
      console.error('存储失败:', e.message);
    }
  }
  
  // 清除画像缓存
  profileCache = null;
  
  return stored;
}

// ============ 智能检索 ============

/**
 * 获取用户画像（轻量级，每次对话加载）
 * 优先从本地获取，本地没有则从云端获取
 */
export async function getLightProfile() {
  const m = getManager();
  
  // 缓存 1 小时
  const now = Date.now();
  if (profileCache && (now - lastProfileUpdate) < 3600000) {
    return profileCache;
  }
  
  try {
    // 从本地获取 personal 领域的记忆
    const personal = await m.getByDomain('personal');
    
    // 提取偏好
    const preferences = personal
      .filter(p => p.metadata?.type === 'preference' || p.content.includes('偏好'))
      .map(p => p.content)
      .slice(0, 10);
    
    const result = {
      summary: preferences.slice(0, 3).join('\n'),
      preferences,
      total: personal.length,
      lastUpdate: new Date().toISOString()
    };
    
    profileCache = result;
    lastProfileUpdate = now;
    
    return result;
  } catch (e) {
    console.error('获取画像失败:', e.message);
    return { summary: '', preferences: [], total: 0 };
  }
}

/**
 * 语义检索相关记忆（本地 + 云端）
 * 只返回最相关的 top K 条
 */
export async function searchRelevant(query, topK = 3) {
  const m = getManager();
  
  try {
    const results = await m.search(query, { limit: topK });
    
    return results.map(r => ({
      content: r.content,
      score: r.metadata?.score || 1,
      relevance: (r.metadata?.score || 1) > 0.7 ? 'high' : 'medium'
    })).filter(r => r.content);
  } catch (e) {
    console.error('搜索失败:', e.message);
    return [];
  }
}

/**
 * 获取格式化的上下文（用于注入到 prompt）
 * 智能控制 token 消耗
 */
export async function getContextForPrompt(query = null) {
  const parts = [];
  
  // 1. 加载轻量画像（~200 tokens）
  const profile = await getLightProfile();
  
  if (profile.preferences.length > 0) {
    parts.push('【用户画像】');
    parts.push(profile.preferences.slice(0, 5).join('\n'));
  }
  
  // 2. 如果有查询，加载相关记忆（~300 tokens）
  if (query) {
    const relevant = await searchRelevant(query, 3);
    if (relevant.length > 0) {
      parts.push('\n【相关记忆】');
      parts.push(relevant.map(r => r.content).join('\n'));
    }
  }
  
  return parts.length > 0 ? parts.join('\n') : null;
}

// ============ 批量操作 ============

/**
 * 批量存储（用于初始化或迁移）
 */
export async function batchStore(items) {
  const m = getManager();
  const results = [];
  
  for (const item of items) {
    try {
      await m.add(item.content, {
        type: item.type || 'general',
        importance: item.importance || 5,
        domain: item.domain || 'general',
        timestamp: new Date().toISOString()
      });
      results.push(item);
    } catch (e) {
      console.error('批量存储失败:', e.message);
    }
  }
  
  return results;
}

// ============ 统计 ============

/**
 * 获取记忆统计
 */
export async function getStats() {
  const m = getManager();
  
  try {
    const stats = await m.getStats();
    return {
      total: stats.total,
      byDomain: stats.byDomain,
      byAdapter: stats.byAdapter,
      cacheHit: !!profileCache
    };
  } catch (e) {
    return { total: 0, byDomain: {}, byAdapter: {} };
  }
}

// ============ 导出 ============

export default {
  shouldRemember,
  extractKeyInfo,
  autoStore,
  getLightProfile,
  searchRelevant,
  getContextForPrompt,
  batchStore,
  getStats
};
