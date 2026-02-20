/**
 * 临时邮箱技能 - 为 Agent 提供自动化邮箱功能
 * 
 * 用于注册账号、接收验证码等场景
 */

const BASE_URL = 'https://api.internal.temp-mail.io/api/v3';

/**
 * 创建临时邮箱
 * @returns {Promise<{address: string, token: string}>}
 */
export async function create() {
  try {
    const res = await fetch(`${BASE_URL}/email/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!res.ok) {
      throw new Error(`创建邮箱失败: ${res.status}`);
    }
    
    const data = await res.json();
    console.log(`[TempMail] 创建邮箱: ${data.email}`);
    
    return {
      address: data.email,
      token: data.token
    };
  } catch (e) {
    console.error('[TempMail] 创建失败:', e.message);
    throw e;
  }
}

/**
 * 获取邮件列表
 * @param {string} email - 邮箱地址
 * @param {string} token - 邮箱 token
 * @returns {Promise<Array>}
 */
export async function getMessages(email, token) {
  try {
    const res = await fetch(`${BASE_URL}/email/${email}/messages`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      throw new Error(`获取邮件失败: ${res.status}`);
    }
    
    return await res.json();
  } catch (e) {
    console.error('[TempMail] 获取邮件失败:', e.message);
    return [];
  }
}

/**
 * 获取最新邮件
 * @param {string} email
 * @param {string} token
 */
export async function getLatest(email, token) {
  const messages = await getMessages(email, token);
  return messages.length > 0 ? messages[messages.length - 1] : null;
}

/**
 * 等待包含特定关键词的邮件
 * @param {string} email
 * @param {string} token
 * @param {string} keyword - 关键词（如 "verification", "confirm"）
 * @param {number} timeout - 超时时间（毫秒）
 */
export async function waitFor(email, token, keyword = '', timeout = 60000) {
  const start = Date.now();
  const checkInterval = 3000;
  
  while (Date.now() - start < timeout) {
    const messages = await getMessages(email, token);
    
    for (const msg of messages) {
      const subject = (msg.subject || '').toLowerCase();
      const body = (msg.body_text || '').toLowerCase();
      const search = keyword.toLowerCase();
      
      if (!keyword || subject.includes(search) || body.includes(search)) {
        console.log(`[TempMail] 找到邮件: ${msg.subject}`);
        return msg;
      }
    }
    
    await new Promise(r => setTimeout(r, checkInterval));
  }
  
  throw new Error('等待邮件超时');
}

/**
 * 从邮件中提取验证码
 * @param {object} message - 邮件对象
 * @returns {string|null}
 */
export function extractCode(message) {
  if (!message || !message.body_text) return null;
  
  const text = message.body_text;
  
  // 常见验证码格式
  const patterns = [
    /验证码[：:]\s*(\d{4,6})/,
    /code[：:]\s*(\d{4,6})/i,
    /(\d{6})/,  // 6位数字
    /(\d{4})/,  // 4位数字
    /token[：:]\s*([a-zA-Z0-9]{8,})/i,
    /([a-zA-Z0-9]{20,})/  // 长字符串
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      console.log(`[TempMail] 提取到验证码: ${match[1]}`);
      return match[1];
    }
  }
  
  return null;
}

/**
 * 从邮件中提取链接
 * @param {object} message
 * @returns {string|null}
 */
export function extractLink(message) {
  if (!message || !message.body_text) return null;
  
  const text = message.body_text;
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  const matches = text.match(urlPattern);
  
  if (matches && matches.length > 0) {
    console.log(`[TempMail] 提取到链接: ${matches[0]}`);
    return matches[0];
  }
  
  return null;
}

/**
 * 完整流程：创建邮箱 -> 等待邮件 -> 提取验证码
 * @param {string} keyword - 关键词
 * @param {number} timeout - 超时
 */
export async function createAndWait(keyword = '', timeout = 60000) {
  // 创建邮箱
  const { address, token } = await create();
  
  console.log(`[TempMail] 等待邮件 (关键词: ${keyword || '任意'})...`);
  
  // 等待邮件
  const message = await waitFor(address, token, keyword, timeout);
  
  // 提取验证码和链接
  const code = extractCode(message);
  const link = extractLink(message);
  
  return {
    address,
    token,
    message,
    code,
    link
  };
}

// 默认导出
export default {
  create,
  getMessages,
  getLatest,
  waitFor,
  extractCode,
  extractLink,
  createAndWait
};
