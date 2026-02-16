/**
 * 记忆系统集成 - 灵犀专用
 * 
 * 在灵犀启动时自动加载
 */

import { MemoryManager } from './manager.mjs';
import fs from 'fs';
import path from 'path';

// 全局记忆管理器
let memoryManager = null;

/**
 * 初始化记忆系统
 */
export async function initMemory() {
  if (memoryManager) {
    return memoryManager;
  }

  // 读取配置
  const configPath = path.join(process.env.HOME, '.openclaw', 'workspace', 'memory-config.json');
  let config = {
    primary: 'supermemory',
    local: { enabled: true },
    supermemory: { enabled: true },
    syncStrategy: 'auto'
  };

  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      config = { ...config, ...JSON.parse(configData) };
    }
  } catch (error) {
    console.log('使用默认记忆配置');
  }

  // 创建记忆管理器
  memoryManager = new MemoryManager(config);

  console.log('✅ 记忆系统初始化完成');
  
  return memoryManager;
}

/**
 * 获取记忆管理器
 */
export function getMemory() {
  if (!memoryManager) {
    throw new Error('记忆系统未初始化，请先调用 initMemory()');
  }
  return memoryManager;
}

/**
 * 切换思维模式时加载记忆
 */
export async function loadDomainMemories(domain) {
  const memory = getMemory();
  const memories = await memory.getByDomain(domain);
  
  console.log(`📚 加载 ${domain} 领域记忆: ${memories.length} 条`);
  
  return memories;
}

/**
 * 记住用户反馈
 */
export async function rememberFeedback(feedback, context = {}) {
  const memory = getMemory();
  
  await memory.add(feedback, {
    domain: context.domain || 'personal',
    type: 'feedback',
    importance: context.importance || 7,
    ...context
  });
  
  console.log('✅ 已记住用户反馈');
}

/**
 * 记住用户偏好
 */
export async function rememberPreference(preference, domain = 'personal') {
  const memory = getMemory();
  
  await memory.add(preference, {
    domain,
    type: 'preference',
    importance: 8
  });
  
  console.log('✅ 已记住用户偏好');
}

/**
 * 快速搜索记忆
 */
export async function quickSearch(query, domain = null) {
  const memory = getMemory();
  
  const options = { limit: 5 };
  if (domain) {
    options.domain = domain;
  }
  
  return await memory.search(query, options);
}

/**
 * 获取用户画像
 */
export async function getUserProfile() {
  const memory = getMemory();
  
  const personal = await memory.getByDomain('personal');
  const preferences = personal.filter(m => m.metadata?.type === 'preference');
  const patterns = personal.filter(m => m.metadata?.type === 'pattern');
  
  return {
    preferences: preferences.map(p => p.content),
    patterns: patterns.map(p => p.content),
    total: personal.length
  };
}

/**
 * 学习并记住
 */
export async function learn(content, domain, context = {}) {
  const memory = getMemory();
  
  await memory.add(content, {
    domain,
    type: 'learning',
    importance: context.importance || 6,
    ...context
  });
  
  console.log(`✅ 已学习: ${content}`);
}

// ============ 新用户引导相关 ============

/**
 * 检查是否新用户（未完成引导）
 */
export async function checkFirstTimeUser() {
  try {
    await initMemory();
    const memory = getMemory();
    
    // 检查是否有 onboarding_completed 标记
    const personal = await memory.getByDomain('personal');
    const onboarding = personal.find(m => 
      m.content.includes('onboarding_completed') || 
      m.content.includes('引导完成') ||
      m.content.includes('团队配置完成')
    );
    
    const profile = await getUserProfile();
    
    if (onboarding) {
      // 已完成引导的老用户
      return { 
        isFirstTime: false, 
        profile,
        teamConfig: await getTeamConfig(personal)
      };
    } else {
      // 新用户
      return { 
        isFirstTime: true, 
        profile: null,
        teamConfig: null
      };
    }
  } catch (error) {
    console.log('检查新用户失败:', error.message);
    return { isFirstTime: true, profile: null, teamConfig: null };
  }
}

/**
 * 获取已配置的团队
 */
