/**
 * ClawHub 集成模块
 * 
 * 从 ClawHub 获取和安装 Skills
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// ClawHub 配置
const CLAWHUB_URL = process.env.CLAWHUB_URL || 'https://hub.openclaw.io';
const SKILLS_DIR = process.env.SKILLS_DIR || path.join(process.env.HOME, '.openclaw', 'workspace', 'skills');

// Agent 推荐的 Skills
export const AGENT_SKILLS = {
  coder: {
    name: '云溪',
    skills: [
      { id: 'code-reviewer', desc: '代码审查' },
      { id: 'fix', desc: '自动修复代码问题' },
      { id: 'frontend-code-review', desc: '前端代码审查' },
      { id: 'fullstack-developer', desc: '全栈开发' }
    ]
  },
  
  ops: {
    name: '若曦',
    skills: [
      { id: 'task-planner', desc: '任务规划' },
      { id: 'tasks', desc: '任务管理' },
      { id: 'searxng', desc: '联网搜索' },
      { id: 'data-analysis', desc: '数据分析' }
    ]
  },
  
  inventor: {
    name: '紫萱',
    skills: [
      { id: 'searxng', desc: '联网搜索灵感' },
      { id: 'frontend-design', desc: '界面设计' },
      { id: 'skill-creator', desc: '创建新技能' }
    ]
  },
  
  pm: {
    name: '梓萱',
    skills: [
      { id: 'task-planner', desc: '任务规划' },
      { id: 'searxng', desc: '市场调研' },
      { id: 'update-docs', desc: '文档更新' }
    ]
  },
  
  noter: {
    name: '晓琳',
    skills: [
      { id: 'memory-system', desc: '记忆系统' },
      { id: 'supermemory', desc: '云端记忆' },
      { id: 'memos', desc: '备忘录' }
    ]
  },
  
  media: {
    name: '音韵',
    skills: [
      { id: 'searxng', desc: '搜索媒体资源' },
      { id: 'webapp-testing', desc: '应用测试' }
    ]
  },
  
  smart: {
    name: '智家',
    skills: [
      { id: 'healthcheck', desc: '健康检查' },
      { id: 'tasks', desc: '任务调度' }
    ]
  },
  
  lingxi: {
    name: '灵犀',
    skills: [
      { id: 'memory-system', desc: '记忆系统' },
      { id: 'task-planner', desc: '任务规划' },
      { id: 'searxng', desc: '联网搜索' },
      { id: 'agent-switcher', desc: 'Agent切换' }
    ]
  }
};

/**
 * 检查 Skill 是否已安装
 */
export async function isSkillInstalled(skillId) {
  const skillPath = path.join(SKILLS_DIR, skillId);
  try {
    await fs.access(skillPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 从 ClawHub 获取 Skill 信息
 */
export async function getSkillInfo(skillId) {
  try {
    // 这里应该调用 ClawHub API
    // 目前先返回模拟数据
    const response = await fetch(`${CLAWHUB_URL}/api/skills/${skillId}`);
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error(`获取 Skill 信息失败: ${skillId}`, error.message);
    return null;
  }
}

/**
 * 安装 Skill
 */
export async function installSkill(skillId) {
  console.log(`📦 安装 Skill: ${skillId}`);
  
  // 检查是否已安装
  if (await isSkillInstalled(skillId)) {
    console.log(`✅ Skill ${skillId} 已安装`);
    return { success: true, alreadyInstalled: true };
  }
  
  try {
    // 方法1: 从 ClawHub 下载
    // const skillInfo = await getSkillInfo(skillId);
    // ...
    
    // 方法2: 使用 claw 命令（如果存在）
    try {
      await execAsync(`claw install ${skillId}`);
      console.log(`✅ Skill ${skillId} 安装成功`);
      return { success: true };
    } catch {
      // claw 命令不存在，使用备用方法
    }
    
    // 方法3: 从本地复制（开发环境）
    const sourcePath = path.join(process.env.HOME, '.openclaw', 'workspace', 'skills', skillId);
    const targetPath = path.join(SKILLS_DIR, skillId);
    
    try {
      await fs.access(sourcePath);
      await execAsync(`cp -r ${sourcePath} ${targetPath}`);
      console.log(`✅ Skill ${skillId} 复制成功`);
      return { success: true };
    } catch {
      console.log(`⚠️ Skill ${skillId} 不存在`);
      return { success: false, error: 'Skill not found' };
    }
    
  } catch (error) {
    console.error(`❌ 安装 Skill ${skillId} 失败:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 为 Agent 安装推荐 Skills
 */
export async function installAgentSkills(agentId) {
  const agentConfig = AGENT_SKILLS[agentId];
  
  if (!agentConfig) {
    console.log(`⚠️ 未知的 Agent: ${agentId}`);
    return { success: false, installed: [] };
  }
  
  console.log(`\n🔧 为 ${agentConfig.name} 安装 Skills...\n`);
  
  const results = [];
  
  for (const skill of agentConfig.skills) {
    const result = await installSkill(skill.id);
    results.push({
      id: skill.id,
      desc: skill.desc,
      ...result
    });
  }
  
  const installed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n📊 安装结果:`);
  console.log(`   ✅ 成功: ${installed.length}`);
  console.log(`   ❌ 失败: ${failed.length}`);
  
  return {
    success: failed.length === 0,
    installed: installed,
    failed: failed
  };
}

/**
 * 获取推荐的 Skills
 */
export function getRecommendedSkills(interests) {
  const recommended = new Map();
  
  for (const interest of interests) {
    const keyword = interest.toLowerCase();
    
    // 根据关键词匹配 Agent
    if (keyword.includes('代码') || keyword.includes('开发') || keyword.includes('编程')) {
      for (const skill of AGENT_SKILLS.coder.skills) {
        recommended.set(skill.id, skill);
      }
    }
    
    if (keyword.includes('运营') || keyword.includes('数据') || keyword.includes('增长')) {
      for (const skill of AGENT_SKILLS.ops.skills) {
        recommended.set(skill.id, skill);
      }
    }
    
    if (keyword.includes('创意') || keyword.includes('设计') || keyword.includes('想法')) {
      for (const skill of AGENT_SKILLS.inventor.skills) {
        recommended.set(skill.id, skill);
      }
    }
    
    if (keyword.includes('产品') || keyword.includes('需求') || keyword.includes('mvp')) {
      for (const skill of AGENT_SKILLS.pm.skills) {
        recommended.set(skill.id, skill);
      }
    }
  }
  
  return Array.from(recommended.values());
}

export default {
  AGENT_SKILLS,
  isSkillInstalled,
  getSkillInfo,
  installSkill,
  installAgentSkills,
  getRecommendedSkills
};
