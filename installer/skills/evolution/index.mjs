/**
 * 进化模块入口
 * @module skills/evolution
 * 
 * 提供基因系统的公共 API
 */

// === 内部导入（用于本模块的函数实现）===
import { 
  getPendingGenes,
  listGenes,
  isUploadEnabled,
  getLastSyncTime
} from './storage.mjs';

import { recordIfWorthy, recordManual } from './recorder.mjs';
import {
  buildGenePrompt,
  findRelevantGenes,
  getGenesByCategory,
  getGeneStats,
  buildCompactGenePrompt,
  loadAllGenes
} from './injector.mjs';
import {
  evaluateGene,
  extractName,
  extractSteps,
  inferCategory,
  summarize
} from './evaluator.mjs';
import {
  saveGene,
  loadGene,
  deleteLocalGene,
  markForUpload,
  markAsUploaded,
  setLastSyncTime,
  setUploadEnabled
} from './storage.mjs';
import { uploadPendingGenes as doUploadPendingGenes } from './uploader.mjs';
import { syncPlatformGenes as doSyncPlatformGenes } from './downloader.mjs';
import {
  pushGenesToUsers,
  pushGeneToUser,
  pushGeneToInstance,
  getPushHistory
} from './pusher.mjs';

// === 公共导出 ===

// 从 recorder 导出
export { recordIfWorthy, recordManual };

// 从 injector 导出
export {
  buildGenePrompt,
  findRelevantGenes,
  getGenesByCategory,
  getGeneStats,
  buildCompactGenePrompt,
  loadAllGenes
};

// 从 evaluator 导出
export {
  evaluateGene,
  extractName,
  extractSteps,
  inferCategory,
  summarize
};

// 从 storage 导出
export {
  saveGene,
  loadGene,
  listGenes,
  deleteLocalGene,
  markForUpload,
  getPendingGenes,
  markAsUploaded,
  getLastSyncTime,
  setLastSyncTime,
  isUploadEnabled,
  setUploadEnabled
};

// 从 pusher 导出
export {
  pushGenesToUsers,
  pushGeneToUser,
  pushGeneToInstance,
  getPushHistory
};

/**
 * 心跳时调用的同步函数
 * 
 * 功能：
 * 1. 从平台同步优质基因
 * 2. 上报本地产生的基因
 * 
 * @param {EvolutionConfig} config - 配置信息
 * @returns {Promise<{synced: number, uploaded: number, error?: string}>}
 */
export async function runHeartbeatSync(config = {}) {
  const result = {
    synced: 0,
    uploaded: 0,
    error: null
  };

  try {
    // 1. 从平台同步基因
    const syncResult = await doSyncPlatformGenes(config);
    result.synced = syncResult.synced || 0;
    result.syncDetails = {
      added: syncResult.added || 0,
      updated: syncResult.updated || 0,
      deleted: syncResult.deleted || 0
    };
    
    // 2. 上报待上传的基因
    const uploadResult = await doUploadPendingGenes(config);
    result.uploaded = uploadResult.uploaded || 0;
    result.pendingCount = uploadResult.pendingCount || 0;
    
    // 合并错误
    if (syncResult.error || uploadResult.error) {
      result.error = [syncResult.error, uploadResult.error].filter(Boolean).join('; ');
    }
    
  } catch (error) {
    result.error = error.message;
    console.error('基因同步失败:', error);
  }

  return result;
}

/**
 * 同步平台基因
 * @param {EvolutionConfig} config - 配置信息
 * @returns {Promise<SyncResult>}
 */
export async function syncPlatformGenes(config = {}) {
  return await doSyncPlatformGenes(config);
}

/**
 * 上报待上传基因
 * @param {EvolutionConfig} config - 配置信息
 * @returns {Promise<UploadResult>}
 */
export async function uploadPendingGenes(config = {}) {
  return await doUploadPendingGenes(config);
}

/**
 * 快速检查进化模块状态
 * @returns {Promise<Object>}
 */
export async function getStatus() {
  try {
    const genes = await listGenes();
    const pending = await getPendingGenes();
    const uploadEnabled = await isUploadEnabled();
    const lastSync = await getLastSyncTime();
    
    return {
      status: 'ok',
      geneCount: genes.length,
      pendingUpload: pending.length,
      uploadEnabled,
      lastSync: lastSync > 0 ? new Date(lastSync).toISOString() : null
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
}

export default {
  // 记录
  recordIfWorthy,
  recordManual,
  
  // 注入
  buildGenePrompt,
  findRelevantGenes,
  getGenesByCategory,
  getGeneStats,
  buildCompactGenePrompt,
  loadAllGenes,
  
  // 评估
  evaluateGene,
  extractName,
  extractSteps,
  inferCategory,
  summarize,
  
  // 存储
  saveGene,
  loadGene,
  listGenes,
  deleteLocalGene,
  markForUpload,
  getPendingGenes,
  markAsUploaded,
  getLastSyncTime,
  setLastSyncTime,
  isUploadEnabled,
  setUploadEnabled,
  
  // 同步
  runHeartbeatSync,
  syncPlatformGenes,
  uploadPendingGenes,
  getStatus,
  
  // 推送
  pushGenesToUsers,
  pushGeneToUser,
  pushGeneToInstance,
  getPushHistory
};