async function getTeamConfig(personal) {
  const config = personal.find(m => 
    m.content.includes('团队配置:') || 
    m.content.includes('team_agents')
  );
  
  if (!config) return null;
  
  // 解析已配置的 agents
  const agents = [];
  if (config.content.includes('ops') || config.content.includes('若曦')) agents.push('ops');
  if (config.content.includes('coder') || config.content.includes('云溪')) agents.push('coder');
  if (config.content.includes('inventor') || config.content.includes('紫萱')) agents.push('inventor');
  if (config.content.includes('pm') || config.content.includes('梓萱')) agents.push('pm');
  
  return { agents };
}

/**
 * 根据用户需求推荐团队配置
 */
export function recommendTeamConfig(userInput) {
  const RULES = [
    {
      keywords: ['电商', '运营', '数据', '增长', '转化', '留存', '报表'],
      agents: [{ id: 'ops', name: '若曦', emoji: '📊', desc: '运营专家' }],
      skills: ['data-analysis', 'searxng'],
      reason: '运营专家适合数据分析、增长策略'
    },
    {
      keywords: ['代码', '开发', 'bug', '重构', '程序', 'API', 'SQL', '调试'],
      agents: [{ id: 'coder', name: '云溪', emoji: '💻', desc: '代码女王' }],
      skills: ['code-reviewer', 'fix'],
      reason: '代码专家适合开发、调试、重构'
    },
    {
      keywords: ['产品', '需求', '用户', 'MVP', '功能', '体验', '商业模式'],
      agents: [{ id: 'pm', name: '梓萱', emoji: '🎯', desc: '产品女王' }],
      skills: ['task-planner'],
      reason: '产品专家适合需求分析、产品规划'
    },
    {
      keywords: ['创意', '文案', '想法', '头脑风暴', '内容', '灵感', '设计'],
      agents: [{ id: 'inventor', name: '紫萱', emoji: '💡', desc: '创意天才' }],
      skills: ['searxng'],
      reason: '创意专家适合内容创作、头脑风暴'
    },
    {
      keywords: ['笔记', '知识', '整理', '归档', '记录'],
      agents: [{ id: 'noter', name: '晓琳', emoji: '📝', desc: '知识管理' }],
      skills: [],
      reason: '知识管理专家适合信息整理'
    }
  ];
  
  // 匹配规则
  const matched = [];
  for (const rule of RULES) {
    for (const keyword of rule.keywords) {
      if (userInput.includes(keyword)) {
        matched.push(rule);
        break;
      }
    }
  }
  
  // 如果没有匹配，返回默认配置
  if (matched.length === 0) {
    return {
      agents: [{ id: 'ops', name: '若曦', emoji: '📊', desc: '运营专家' }],
      skills: ['task-planner'],
      reason: '运营专家是通用型助手，适合大多数场景'
    };
  }
  
  // 合并匹配结果
  const allAgents = [];
  const allSkills = new Set();
  const reasons = [];
  
  for (const rule of matched) {
    for (const agent of rule.agents) {
      if (!allAgents.find(a => a.id === agent.id)) {
        allAgents.push(agent);
      }
    }
    for (const skill of rule.skills) {
      allSkills.add(skill);
    }
    reasons.push(rule.reason);
  }
  
  return {
    agents: allAgents,
    skills: Array.from(allSkills),
    reasons
  };
}

/**
 * 标记引导完成
 */
export async function markOnboardingCompleted(agents, skills = []) {
  const memory = getMemory();
  
  // 标记引导完成
  await memory.add('onboarding_completed', {
    domain: 'personal',
    type: 'milestone',
    importance: 9
  });
  
  // 记录团队配置
  const agentNames = agents.map(a => a.name).join('、');
  await memory.add(`团队配置完成: ${agentNames}`, {
    domain: 'business',
    type: 'decision',
    importance: 8,
    agents: agents.map(a => a.id),
    skills
  });
  
  console.log('✅ 已标记引导完成');
}

export default {
  initMemory,
  getMemory,
  loadDomainMemories,
  rememberFeedback,
  rememberPreference,
  quickSearch,
  getUserProfile,
  learn,
  checkFirstTimeUser,
  recommendTeamConfig,
  markOnboardingCompleted
};
