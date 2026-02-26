/**
 * Skill-Analyzer - 智能技能分析器
 * 
 * 功能：
 * - 分析新技能的特点
 * - 匹配现有agent
 * - 推荐分配方案
 * - 建议创建新agent
 */

import fs from 'fs';
import path from 'path';

// Agent匹配规则
const AGENT_PROFILES = {
  coder: {
    name: '云溪',
    categories: ['development', 'automation'],
    keywords: ['代码', 'bug', '重构', '性能', 'API', 'SQL', '前端', '后端', '编程', '调试'],
    tags: ['code', 'development', 'programming']
  },
  ops: {
    name: '若曦',
    categories: ['data', 'automation', 'communication'],
    keywords: ['数据', '分析', '增长', '运营', '转化', '留存', '学习', '规划', '报表'],
    tags: ['data', 'analytics', 'marketing']
  },
  inventor: {
    name: '紫萱',
    categories: ['creative'],
    keywords: ['创意', '想法', 'brainstorm', '创新', '设计', '艺术', '从零开始'],
    tags: ['creative', 'design', 'innovation']
  },
  pm: {
    name: '梓萱',
    categories: ['product', 'creative'],
    keywords: ['产品', '需求', '用户', '体验', '功能', 'MVP', '商业', '模式'],
    tags: ['product', 'ux', 'business']
  },
  noter: {
    name: '晓琳',
    categories: ['knowledge', 'organization'],
    keywords: ['笔记', '记录', '整理', '知识', '分类', '归档', '文档'],
    tags: ['notes', 'knowledge', 'documentation']
  },
  media: {
    name: '音韵',
    categories: ['media', 'creative'],
    keywords: ['音乐', '歌曲', '播放', '氛围', '语音', '视频', '多媒体'],
    tags: ['media', 'music', 'audio', 'video']
  },
  smart: {
    name: '智家',
    categories: ['iot', 'automation'],
    keywords: ['智能', '家居', '设备', '灯光', '控制', '场景', '自动化'],
    tags: ['smart', 'home', 'iot', 'automation']
  }
};

/**
 * 分析技能目录
 * @param {string} skillPath - 技能目录路径
 * @returns {object} 分析结果
 */
export function analyzeSkill(skillPath) {
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  
  if (!fs.existsSync(skillMdPath)) {
    throw new Error('SKILL.md not found');
  }

  const content = fs.readFileSync(skillMdPath, 'utf8');
  
  // 提取基本信息
  const analysis = {
    path: skillPath,
    name: extractName(content),
    description: extractDescription(content),
    category: inferCategory(content),
    keywords: extractKeywords(content),
    tags: extractTags(content),
    complexity: inferComplexity(content)
  };

  return analysis;
}

/**
 * 匹配现有agent
 * @param {object} analysis - 技能分析结果
 * @param {array} agents - 现有agent列表
 * @returns {array} 匹配结果
 */
export function matchAgents(analysis, agents = Object.keys(AGENT_PROFILES)) {
  const matches = [];

  for (const agentId of agents) {
    const profile = AGENT_PROFILES[agentId];
    if (!profile) continue;

    const score = calculateMatchScore(analysis, profile);
    const reason = getMatchReason(analysis, profile, score);

    matches.push({
      agentId,
      agentName: profile.name,
      score,
      reason
    });
  }

  return matches.sort((a, b) => b.score - a.score);
}

/**
 * 计算匹配分数
 */
function calculateMatchScore(analysis, profile) {
  let score = 0;

  // 1. Category 匹配 (40%)
  if (profile.categories.includes(analysis.category)) {
    score += 40;
  }

  // 2. Keywords 匹配 (30%)
  const keywordMatches = analysis.keywords.filter(k => 
    profile.keywords.some(pk => pk.includes(k) || k.includes(pk))
  );
  score += (keywordMatches.length / Math.max(analysis.keywords.length, 1)) * 30;

  // 3. Tags 匹配 (20%)
  const tagMatches = analysis.tags.filter(t => 
    profile.tags.some(pt => pt === t)
  );
  score += (tagMatches.length / Math.max(analysis.tags.length, 1)) * 20;

  // 4. 语义相关 (10%)
  if (isSemanticallyRelated(analysis, profile)) {
    score += 10;
  }

  return Math.round(Math.min(score, 100));
}

/**
 * 判断是否需要创建新agent
 */
