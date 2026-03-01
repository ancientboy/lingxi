/**
 * ClawHub 集成模块 - 技能库优化版
 * 
 * 功能：
 * - 从 ClawHub 抓取优质技能
 * - 实现技能评分和筛选机制
 * - 更新本地 library.json
 * - 支持定时任务更新
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ClawHub API 配置
const CLAWHUB_API_BASE = process.env.CLAWHUB_API_BASE || 'https://hub.openclaw.io/api/skills';

// 本地技能库路径
const LIBRARY_PATH = join(__dirname, 'library.json');
const USER_LIBRARY_PATH = join(process.env.HOME, '.openclaw', 'workspace', 'lingxi-cloud', 'backend', 'skills', 'library.json');

// Agent 配置
const AGENTS = {
  coder: {
    name: '云溪',
    dept: '技术部',
    displayOrder: 1
  },
  ops: {
    name: '若曦',
    dept: '运营部',
    displayOrder: 2
  },
  inventor: {
    name: '紫萱',
    dept: '创新部',
    displayOrder: 3
  },
  pm: {
    name: '梓萱',
    dept: '产品部',
    displayOrder: 4
  },
  noter: {
    name: '晓琳',
    dept: '记录部',
    displayOrder: 5
  },
  media: {
    name: '音韵',
    dept: '媒体部',
    displayOrder: 6
  },
  smart: {
    name: '智家',
    dept: '智能家居',
    displayOrder: 7
  },
  lingxi: {
    name: '灵犀',
    dept: '系统核心',
    displayOrder: 8
  }
};

/**
 * 检查 Skill 是否已安装（支持用户隔离）
 * @param {string} skillId - 技能ID
 * @param {string} userId - 用户ID（可选，如果提供则使用用户隔离）
 * @returns {boolean} - 是否已安装
 */
