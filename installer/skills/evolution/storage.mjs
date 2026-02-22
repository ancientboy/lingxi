/**
 * 基因存储模块
 * @module skills/evolution/storage
 */

import { readFile, writeFile, mkdir, readdir, unlink, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 基因根目录
const GENES_ROOT = join(__dirname, '../../genes');
const PLATFORM_GENES_DIR = join(GENES_ROOT, 'platform');
const LOCAL_GENES_DIR = join(GENES_ROOT, 'local');
const SHARED_GENES_DIR = join(GENES_ROOT, 'shared');
const INDEX_FILE = join(GENES_ROOT, 'index.json');
const PENDING_FILE = join(GENES_ROOT, 'pending.json');

/**
 * 确保目录存在
 */
async function ensureDir(dir) {
  try {
    await mkdir(dir, { recursive: true });
  } catch (e) {
    // 忽略已存在的目录
  }
}

/**
 * 安全读取 JSON 文件
 */
async function readJsonFile(filePath, defaultValue = null) {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return defaultValue;
  }
}

/**
 * 安全写入 JSON 文件
 */
async function writeJsonFile(filePath, data) {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 获取基因索引
 * @returns {Promise<GeneIndex>}
 */
export async function getGeneIndex() {
  const defaultIndex = {
    version: '1.1.0',
    last_sync: 0,
    upload_enabled: true,
    genes: {
      platform: [],
      shared: [],
      local: []
    }
  };
  return await readJsonFile(INDEX_FILE, defaultIndex);
}

/**
 * 保存基因索引
 * @param {GeneIndex} index
 */
export async function saveGeneIndex(index) {
  await writeJsonFile(INDEX_FILE, index);
}

/**
 * 保存平台基因
 * @param {Gene} gene
 */
export async function savePlatformGene(gene) {
  const dir = join(PLATFORM_GENES_DIR, gene.category);
  const filePath = join(dir, `${gene.id}.json`);
  await writeJsonFile(filePath, gene);

  // 更新索引
  const index = await getGeneIndex();
  if (!index.genes.platform.includes(gene.id)) {
    index.genes.platform.push(gene.id);
    await saveGeneIndex(index);
  }
}

/**
 * 保存本地基因
 * @param {Gene} gene
 * @param {GeneScope} scope - 'private' | 'team' | 'platform'
 */
export async function saveLocalGene(gene, scope = 'private') {
  // 根据 scope 决定存储位置
  const baseDir = scope === 'team' ? SHARED_GENES_DIR : LOCAL_GENES_DIR;
  const dir = join(baseDir, gene.category);
  const filePath = join(dir, `${gene.id}.json`);
  
  // 确保 metadata 中包含 scope
  if (!gene.metadata) gene.metadata = {};
  gene.metadata.scope = scope;
  
  await writeJsonFile(filePath, gene);

  // 更新索引
  const index = await getGeneIndex();
  const listKey = scope === 'team' ? 'shared' : 'local';
  if (!index.genes[listKey]) {
    index.genes[listKey] = [];
  }
  if (!index.genes[listKey].includes(gene.id)) {
    index.genes[listKey].push(gene.id);
    await saveGeneIndex(index);
  }
}

/**
 * 保存基因（自动判断类型）
 * @param {Gene} gene
 * @param {'platform' | 'local'} type
 * @param {GeneScope} scope - 'private' | 'team' | 'platform'
 */
export async function saveGene(gene, type = 'local', scope = 'private') {
  if (type === 'platform') {
    await savePlatformGene(gene);
  } else {
    await saveLocalGene(gene, scope);
  }
}

/**
 * 加载基因
 * @param {string} geneId
 * @returns {Promise<Gene | null>}
 */
export async function loadGene(geneId) {
  const index = await getGeneIndex();

  // 在平台基因中查找
  if (index.genes.platform && index.genes.platform.includes(geneId)) {
    const gene = await findGeneInDir(PLATFORM_GENES_DIR, geneId);
    if (gene) return gene;
  }

  // 在共享基因中查找
  if (index.genes.shared && index.genes.shared.includes(geneId)) {
    const gene = await findGeneInDir(SHARED_GENES_DIR, geneId);
    if (gene) return gene;
  }

  // 在本地基因中查找
  if (index.genes.local && index.genes.local.includes(geneId)) {
    const gene = await findGeneInDir(LOCAL_GENES_DIR, geneId);
    if (gene) return gene;
  }

  return null;
}

/**
 * 在目录中查找基因
 * @param {string} baseDir
 * @param {string} geneId
 */
async function findGeneInDir(baseDir, geneId) {
  try {
    const categories = await readdir(baseDir);
    for (const category of categories) {
      const categoryPath = join(baseDir, category);
      const genePath = join(categoryPath, `${geneId}.json`);
      try {
        await access(genePath);
        return await readJsonFile(genePath);
      } catch (e) {
        // 继续查找
      }
    }
  } catch (e) {
    // 目录不存在
  }
  return null;
}

/**
 * 列出所有基因
 * @param {{ type?: 'platform' | 'local' | 'shared', category?: string, agentId?: string }} filter
 * @returns {Promise<Gene[]>}
 */
export async function listGenes(filter = {}) {
  const index = await getGeneIndex();
  const genes = [];

  // 收集平台基因
  if (!filter.type || filter.type === 'platform') {
    const platformGenes = await loadGenesFromDir(PLATFORM_GENES_DIR, filter.category);
    genes.push(...platformGenes);
  }

  // 收集共享基因（team scope）
  if (!filter.type || filter.type === 'shared') {
    const sharedGenes = await loadGenesFromDir(SHARED_GENES_DIR, filter.category);
    genes.push(...sharedGenes);
  }

  // 收集本地基因
  if (!filter.type || filter.type === 'local') {
    const localGenes = await loadGenesFromDir(LOCAL_GENES_DIR, filter.category);
    genes.push(...localGenes);
  }

  // 按 agentId 过滤（包含 shared + local，但不包括 platform）
  if (filter.agentId) {
    return genes.filter(gene => {
      // 平台基因对所有人可用
      if (gene.metadata?.author === 'platform') return true;
      // 共享基因（team scope）对同团队可用
      if (gene.metadata?.scope === 'team') return true;
      // 自己的基因
      if (gene.metadata?.agent_id === filter.agentId) return true;
      return false;
    });
  }

  return genes;
}

/**
 * 从目录加载基因
 */
async function loadGenesFromDir(baseDir, category = null) {
  const genes = [];
  try {
    const categories = category ? [category] : await readdir(baseDir);
    for (const cat of categories) {
      const categoryPath = join(baseDir, cat);
      try {
        const files = await readdir(categoryPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const genePath = join(categoryPath, file);
            const gene = await readJsonFile(genePath);
            if (gene) genes.push(gene);
          }
        }
      } catch (e) {
        // 忽略错误
      }
    }
  } catch (e) {
    // 目录不存在
  }
  return genes;
}

