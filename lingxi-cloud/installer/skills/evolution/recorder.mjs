/**
 * 基因记录模块
 * @module skills/evolution/recorder
 * 
 * 职责：任务完成后评估是否值得记录，并保存到本地
 */

import {
  evaluateGene,
  extractName,
  extractSteps,
  inferCategory,
  summarize
} from './evaluator.mjs';
import {
  saveLocalGene,
  markForUpload,
  isUploadEnabled,
  loadGene,
  listGenes
} from './storage.mjs';

/**
 * 生成唯一基因ID
 * @param {string} category
 * @param {string} name
 * @returns {string}
 */
function generateGeneId(category, name) {
  // 将名称转为 URL 友好的格式
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
  
  // 添加时间戳确保唯一性
  const timestamp = Date.now().toString(36);
  
  return `gene-${category}-${slug}-${timestamp}`;
}

/**
 * 计算与现有基因的相似度
 * @param {Gene} newGene
 * @param {Gene[]} existingGenes
 * @returns {number} 0-1 的相似度分数
 */
function calculateSimilarity(newGene, existingGenes) {
  let maxSimilarity = 0;
  
  for (const existing of existingGenes) {
    // 名称相似度
    const nameSimilarity = calculateTextSimilarity(newGene.name, existing.name);
    
    // 触发条件相似度
    const triggerSimilarity = calculateTextSimilarity(
      newGene.trigger,
      existing.trigger
    );
    
    // 策略相似度
    const strategySimilarity = calculateTextSimilarity(
      newGene.strategy?.description || '',
      existing.strategy?.description || ''
    );
    
    // 综合相似度（加权平均）
    const similarity = (
      nameSimilarity * 0.3 +
      triggerSimilarity * 0.4 +
      strategySimilarity * 0.3
    );
    
    maxSimilarity = Math.max(maxSimilarity, similarity);
  }
  
  return maxSimilarity;
}

/**
 * 计算文本相似度（简单的词频比较）
 * @param {string} text1
 * @param {string} text2
 * @returns {number}
 */
function calculateTextSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;
  
  // 分词（简单按空格和中文字符分割）
  const words1 = new Set(tokenize(text1));
  const words2 = new Set(tokenize(text2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  // Jaccard 相似度
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * 文本分词
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  // 转小写
  text = text.toLowerCase();
  
  // 分词：按空格、标点、中文字符边界分割
  return text
    .split(/[\s\-_,.!?;:'"()（）【】「」《》，。！？、；：]+/)
    .filter(word => word.length > 0);
}

/**
 * 记录基因（如果值得）
 * @param {Object} task - 任务信息
 * @param {Object} solution - 解决方案
 * @param {Object} context - 上下文（agentId, userId 等）
 * @returns {Promise<{gene: Gene | null, evaluation: GeneEvaluation, message: string}>}
 */
export async function recordIfWorthy(task, solution, context = {}) {
  // 1. 评估是否值得记录
  const evaluation = evaluateGene(task, solution);
  
  // 评分低于 3 分不记录
  if (evaluation.score < 3) {
    return {
      gene: null,
      evaluation,
      message: `评分 ${evaluation.score}/5，不值得记录（需 ≥3 分）`
    };
  }
  
  // 2. 构建基因
  const category = inferCategory(task);
  const name = extractName(solution);
  
  const gene = {
    id: generateGeneId(category, name),
    version: '1.0.0',
    name,
    category,
    trigger: task.description || task.title || '未知任务',
    strategy: {
      description: summarize(solution),
      steps: extractSteps(solution),
      tips: solution.tips || []
    },
    metadata: {
      author: 'user',
      user_id: context.userId,
      agent_id: context.agentId,
      roles: context.agentId ? [context.agentId] : [],
      tags: extractTags(task, solution),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      score: evaluation.score,
      usage_count: 1
    }
  };
  
  // 添加环境适配（如果有）
  if (solution.capsules) {
    gene.capsules = solution.capsules;
  }
  
  // 3. 检查与现有基因的相似度
  const existingGenes = await listGenes({ category });
  const similarity = calculateSimilarity(gene, existingGenes);
  
  if (similarity > 0.85) {
    return {
      gene: null,
      evaluation,
      message: `与现有基因相似度过高 (${(similarity * 100).toFixed(0)}%)，跳过记录`
    };
  }
  
  // 相似度较高时降低评分，但仍记录
  if (similarity > 0.6) {
    gene.metadata.score = Math.max(3, evaluation.score - 1);
    gene.metadata.similarity_warning = similarity;
  }
  
  // 4. 保存到本地
  try {
    await saveLocalGene(gene);
  } catch (error) {
    console.error('保存基因失败:', error);
    return {
      gene: null,
      evaluation,
      message: `保存失败: ${error.message}`
    };
  }
  
  // 5. 标记为待上报（如果用户允许）
  const uploadEnabled = await isUploadEnabled();
  if (uploadEnabled && context.userId) {
    try {
      await markForUpload(gene.id);
    } catch (error) {
      console.error('标记基因待上报失败:', error);
      // 不影响主流程
    }
  }
  
  return {
    gene,
    evaluation,
    message: `基因 "${name}" 已记录 (评分: ${evaluation.score}/5, 分类: ${category})`
  };
}

/**
 * 从任务和解决方案中提取标签
 * @param {Object} task
 * @param {Object} solution
 * @returns {string[]}
 */
function extractTags(task, solution) {
  const tags = new Set();
  
  // 从任务类型提取
  if (task.type) {
    tags.add(task.type.toLowerCase());
  }
  
  // 从任务描述提取关键词
  const taskKeywords = extractKeywords(task.description || '');
  taskKeywords.forEach(k => tags.add(k));
  
  // 从解决方案提取关键词
  if (solution.tags) {
    solution.tags.forEach(t => tags.add(t));
  }
  
  // 从工具列表提取
  if (solution.tools) {
    solution.tools.forEach(t => {
      if (typeof t === 'string') {
        tags.add(t.toLowerCase());
      } else if (t.name) {
        tags.add(t.name.toLowerCase());
      }
    });
  }
  
  // 限制标签数量
  return Array.from(tags).slice(0, 10);
}

/**
 * 从文本中提取关键词
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
  if (!text) return [];
  
  // 停用词
  const stopWords = new Set([
    '的', '了', '是', '在', '有', '和', '与', '或', '但', '这', '那',
    '我', '你', '他', '她', '它', '我们', '你们', '他们',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'can', 'could', 'should', 'may', 'might', 'must',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'between', 'under', 'again', 'further',
    'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
    'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
    'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until',
    'while', 'about', 'against', 'any'
  ]);
  
  const words = tokenize(text);
  
  // 过滤停用词和短词
  return words.filter(word => {
    return word.length >= 2 && !stopWords.has(word);
  });
}

/**
 * 手动记录基因（跳过评估）
 * @param {Object} geneData - 基因数据
 * @param {Object} context - 上下文
 * @returns {Promise<Gene>}
 */
export async function recordManual(geneData, context = {}) {
  const category = geneData.category || 'coding';
  
  const gene = {
    id: geneData.id || generateGeneId(category, geneData.name),
    version: geneData.version || '1.0.0',
    name: geneData.name,
    category,
    trigger: geneData.trigger,
    strategy: {
      description: geneData.description || '',
      steps: geneData.steps || [],
      tips: geneData.tips || []
    },
    metadata: {
      author: 'user',
      user_id: context.userId,
      agent_id: context.agentId,
      roles: geneData.roles || (context.agentId ? [context.agentId] : []),
      tags: geneData.tags || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      score: geneData.score || 4,
      usage_count: 0
    }
  };
  
  // 添加环境适配
  if (geneData.capsules) {
    gene.capsules = geneData.capsules;
  }
  
  await saveLocalGene(gene);
  
  // 如果指定了上报
  if (geneData.upload && await isUploadEnabled()) {
    await markForUpload(gene.id);
  }
  
  return gene;
}

export default {
  recordIfWorthy,
  recordManual
};
