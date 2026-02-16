/**
 * Supermemory Integration for OpenClaw
 * 
 * 提供长期记忆能力，自动从对话中学习和提取信息
 */

import Supermemory from 'supermemory';

const API_KEY = process.env.SUPERMEMORY_API_KEY;
const USER_ID = process.env.SUPERMEMORY_USER_ID || 'default';

let client = null;

function getClient() {
  if (!client && API_KEY) {
    client = new Supermemory({ apiKey: API_KEY });
  }
  return client;
}

/**
 * 添加记忆
 * @param {string} content - 记忆内容
 * @param {object} options - 选项 { containerTag, metadata }
 */
export async function add(content, options = {}) {
  const c = getClient();
  if (!c) {
    console.log('[Supermemory] No API key configured');
    return null;
  }
  
  try {
    const result = await c.add({
      content,
      containerTag: options.containerTag || USER_ID,
      metadata: options.metadata
    });
    return result;
  } catch (e) {
    console.error('[Supermemory] Add failed:', e.message);
    return null;
  }
}

/**
 * 添加对话
 * @param {Array} messages - 对话消息数组 [{ role, content }]
 */
export async function addConversation(messages, options = {}) {
  const content = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');
  return add(content, options);
}

/**
 * 查询相关记忆
 * @param {string} question - 查询问题
 * @param {number} topK - 返回数量
 */
export async function query(question, topK = 5) {
  const c = getClient();
  if (!c) return [];
  
  try {
    const profile = await c.profile({
      containerTag: USER_ID,
      q: question
    });
    
    return (profile.searchResults?.results || [])
      .slice(0, topK)
      .map(r => r.memory || r.content)
      .filter(Boolean);
  } catch (e) {
    console.error('[Supermemory] Query failed:', e.message);
    return [];
  }
}

/**
 * 获取用户画像
 */
export async function getProfile() {
  const c = getClient();
  if (!c) return { static: [], dynamic: [] };
  
  try {
    const profile = await c.profile({
      containerTag: USER_ID,
      q: '关于用户的一切'
    });
    
    return {
      static: profile.profile?.static || [],
      dynamic: profile.profile?.dynamic || [],
      recent: (profile.searchResults?.results || [])
        .slice(0, 5)
        .map(r => r.memory || r.content)
        .filter(Boolean)
    };
  } catch (e) {
    console.error('[Supermemory] Get profile failed:', e.message);
    return { static: [], dynamic: [] };
  }
}

/**
 * 获取上下文用于 LLM
 * 返回格式化的上下文字符串
 */
export async function getContext(question) {
  const [profile, memories] = await Promise.all([
    getProfile(),
    query(question, 3)
  ]);
  
  const parts = [];
  
  if (profile.static.length > 0) {
    parts.push('【用户画像】');
    parts.push(profile.dynamic.join('\n'));
  }
  
  if (memories.length > 0) {
    parts.push('\n【相关记忆】');
    parts.push(memories.join('\n'));
  }
  
  return parts.length > 0 ? parts.join('\n') : null;
}

// 默认导出
export default {
  add,
  addConversation,
  query,
  getProfile,
  getContext
};
