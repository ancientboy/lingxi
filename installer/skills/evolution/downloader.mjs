/**
 * 基因同步模块
 * @module skills/evolution/downloader
 * 
 * 心跳时从平台拉取基因更新
 */

import { 
  savePlatformGene, 
  getLastSyncTime, 
  setLastSyncTime,
  getGeneIndex,
  deletePlatformGene
} from './storage.mjs';

/**
 * 从平台同步基因
 * @param {EvolutionConfig} config - 配置信息
 * @returns {Promise<SyncResult>}
 */
export async function syncPlatformGenes(config = {}) {
  const result = {
    synced: 0,
    added: 0,
    updated: 0,
    deleted: 0,
    error: null
  };

  try {
    // 如果没有配置 API，返回空结果
    if (!config.platformApiUrl) {
      result.error = 'Platform API not configured';
      return result;
    }

    const lastSync = await getLastSyncTime();
    const index = await getGeneIndex();
    
    // 构建请求参数
    const params = new URLSearchParams({
      since: lastSync.toString(),
      instance_id: config.instanceId || '',
      user_id: config.userId || ''
    });

    // 请求平台更新
    const response = await fetch(
      `${config.platformApiUrl}/api/genes/updates?${params}`,
      {
        method: 'GET',
        headers: config.userToken ? {
          'Authorization': `Bearer ${config.userToken}`
        } : {}
      }
    );

    if (!response.ok) {
      result.error = `Sync failed: ${response.status}`;
      return result;
    }

    const data = await response.json();
    
    if (!data.success) {
      result.error = data.error || 'Sync failed';
      return result;
    }

    // 处理新增/更新的基因
    if (data.genes && Array.isArray(data.genes)) {
      for (const gene of data.genes) {
        try {
          const isNew = !index.genes.platform.includes(gene.id);
          await savePlatformGene(gene);
          
          if (isNew) {
            result.added++;
          } else {
            result.updated++;
          }
          result.synced++;
        } catch (e) {
          console.error(`保存基因失败 ${gene.id}:`, e);
        }
      }
    }

    // 处理删除的基因
    if (data.deleted && Array.isArray(data.deleted)) {
      for (const geneId of data.deleted) {
        try {
          await deletePlatformGene(geneId);
          result.deleted++;
        } catch (e) {
          console.error(`删除基因失败 ${geneId}:`, e);
        }
      }
    }

    // 更新同步时间
    if (data.serverTime) {
      await setLastSyncTime(data.serverTime);
    } else {
      await setLastSyncTime(Date.now());
    }

  } catch (error) {
    result.error = error.message;
    console.error('基因同步失败:', error);
  }

  return result;
}

/**
 * 同步特定分类的基因
 * @param {string} category - 基因分类
 * @param {EvolutionConfig} config - 配置信息
 * @returns {Promise<SyncResult>}
 */
export async function syncGenesByCategory(category, config = {}) {
  const result = {
    synced: 0,
    error: null
  };

  try {
    if (!config.platformApiUrl) {
      result.error = 'Platform API not configured';
      return result;
    }

    const params = new URLSearchParams({
      category: category,
      instance_id: config.instanceId || ''
    });

    const response = await fetch(
      `${config.platformApiUrl}/api/genes/category?${params}`,
      {
        method: 'GET',
        headers: config.userToken ? {
          'Authorization': `Bearer ${config.userToken}`
        } : {}
      }
    );

    if (!response.ok) {
      result.error = `Sync failed: ${response.status}`;
      return result;
    }

    const data = await response.json();
    
    if (data.success && data.genes) {
      for (const gene of data.genes) {
        await savePlatformGene(gene);
        result.synced++;
      }
    }

  } catch (error) {
    result.error = error.message;
  }

  return result;
}

/**
 * 拉取指定基因的详情
 * @param {string} geneId - 基因ID
 * @param {EvolutionConfig} config - 配置信息
 * @returns {Promise<{gene?: Gene, error?: string}>}
 */
export async function fetchGeneDetails(geneId, config = {}) {
  try {
    if (!config.platformApiUrl) {
      return { error: 'Platform API not configured' };
    }

    const response = await fetch(
      `${config.platformApiUrl}/api/genes/${geneId}`,
      {
        method: 'GET',
        headers: config.userToken ? {
          'Authorization': `Bearer ${config.userToken}`
        } : {}
      }
    );

    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { gene: data.gene };

  } catch (error) {
    return { error: error.message };
  }
}

export default {
  syncPlatformGenes,
  syncGenesByCategory,
  fetchGeneDetails
};
