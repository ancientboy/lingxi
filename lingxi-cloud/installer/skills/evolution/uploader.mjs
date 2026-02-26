/**
 * 基因上报模块
 * @module skills/evolution/uploader
 * 
 * 心跳时上报待上传的基因到平台
 */

import { getPendingGenes, markAsUploaded, isUploadEnabled } from './storage.mjs';

/**
 * 上报待上传的基因
 * @param {EvolutionConfig} config - 配置信息
 * @returns {Promise<UploadResult>}
 */
export async function uploadPendingGenes(config = {}) {
  const result = {
    uploaded: 0,
    failed: 0,
    error: null,
    details: []
  };

  try {
    // 检查是否启用上报
    const uploadEnabled = await isUploadEnabled();
    if (!uploadEnabled) {
      result.error = 'Upload disabled';
      return result;
    }

    // 获取待上传基因
    const pendingGenes = await getPendingGenes();
    if (pendingGenes.length === 0) {
      return result;
    }

    // 如果没有配置 API，返回待上传数量
    if (!config.platformApiUrl || !config.userToken) {
      result.pendingCount = pendingGenes.length;
      result.error = 'Platform API not configured';
      return result;
    }

    // 批量上报基因
    const uploadData = {
      instance_id: config.instanceId,
      user_id: config.userId,
      genes: pendingGenes.map(gene => ({
        id: gene.id,
        version: gene.version,
        name: gene.name,
        category: gene.category,
        trigger: gene.trigger,
        strategy: gene.strategy,
        capsules: gene.capsules || {},
        metadata: {
          ...gene.metadata,
          scope: gene.metadata?.scope || 'private'
        }
      }))
    };

    const response = await fetch(`${config.platformApiUrl}/api/genes/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.userToken}`
      },
      body: JSON.stringify(uploadData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      result.error = `Upload failed: ${response.status} ${errorText}`;
      return result;
    }

    const responseData = await response.json();
    
    // 处理结果
    if (responseData.success) {
      const uploadedIds = pendingGenes.map(g => g.id);
      await markAsUploaded(uploadedIds);
      result.uploaded = uploadedIds.length;
      result.details = responseData.details || [];
    } else {
      result.error = responseData.error || 'Upload failed';
      result.failed = pendingGenes.length;
    }

  } catch (error) {
    result.error = error.message;
    console.error('基因上报失败:', error);
  }

  return result;
}

/**
 * 上报单个基因
 * @param {Gene} gene - 要上报的基因
 * @param {EvolutionConfig} config - 配置信息
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function uploadSingleGene(gene, config = {}) {
  try {
    if (!config.platformApiUrl || !config.userToken) {
      return { success: false, error: 'Platform API not configured' };
    }

    const response = await fetch(`${config.platformApiUrl}/api/genes/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.userToken}`
      },
      body: JSON.stringify({
        instance_id: config.instanceId,
        user_id: config.userId,
        genes: [{
          id: gene.id,
          version: gene.version,
          name: gene.name,
          category: gene.category,
          trigger: gene.trigger,
          strategy: gene.strategy,
          capsules: gene.capsules || {},
          metadata: gene.metadata
        }]
      })
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: data.success, error: data.error };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  uploadPendingGenes,
  uploadSingleGene
};
