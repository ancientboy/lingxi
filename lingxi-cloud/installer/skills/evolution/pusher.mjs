/**
 * 基因推送模块
 * @module skills/evolution/pusher
 * 
 * 功能：
 * - pushGenesToUsers(geneIds) - 推送基因给所有在线用户
 * - pushGeneToUser(userId, geneIds) - 推送基因给指定用户
 */

import { loadAllGenes, listGenes } from './storage.mjs';

/**
 * 默认的灵犀云配置
 */
const DEFAULT_CONFIG = {
  apiUrl: process.env.LINGXI_CLOUD_URL || 'http://localhost:3000',
  apiToken: process.env.LINGXI_CLOUD_TOKEN || ''
};

/**
 * 推送基因给所有在线用户
 * 
 * @param {string[]} geneIds - 要推送的基因ID列表
 * @param {Object} options - 可选配置
 * @param {string} options.message - 推送消息
 * @param {string} options.apiUrl - 灵犀云 API 地址
 * @param {string} options.apiToken - 灵犀云 API Token
 * @returns {Promise<{success: boolean, pushed: number, errors?: string[]}>}
 */
export async function pushGenesToUsers(geneIds, options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...options
  };
  
  if (!geneIds || geneIds.length === 0) {
    return {
      success: false,
      pushed: 0,
      error: '请提供要推送的基因ID列表'
    };
  }
  
  if (!config.apiToken) {
    return {
      success: false,
      pushed: 0,
      error: '未配置灵犀云 API Token'
    };
  }
  
  try {
    const response = await fetch(`${config.apiUrl}/api/genes/admin/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiToken}`
      },
      body: JSON.stringify({
        geneIds,
        message: options.message || `平台推送了 ${geneIds.length} 个新基因`
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        pushed: 0,
        error: result.error || `HTTP ${response.status}`
      };
    }
    
    return {
      success: true,
      pushed: result.pushed || 0,
      genes: result.genes,
      results: result.results,
      errors: result.errors
    };
    
  } catch (error) {
    console.error('推送基因失败:', error);
    return {
      success: false,
      pushed: 0,
      error: error.message
    };
  }
}

/**
 * 推送基因给指定用户
 * 
 * @param {string} userId - 目标用户ID
 * @param {string[]} geneIds - 要推送的基因ID列表
 * @param {Object} options - 可选配置
 * @param {string} options.message - 推送消息
 * @param {string} options.apiUrl - 灵犀云 API 地址
 * @param {string} options.apiToken - 灵犀云 API Token
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function pushGeneToUser(userId, geneIds, options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...options
  };
  
  if (!userId) {
    return {
      success: false,
      error: '请提供用户ID'
    };
  }
  
  if (!geneIds || geneIds.length === 0) {
    return {
      success: false,
      error: '请提供要推送的基因ID列表'
    };
  }
  
  if (!config.apiToken) {
    return {
      success: false,
      error: '未配置灵犀云 API Token'
    };
  }
  
  try {
    const response = await fetch(`${config.apiUrl}/api/genes/admin/push/${userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiToken}`
      },
      body: JSON.stringify({
        geneIds,
        message: options.message || `平台推送了 ${geneIds.length} 个新基因`
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: result.error || `HTTP ${response.status}`
      };
    }
    
    return {
      success: true,
      userId: result.userId,
      serverId: result.serverId,
      genes: result.genes
    };
    
  } catch (error) {
    console.error('推送基因给用户失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 直接推送基因到实例（通过 sessions_send）
 * 
 * 这个函数用于从实例端直接推送基因到另一个实例，
 * 而不经过灵犀云后端。
 * 
 * @param {Object} targetInstance - 目标实例信息
 * @param {string} targetInstance.ip - 目标实例 IP
 * @param {number} targetInstance.port - 目标实例端口
 * @param {string} targetInstance.token - 目标实例 Token
 * @param {string} targetInstance.session - 目标实例 Session
 * @param {string[]} geneIds - 要推送的基因ID列表
 * @param {Object} options - 可选配置
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function pushGeneToInstance(targetInstance, geneIds, options = {}) {
  const { ip, port, token, session } = targetInstance;
  
  if (!ip || !port || !token || !session) {
    return {
      success: false,
      error: '目标实例信息不完整'
    };
  }
  
  if (!geneIds || geneIds.length === 0) {
    return {
      success: false,
      error: '请提供要推送的基因ID列表'
    };
  }
  
  try {
    // 从本地加载基因数据
    const allGenes = await listGenes();
    const genesToPush = allGenes.filter(g => geneIds.includes(g.id));
    
    if (genesToPush.length === 0) {
      return {
        success: false,
        error: '未找到指定的基因'
      };
    }
    
    const gatewayUrl = `http://${ip}:${port}`;
    
    // 构建推送消息
    const pushMessage = {
      type: 'gene_push',
      data: {
        genes: genesToPush,
        message: options.message || `收到 ${genesToPush.length} 个基因推送`,
        pushedAt: new Date().toISOString(),
        source: 'instance'
      }
    };
    
    // 通过 sessions_send 发送
    const response = await fetch(`${gatewayUrl}/${session}/api/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        type: 'gene_push',
        payload: pushMessage
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `推送失败: ${response.status} ${error}`
      };
    }
    
    return {
      success: true,
      geneCount: genesToPush.length,
      geneNames: genesToPush.map(g => g.name)
    };
    
  } catch (error) {
    console.error('直接推送基因失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 获取推送历史
 * 
 * @param {Object} options - 可选配置
 * @returns {Promise<{success: boolean, history?: Array, error?: string}>}
 */
export async function getPushHistory(options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...options
  };
  
  if (!config.apiToken) {
    return {
      success: false,
      error: '未配置灵犀云 API Token'
    };
  }
  
  try {
    const response = await fetch(`${config.apiUrl}/api/genes/admin/push/history`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`
      }
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: result.error || `HTTP ${response.status}`
      };
    }
    
    return {
      success: true,
      total: result.total,
      history: result.history
    };
    
  } catch (error) {
    console.error('获取推送历史失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  pushGenesToUsers,
  pushGeneToUser,
  pushGeneToInstance,
  getPushHistory
};