/**
 * 删除本地基因
 * @param {string} geneId
 */
export async function deleteLocalGene(geneId) {
  // 先在 local 中查找
  let gene = await findGeneInDir(LOCAL_GENES_DIR, geneId);
  let filePath = gene ? join(LOCAL_GENES_DIR, gene.category, `${geneId}.json`) : null;
  let listKey = 'local';
  
  // 如果没找到，在 shared 中查找
  if (!gene) {
    gene = await findGeneInDir(SHARED_GENES_DIR, geneId);
    filePath = gene ? join(SHARED_GENES_DIR, gene.category, `${geneId}.json`) : null;
    listKey = 'shared';
  }
  
  if (filePath) {
    await unlink(filePath);

    // 更新索引
    const index = await getGeneIndex();
    if (index.genes[listKey]) {
      index.genes[listKey] = index.genes[listKey].filter(id => id !== geneId);
      await saveGeneIndex(index);
    }
  }
}

/**
 * 删除平台基因
 * @param {string} geneId
 */
export async function deletePlatformGene(geneId) {
  const gene = await findGeneInDir(PLATFORM_GENES_DIR, geneId);
  if (gene) {
    const filePath = join(PLATFORM_GENES_DIR, gene.category, `${geneId}.json`);
    await unlink(filePath);

    // 更新索引
    const index = await getGeneIndex();
    index.genes.platform = index.genes.platform.filter(id => id !== geneId);
    await saveGeneIndex(index);
  }
}