export function shouldCreateNewAgent(analysis, matches) {
  // 如果最高匹配度 < 60%，建议创建新agent
  if (matches.length === 0 || matches[0].score < 60) {
    return {
      needNewAgent: true,
      reason: '没有高匹配度的现有agent',
      bestMatch: matches[0] || null
    };
  }

  // 检查是否是新领域
  const newDomains = ['music', 'video', 'legal', 'medical', 'finance'];
  if (newDomains.includes(analysis.category)) {
    return {
      needNewAgent: true,
      reason: '新领域技能，建议创建专业agent',
      bestMatch: matches[0]
    };
  }

  return {
    needNewAgent: false,
    reason: `已有合适agent: ${matches[0].agentName}`,
    bestMatch: matches[0]
  };
}

/**
 * 建议新agent配置
 */
export function suggestNewAgent(analysis) {
  const templates = {
    music: {
      id: 'musician',
      name: '悦琳',
      emoji: '🎵',
      role: '音乐创作专家',
      personality: '艺术气质、听觉敏感、情感丰富',
      catchphrase: '音乐是灵魂的语言。'
    },
    video: {
      id: 'videographer',
      name: '影像',
      emoji: '🎬',
      role: '视频制作专家',
      personality: '视觉敏锐、故事性强、创意无限',
      catchphrase: '每一帧都是故事。'
    },
    legal: {
      id: 'lawyer',
      name: '明律',
      emoji: '⚖️',
      role: '法律顾问',
      personality: '严谨细致、逻辑清晰、专业权威',
      catchphrase: '法律是公平的基石。'
    },
    design: {
      id: 'designer',
      name: '雅琳',
      emoji: '🎨',
      role: 'UI/UX 设计专家',
      personality: '细腻敏感、审美独到、用户体验至上',
      catchphrase: '好的设计是看不见的设计。'
    }
  };

  // 根据category选择模板
  const template = templates[analysis.category] || {
    id: 'custom',
    name: '新成员',
    emoji: '✨',
    role: '专业专家',
    personality: '专业、专注、可靠',
    catchphrase: '专业创造价值。'
  };

  return {
    ...template,
    skills: [analysis.name],
    category: analysis.category,
    keywords: analysis.keywords
  };
}

// 辅助函数
function extractName(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : 'Unknown';
}

function extractDescription(content) {
  const match = content.match(/^##\s+功能\s*\n([\s\S]+?)(?=\n##|$)/m);
  return match ? match[1].trim() : '';
}

function inferCategory(content) {
  const contentLower = content.toLowerCase();
  
  if (contentLower.includes('代码') || contentLower.includes('code') || contentLower.includes('开发')) {
    return 'development';
  }
  if (contentLower.includes('数据') || contentLower.includes('data') || contentLower.includes('分析')) {
    return 'data';
  }
  if (contentLower.includes('创意') || contentLower.includes('creative') || contentLower.includes('设计')) {
    return 'creative';
  }
  if (contentLower.includes('产品') || contentLower.includes('product') || contentLower.includes('用户')) {
    return 'product';
  }
  
  return 'general';
}

function extractKeywords(content) {
  const keywords = [];
  const keywordPatterns = ['代码', '数据', '创意', '产品', '开发', '设计', '分析', '运营'];
  
  for (const keyword of keywordPatterns) {
    if (content.includes(keyword)) {
      keywords.push(keyword);
    }
  }
  
  return keywords;
}

function extractTags(content) {
  const tags = [];
  const tagPattern = /`([^`]+)`/g;
  let match;
  
  while ((match = tagPattern.exec(content)) !== null) {
    tags.push(match[1]);
  }
  
  return tags;
}

function inferComplexity(content) {
  if (content.includes('复杂') || content.includes('advanced')) {
    return 'high';
  }
  if (content.includes('简单') || content.includes('simple')) {
    return 'low';
  }
  return 'medium';
}

function getMatchReason(analysis, profile, score) {
  if (score >= 80) {
    return `${profile.name}的核心领域，完美匹配`;
  }
  if (score >= 60) {
    return `${profile.name}可以处理这类任务`;
  }
  return `与${profile.name}的匹配度较低`;
}

function isSemanticallyRelated(analysis, profile) {
  // 简单的语义关联检查
  const relatedPairs = [
    ['frontend', 'development'],
    ['backend', 'development'],
    ['ui', 'creative'],
    ['ux', 'product']
  ];
  
  return relatedPairs.some(([a, b]) => 
    (analysis.tags.includes(a) && profile.categories.includes(b)) ||
    (analysis.tags.includes(b) && profile.categories.includes(a))
  );
}

export default {
  analyzeSkill,
  matchAgents,
  shouldCreateNewAgent,
  suggestNewAgent
};
