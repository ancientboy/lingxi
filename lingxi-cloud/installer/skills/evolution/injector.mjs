/**
 * 基因注入模块
 * @module skills/evolution/injector
 * 
 * 职责：将基因注入到 Agent 的 System Prompt
 */

import { listGenes, incrementUsageCount } from './storage.mjs';

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
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from'
  ]);
  
  // 分词
  const words = text
    .toLowerCase()
    .split(/[\s\-_,.!?;:'"()（）【】「」《》，。！？、；：]+/)
    .filter(word => word.length >= 2 && !stopWords.has(word));
  
  return [...new Set(words)];
}

/**
 * 加载所有基因
 * @returns {Promise<Gene[]>}
 */
export async function loadAllGenes() {
  return await listGenes();
}

/**
 * 构建基因部分的 System Prompt
 * @param {string} agentId - Agent ID
 * @param {Object} options - 选项
 * @returns {Promise<string>} - 基因 prompt
 */
export async function buildGenePrompt(agentId, options = {}) {
  const {
    maxGenes = 10,      // 最大基因数量
    minScore = 3,       // 最低评分
    categories = null   // 限制分类（null 表示不限制）
  } = options;
  
  // 1. 加载所有基因
  const genes = await loadAllGenes();
  
  if (genes.length === 0) {
    return '';
  }
  
  // 2. 过滤基因
  let relevantGenes = genes.filter(gene => {
    // 评分过滤
    const score = gene.metadata?.score || 0;
    if (score < minScore) return false;
    
    // 分类过滤
    if (categories && !categories.includes(gene.category)) {
      return false;
    }
    
    // 角色匹配
    const roles = gene.metadata?.roles || [];
    if (roles.length === 0) return true;  // 没有角色限制，适用于所有
    if (roles.includes('all')) return true;
    if (agentId && roles.includes(agentId)) return true;
    
    return false;
  });
  
  if (relevantGenes.length === 0) {
    return '';
  }
  
  // 3. 按评分排序
  relevantGenes.sort((a, b) => {
    const scoreA = a.metadata?.score || 0;
    const scoreB = b.metadata?.score || 0;
    return scoreB - scoreA;
  });
  
  // 4. 取 Top N
  const topGenes = relevantGenes.slice(0, maxGenes);
  
  // 5. 构建分类映射（按分类组织）
  const byCategory = {};
  for (const gene of topGenes) {
    const cat = gene.category;
    if (!byCategory[cat]) {
      byCategory[cat] = [];
    }
    byCategory[cat].push(gene);
  }
  
  // 6. 构建 prompt
  const categoryNames = {
    debug: '调试',
    coding: '编程',
    writing: '写作',
    analysis: '分析',
    planning: '规划',
    tool: '工具使用'
  };
  
  const sections = [];
  
  for (const [category, categoryGenes] of Object.entries(byCategory)) {
    const geneTexts = categoryGenes.map(gene => {
      const tips = gene.strategy.tips?.length > 0
        ? `\n   💡 提示：${gene.strategy.tips.join('、')}`
        : '';
      
      const steps = gene.strategy.steps
        .map(s => `      ${s}`)
        .join('\n');
      
      const score = gene.metadata?.score || 0;
      const scoreEmoji = score >= 4.5 ? '⭐' : score >= 4 ? '✨' : '';
      
      return `   【${gene.name}】${scoreEmoji}
      触发：${gene.trigger}
      策略：${gene.strategy.description}
      步骤：
${steps}${tips}`;
    });
    
    sections.push(`### ${categoryNames[category] || category}\n\n${geneTexts.join('\n\n')}`);
  }
  
  return `
## 🧬 已习得的能力

以下策略经过验证，遇到匹配场景时优先使用：

${sections.join('\n\n')}

> 💡 这些能力来自经验积累。完成任务后，如果你发现"这个经验下次还能用"，可以调用 recordIfWorthy 记录下来。
`;
}

/**
 * 运行时检索相关基因
 * @param {string} taskDescription - 当前任务描述
 * @param {string} agentId - Agent ID
 * @param {Object} options - 选项
 * @returns {Promise<Gene[]>} - 相关基因
 */
export async function findRelevantGenes(taskDescription, agentId, options = {}) {
  const {
    maxResults = 3,      // 最大返回数量
    minScore = 3,        // 最低评分
    threshold = 0.2      // 相关度阈值
  } = options;
  
  // 1. 加载所有基因
  const genes = await loadAllGenes();
  
  // 2. 提取任务关键词
  const taskKeywords = extractKeywords(taskDescription);
  
  if (taskKeywords.length === 0) {
    return [];
  }
  
  // 3. 计算每个基因的相关度
  const scored = [];
  
  for (const gene of genes) {
    // 评分过滤
    const score = gene.metadata?.score || 0;
    if (score < minScore) continue;
    
    // 角色匹配
    const roles = gene.metadata?.roles || [];
    if (roles.length > 0 && !roles.includes('all')) {
      if (agentId && !roles.includes(agentId)) continue;
    }
    
    // 计算关键词匹配度
    const triggerKeywords = extractKeywords(gene.trigger);
    const strategyKeywords = extractKeywords(gene.strategy?.description || '');
    
    // 匹配任务关键词
    const triggerMatches = taskKeywords.filter(k => triggerKeywords.includes(k));
    const strategyMatches = taskKeywords.filter(k => strategyKeywords.includes(k));
    
    // 加权匹配度
    const relevance = (
      (triggerMatches.length * 2 + strategyMatches.length) /
      (taskKeywords.length + triggerKeywords.length)
    );
    
    if (relevance >= threshold) {
      scored.push({
        gene,
        relevance,
        triggerMatches,
        strategyMatches
      });
    }
  }
  
  // 4. 排序：先按相关度，再按评分
  scored.sort((a, b) => {
    if (Math.abs(a.relevance - b.relevance) > 0.1) {
      return b.relevance - a.relevance;
    }
    const scoreA = a.gene.metadata?.score || 0;
    const scoreB = b.gene.metadata?.score || 0;
    return scoreB - scoreA;
  });
  
  // 5. 返回 Top N
  const result = scored.slice(0, maxResults).map(item => {
    // 记录使用
    incrementUsageCount(item.gene.id).catch(() => {});
    return item.gene;
  });
  
  return result;
}

/**
 * 获取特定分类的基因
 * @param {GeneCategory} category
 * @param {Object} options
 * @returns {Promise<Gene[]>}
 */
export async function getGenesByCategory(category, options = {}) {
  const { minScore = 0, maxResults = 20 } = options;
  
  const genes = await listGenes({ category });
  
  return genes
    .filter(g => (g.metadata?.score || 0) >= minScore)
    .sort((a, b) => (b.metadata?.score || 0) - (a.metadata?.score || 0))
    .slice(0, maxResults);
}

/**
 * 获取基因统计信息
 * @returns {Promise<Object>}
 */
export async function getGeneStats() {
  const genes = await loadAllGenes();
  
  const stats = {
    total: genes.length,
    byCategory: {},
    bySource: {
      platform: 0,
      user: 0
    },
    avgScore: 0,
    topGenes: []
  };
  
  let totalScore = 0;
  
  for (const gene of genes) {
    // 按分类统计
    const cat = gene.category;
    stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
    
    // 按来源统计
    const author = gene.metadata?.author || 'user';
    stats.bySource[author] = (stats.bySource[author] || 0) + 1;
    
    // 累计评分
    totalScore += gene.metadata?.score || 0;
  }
  
  // 平均评分
  stats.avgScore = genes.length > 0 
    ? (totalScore / genes.length).toFixed(2) 
    : 0;
  
  // Top 基因
  stats.topGenes = genes
    .sort((a, b) => (b.metadata?.score || 0) - (a.metadata?.score || 0))
    .slice(0, 5)
    .map(g => ({
      id: g.id,
      name: g.name,
      score: g.metadata?.score || 0,
      category: g.category
    }));
  
  return stats;
}

/**
 * 构建简洁的基因提示（用于 token 敏感场景）
 * @param {string} agentId
 * @param {Object} options
 * @returns {Promise<string>}
 */
export async function buildCompactGenePrompt(agentId, options = {}) {
  const { maxGenes = 5 } = options;
  
  const genes = await loadAllGenes();
  
  // 过滤和排序
  const relevant = genes
    .filter(g => {
      const roles = g.metadata?.roles || [];
      return roles.length === 0 || 
             roles.includes('all') || 
             (agentId && roles.includes(agentId));
    })
    .sort((a, b) => (b.metadata?.score || 0) - (a.metadata?.score || 0))
    .slice(0, maxGenes);
  
  if (relevant.length === 0) return '';
  
  const items = relevant.map(g => 
    `• ${g.name}：${g.strategy.description}`
  );
  
  return `\n## 🧬 关键经验\n${items.join('\n')}\n`;
}

export default {
  buildGenePrompt,
  findRelevantGenes,
  getGenesByCategory,
  getGeneStats,
  buildCompactGenePrompt,
  loadAllGenes
};