/**
 * 标记基因为待上传
 * @param {string} geneId
 */
export async function markForUpload(geneId) {
  const pending = await getPendingUploads();
  if (!pending.find(p => p.gene_id === geneId)) {
    pending.push({
      gene_id: geneId,
      added_at: new Date().toISOString(),
      upload_attempts: 0
    });
    await writeJsonFile(PENDING_FILE, pending);
  }
}

/**
 * 获取待上传的基因列表
 * @returns {Promise<PendingUpload[]>}
 */
export async function getPendingUploads() {
  return await readJsonFile(PENDING_FILE, []);
}

/**
 * 获取待上传的基因（完整数据）
 * @returns {Promise<Gene[]>}
 */
export async function getPendingGenes() {
  const pending = await getPendingUploads();
  const genes = [];
  for (const item of pending) {
    const gene = await loadGene(item.gene_id);
    if (gene) genes.push(gene);
  }
  return genes;
}

/**
 * 标记为已上传
 * @param {string[]} geneIds
 */
export async function markAsUploaded(geneIds) {
  let pending = await getPendingUploads();
  pending = pending.filter(p => !geneIds.includes(p.gene_id));
  await writeJsonFile(PENDING_FILE, pending);
}

/**
 * 获取上次同步时间
 * @returns {Promise<number>}
 */
export async function getLastSyncTime() {
  const index = await getGeneIndex();
  return index.last_sync || 0;
}

/**
 * 设置上次同步时间
 * @param {number} timestamp
 */
export async function setLastSyncTime(timestamp) {
  const index = await getGeneIndex();
  index.last_sync = timestamp;
  await saveGeneIndex(index);
}

/**
 * 检查是否启用上报
 * @returns {Promise<boolean>}
 */
export async function isUploadEnabled() {
  const index = await getGeneIndex();
  return index.upload_enabled !== false;
}

/**
 * 设置是否启用上报
 * @param {boolean} enabled
 */
export async function setUploadEnabled(enabled) {
  const index = await getGeneIndex();
  index.upload_enabled = enabled;
  await saveGeneIndex(index);
}

/**
 * 增加基因使用次数
 * @param {string} geneId
 */
export async function incrementUsageCount(geneId) {
  const index = await getGeneIndex();
  
  // 确定基因位置
  let baseDir = null;
  let saveFunc = null;
  
  if (index.genes.platform && index.genes.platform.includes(geneId)) {
    baseDir = PLATFORM_GENES_DIR;
    saveFunc = savePlatformGene;
  } else if (index.genes.shared && index.genes.shared.includes(geneId)) {
    baseDir = SHARED_GENES_DIR;
    saveFunc = (gene) => saveLocalGene(gene, 'team');
  } else if (index.genes.local && index.genes.local.includes(geneId)) {
    baseDir = LOCAL_GENES_DIR;
    saveFunc = (gene) => saveLocalGene(gene, 'private');
  }
  
  if (baseDir) {
    const gene = await findGeneInDir(baseDir, geneId);
    if (gene) {
      if (!gene.metadata) gene.metadata = {};
      gene.metadata.usage_count = (gene.metadata.usage_count || 0) + 1;
      gene.metadata.updated_at = new Date().toISOString();
      await saveFunc(gene);
    }
  }
}

export default {
  saveGene,
  savePlatformGene,
  saveLocalGene,
  loadGene,
  listGenes,
  deleteLocalGene,
  deletePlatformGene,
  markForUpload,
  getPendingUploads,
  getPendingGenes,
  markAsUploaded,
  getGeneIndex,
  saveGeneIndex,
  getLastSyncTime,
  setLastSyncTime,
  isUploadEnabled,
  setUploadEnabled,
  incrementUsageCount
};