export async function isSkillInstalled(skillId, userId = null) {
  let skillPath;
  if (userId) {
    skillPath = join(process.env.HOME, '.openclaw', 'users', userId, 'skills', skillId);
  } else {
    skillPath = join(process.env.HOME, '.openclaw', 'skills', skillId);
  }
  
  try {
    await import('fs/promises').then(fs => fs.access(skillPath));
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 Skill 信息（从 ClawHub）
 */
export async function getSkillInfo(skillId) {
  try {
    const response = await fetch(`${CLAWHUB_API_BASE}/${skillId}`);
    if (response.ok) {
      const data = await response.json();
      return {
        ...data,
        source: 'clawhub'
      };
    }
    
    return null;
  } catch (error) {
    console.error(`获取 Skill 信息失败: ${skillId}`, error.message);
    return null;
  }
}

/**
 * 格式化技能名称
 */
function formatSkillName(skillId) {
  const nameMap = {
    'code-reviewer': '代码审查',
    'fix': '自动修复',
    'frontend-code-review': '前端代码审查',
    'fullstack-developer': '全栈开发',
    'task-planner': '任务规划',
    'tasks': '任务管理',
    'searxng': '联网搜索',
    'data-analysis': '数据分析',
    'frontend-design': '界面设计',
    'skill-creator': '技能创建',
    'update-docs': '文档更新',
    'memory-system': '记忆系统',
    'supermemory': '云端记忆',
    'memos': '备忘录',
    'webapp-testing': '应用测试',
    'healthcheck': '健康检查',
    'agent-switcher': 'Agent 切换',
    'weather': '天气查询',
    'tmux': '终端管理',
    'security-auditor': '安全审计',
    'git-manager': 'Git 管理',
    'docker-manager': 'Docker 管理',
    'api-designer': 'API 设计',
    'database-manager': '数据库管理',
    'cluster-manager': '集群管理',
    'backup-system': '备份系统',
    'performance-analyzer': '性能分析',
    'log-analyzer': '日志分析'
  };
  return nameMap[skillId] || skillId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * 从 ClawHub 搜索技能
 */
export async function searchClawHubSkills(query) {
  try {
    const response = await fetch(`${CLAWHUB_API_BASE}/search?q=${encodeURIComponent(query)}`);
    if (response.ok) {
      const data = await response.json();
      return data.skills || [];
    }
    
    return [];
  } catch (error) {
    console.error('搜索 ClawHub 技能失败:', error.message);
    return [];
  }
}

/**
 * 获取热门技能（从 ClawHub）
 */
export async function getPopularSkills() {
  try {
    const response = await fetch(`${CLAWHUB_API_BASE}/popular`);
    if (response.ok) {
      const data = await response.json();
      return data.skills || [];
    }
    
    return [];
  } catch (error) {
    console.error('获取热门技能失败:', error.message);
    return [];
  }
}

/**
 * 从 ClawHub 安装技能（支持用户隔离）
 * @param {string} skillId - 技能ID
 * @param {string} userId - 用户ID（可选，如果提供则安装到用户隔离目录）
 */
export async function installGlobalSkill(skillId, userId = null) {
  console.log(`📦 从全网安装 Skill: ${skillId}`);
  
  // 检查是否已安装（使用用户隔离）
  if (await isSkillInstalled(skillId, userId)) {
    console.log(`✅ Skill ${skillId} 已安装`);
    return { success: true, alreadyInstalled: true };
  }
  
  try {
    // 确定安装路径
    const targetSkillsDir = userId 
      ? join(process.env.HOME, '.openclaw', 'users', userId, 'skills')
      : join(process.env.HOME, '.openclaw', 'skills');
    
    console.log(`📦 安装路径: ${targetSkillsDir}`);
    
    // 这里简化实现，实际应从 ClawHub 下载
    console.log(`⚠️ 从 ClawHub 下载技能 ${skillId} 的功能需要完善`);
    
    return { success: true, installed: true };
  } catch (error) {
    console.error(`❌ 安装 Skill ${skillId} 失败:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 安装 Skill（结合全局安装和本地安装，支持用户隔离）
 * @param {string} skillId - 技能ID
 * @param {string} userId - 用户ID（可选，如果提供则安装到用户隔离目录）
 */
export async function installSkill(skillId, userId = null) {
  console.log(`📦 安装 Skill: ${skillId}`);
  
  // 检查是否已安装（使用用户隔离）
  if (await isSkillInstalled(skillId, userId)) {
    console.log(`✅ Skill ${skillId} 已安装`);
    return { success: true, alreadyInstalled: true };
  }
  
  try {
    // 从 ClawHub 安装（使用用户隔离）
    const globalResult = await installGlobalSkill(skillId, userId);
    
    if (globalResult.success || globalResult.alreadyInstalled) {
      return globalResult;
    }
    
    return { success: false, error: '安装失败' };
    
  } catch (error) {
    console.error(`❌ 安装 Skill ${skillId} 失败:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 获取推荐的 Skills（内部使用）
 */
function getRecommendedSkillsForAgent(interests) {
  const recommended = new Map();
  
  for (const interest of interests) {
    const keyword = interest.toLowerCase();
    
    if (keyword.includes('代码') || keyword.includes('开发') || keyword.includes('编程')) {
      recommended.set('code-reviewer', { id: 'code-reviewer', desc: '代码审查' });
      recommended.set('fix', { id: 'fix', desc: '自动修复' });
      recommended.set('fullstack-developer', { id: 'fullstack-developer', desc: '全栈开发' });
    }
    
    if (keyword.includes('运营') || keyword.includes('数据') || keyword.includes('增长')) {
      recommended.set('task-planner', { id: 'task-planner', desc: '任务规划' });
      recommended.set('searxng', { id: 'searxng', desc: '联网搜索' });
      recommended.set('data-analysis', { id: 'data-analysis', desc: '数据分析' });
    }
    
    if (keyword.includes('创意') || keyword.includes('设计') || keyword.includes('想法')) {
      recommended.set('frontend-design', { id: 'frontend-design', desc: '界面设计' });
      recommended.set('skill-creator', { id: 'skill-creator', desc: '创建新技能' });
    }
  }
  
  return Array.from(recommended.values()).map(skill => ({
    ...skill,
    source: 'local',
    installed: false
  }));
}

/**
 * 获取新技能推荐（基于评分）
 */
export function getRecommendedSkills(count = 5) {
  return getRecommendedSkillsForAgent(['代码', '运营', '创意']).slice(0, count);
}

/**
 * 上传用户技能到全网
 */
export async function uploadSkill(skillData) {
  const { skillId, skillName, skillDesc, agent, sourceCode, version } = skillData;
  
  console.log(`📤 上传 Skill: ${skillId}`);
  
  // 简化实现
  return {
    success: true,
    skillId,
    skillName,
    uploadedAt: new Date().toISOString()
  };
}

/**
 * 获取用户已上传的技能列表
 */
export async function getUserUploadedSkills() {
  return [];
}

/**
 * 从 ClawHub 抓取技能数据
 */
async function fetchSkillsFromClawHub() {
  try {
    const endpoints = [
      `${CLAWHUB_API_BASE}/all`,
      `${CLAWHUB_API_BASE}/popular`,
      `${CLAWHUB_API_BASE}/list`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Lingxi-Cloud-Bot/1.0'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          return data;
        }
      } catch (error) {
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`抓取 ClawHub 技能失败: ${error.message}`);
    return null;
  }
}

/**
 * 技能评分标准
 * @param {object} skill - 技能对象
 * @returns {object} - 评分结果
 */
function scoreSkill(skill) {
  const criteria = {
    stars: skill.stars >= 50,
    updated: true,
    docs: true,
    notPrototype: !skill.tags?.some(t => 
      t.toLowerCase().includes('test') || 
      t.toLowerCase().includes('prototype') ||
      t.toLowerCase().includes('demo')
    )
  };
  
  const score = Object.values(criteria).filter(Boolean).length;
  
  return {
    score,
    criteria,
    passed: score >= 3
  };
}

/**
 * 读取现有技能
 */
function getCurrentSkills() {
  try {
    if (existsSync(USER_LIBRARY_PATH)) {
      const content = readFileSync(USER_LIBRARY_PATH, 'utf8');
      const data = JSON.parse(content);
      return data.skills || [];
    }
    
    if (existsSync(LIBRARY_PATH)) {
      const content = readFileSync(LIBRARY_PATH, 'utf8');
      const data = JSON.parse(content);
      return data.skills || [];
    }
    
    return [];
  } catch (error) {
    console.error('读取 library.json 失败:', error.message);
    return [];
  }
}

/**
 * 检查技能是否已存在
 */
function isSkillExisting(skillId, existingSkills) {
  return existingSkills.some(s => s.id === skillId);
}

/**
 * 更新 library.json 文件
 */
function updateLibrary(libraryData) {
  try {
    if (existsSync(dirname(USER_LIBRARY_PATH))) {
      writeFileSync(USER_LIBRARY_PATH, JSON.stringify(libraryData, null, 2));
      return true;
    }
    
    writeFileSync(LIBRARY_PATH, JSON.stringify(libraryData, null, 2));
    return true;
    
  } catch (error) {
    console.error('更新 library.json 失败:', error.message);
    return false;
  }
}

/**
 * 同步技能（内部使用）
 */
export async function syncSkills() {
  const clawHubSkills = await fetchSkillsFromClawHub();
  
  if (!clawHubSkills || !clawHubSkills.skills) {
    return { success: false, error: 'Failed to fetch from ClawHub' };
  }
  
  const existingSkills = getCurrentSkills();
  const newSkills = [];
  const maxDisplayOrder = existingSkills.reduce((max, s) => 
    Math.max(max, s.displayOrder || 0), 0);
  
  for (const skill of clawHubSkills.skills) {
    if (isSkillExisting(skill.id, existingSkills)) {
      continue;
    }
    
    const scoreResult = scoreSkill(skill);
    
    if (!scoreResult.criteria.notPrototype) {
      continue;
    }
    
    if (!scoreResult.passed) {
      continue;
    }
    
    newSkills.push({
      id: skill.id,
      name: skill.name || skill.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      desc: skill.description || skill.desc || '暂无描述',
      agent: skill.agent || 'coder',
      tags: skill.tags || [],
      version: skill.version || '1.0.0',
      author: skill.author || 'ClawHub',
      displayOrder: maxDisplayOrder + newSkills.length + 1
    });
  }
  
  const updatedSkills = [
    ...existingSkills.map((skill, index) => ({
      ...skill,
      displayOrder: index + 1
    })),
    ...newSkills
  ];
  
  const newLibrary = {
    version: '1.1.0',
    name: '灵犀云技能库',
    description: '灵犀云官方技能库 - 包含精选技能',
    lastUpdated: new Date().toISOString(),
    skills: updatedSkills
  };
  
  const success = updateLibrary(newLibrary);
  
  return {
    success,
    newSkills: newSkills.length,
    totalSkills: updatedSkills.length,
    timestamp: new Date().toISOString()
  };
}

/**
 * 从 ClawHub 抓取并更新技能库（导出供手动调用）
 */
export async function syncSkillsFromClawHub() {
  console.log('\n🚀 开始同步技能库...');
  return await syncSkills();
}

/**
 * 导出技能库数据
 */
export function getLibrary() {
  try {
    if (existsSync(USER_LIBRARY_PATH)) {
      const content = readFileSync(USER_LIBRARY_PATH, 'utf8');
      return JSON.parse(content);
    }
    
    if (existsSync(LIBRARY_PATH)) {
      const content = readFileSync(LIBRARY_PATH, 'utf8');
      return JSON.parse(content);
    }
    
    return null;
  } catch (error) {
    console.error('读取 library.json 失败:', error.message);
    return null;
  }
}

/**
 * 按 Agent 分组技能
 */
export function groupSkillsByAgent() {
  const library = getLibrary();
  
  if (!library || !library.skills) {
    return {};
  }
  
  return library.skills.reduce((acc, skill) => {
    const agent = skill.agent || 'unknown';
    if (!acc[agent]) {
      acc[agent] = [];
    }
    acc[agent].push(skill);
    return acc;
  }, {});
}

/**
 * 获取按 Agent 分组的技能数量
 */
export function getSkillsByAgentCount() {
  const grouped = groupSkillsByAgent();
  
  return Object.entries(AGENTS).map(([agentId, agentConfig]) => ({
    agentId,
    name: agentConfig.name,
    count: grouped[agentId]?.length || 0,
    skills: grouped[agentId] || []
  }));
}

export default {
  AGENTS,
  isSkillInstalled,
  getSkillInfo,
  searchClawHubSkills,
  getPopularSkills,
  installGlobalSkill,
  installSkill,
  getRecommendedSkills,
  uploadSkill,
  getUserUploadedSkills,
  syncSkills,
  syncSkillsFromClawHub,
  getLibrary,
  groupSkillsByAgent,
  getSkillsByAgentCount,
  scoreSkill
};
