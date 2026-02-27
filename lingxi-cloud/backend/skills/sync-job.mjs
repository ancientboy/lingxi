/**
 * 技能同步定时任务
 * 
 * 定期从 ClawHub 抓取并更新技能库
 * 使用 node-cron 进行定时调度
 */

import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ClawHub API 配置
const CLAWHUB_API_BASE = process.env.CLAWHUB_API_BASE || 'https://hub.openclaw.io/api/skills';
const CLAWHUB_API_KEY = process.env.CLAWHUB_API_KEY;

// 本地技能库路径
const LIBRARY_PATH = join(__dirname, 'library.json');
const USER_LIBRARY_PATH = join(process.env.HOME, '.openclaw', 'workspace', 'lingxi-cloud', 'backend', 'skills', 'library.json');

/**
 * 技能评分标准
 * @param {object} skill - 技能对象
 * @returns {object} - 评分结果
 */
function scoreSkill(skill) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const updatedDate = skill.updatedAt || skill.updated || skill.lastUpdated || skill.lastUpdatedDate;
  const hasRecentUpdate = updatedDate ? new Date(updatedDate) > thirtyDaysAgo : false;
  
  const hasDocumentation = skill.documentation || skill.docs || skill.readme || skill.hasDocs;
  
  const criteria = {
    stars: skill.stars > 1000,
    updated: hasRecentUpdate,
    docs: hasDocumentation === true || hasDocumentation === 'true' || hasDocumentation === 'yes' || hasDocumentation === 'complete' || hasDocumentation === 'full',
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
    passed: score >= 4
  };
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
        const headers = {
          'Accept': 'application/json',
          'User-Agent': 'Lingxi-Cloud-Bot/1.0'
        };
        
        if (CLAWHUB_API_KEY) {
          headers['Authorization'] = `Bearer ${CLAWHUB_API_KEY}`;
        }
        
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: headers
        });
        
        if (response.ok) {
          const data = await response.json();
          return data;
        } else if (response.status === 401 && !CLAWHUB_API_KEY) {
          console.warn('⚠️ ClawHub API 需要认证，请设置 CLAWHUB_API_KEY 环境变量');
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
      console.log(`✅ 更新成功: ${USER_LIBRARY_PATH}`);
      return true;
    }
    
    writeFileSync(LIBRARY_PATH, JSON.stringify(libraryData, null, 2));
    console.log(`✅ 更新成功: ${LIBRARY_PATH}`);
    return true;
    
  } catch (error) {
    console.error('❌ 更新 library.json 失败:', error.message);
    return false;
  }
}

/**
 * 同步技能
 */
async function syncSkills() {
  console.log('\n🚀 开始同步技能库...');
  console.log(`📝 API Base: ${CLAWHUB_API_BASE}`);
  console.log(`🔑 API Key: ${CLAWHUB_API_KEY ? '已设置' : '未设置'}`);
  
  const clawHubSkills = await fetchSkillsFromClawHub();
  
  if (!clawHubSkills || !clawHubSkills.skills) {
    console.log('⚠️ 抓取 ClawHub 数据失败');
    console.log('💡 提示：请确保 CLAWHUB_API_KEY 环境变量已设置');
    return { success: false };
  }
  
  const existingSkills = getCurrentSkills();
  const newSkills = [];
  const maxDisplayOrder = existingSkills.reduce((max, s) => 
    Math.max(max, s.displayOrder || 0), 0);
  
  // 筛选优质技能
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
  
  // 构建新的库
  const updatedSkills = [
    ...existingSkills.map((skill, index) => ({
      ...skill,
      displayOrder: index + 1
    })),
    ...newSkills
  ];
  
  updatedSkills.forEach((skill, index) => {
    skill.displayOrder = index + 1;
  });
  
  const newLibrary = {
    version: '1.1.0',
    name: '灵犀云技能库',
    description: '灵犀云官方技能库 - 包含精选技能',
    lastUpdated: new Date().toISOString(),
    skills: updatedSkills
  };
  
  const success = updateLibrary(newLibrary);
  
  if (success) {
    console.log(`✅ 同步完成！新增技能: ${newSkills.length}`);
    console.log(`📊 总技能数: ${updatedSkills.length}`);
  }
  
  return {
    success,
    newSkills: newSkills.length,
    totalSkills: updatedSkills.length,
    timestamp: new Date().toISOString()
  };
}

/**
 * 手动触发同步
 */
export async function manualSync() {
  return await syncSkills();
}

/**
 * 启动定时任务
 * 
 * @param {string} schedule - cron 表达式
 * @example
 *   '0 0 * * 0' - 每周日中午12点
 *   '0 0 * * *' - 每天中午12点
 *   '0 * * * *' - 每小时
 */
export function startCronJob(schedule = '0 0 * * 0') {
  console.log(`⏰ 启动技能同步定时任务: ${schedule}`);
  
  // 立即执行一次
  syncSkills();
  
  // 启动定时任务
  cron.schedule(schedule, async () => {
    console.log(`\n🕒 定时任务开始: ${new Date().toISOString()}`);
    await syncSkills();
  }, {
    timezone: 'Asia/Shanghai'
  });
  
  console.log('✅ 定时任务已启动');
}

/**
 * 停止定时任务
 */
export function stopCronJob(task) {
  if (task) {
    task.stop();
    console.log('❌ 定时任务已停止');
  }
}

/**
 * 检查当前的同步状态
 */
export async function checkSyncStatus() {
  try {
    const library = existsSync(USER_LIBRARY_PATH) 
      ? JSON.parse(readFileSync(USER_LIBRARY_PATH, 'utf8'))
      : JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'));
    
    return {
      lastUpdated: library.lastUpdated || '从未更新',
      totalSkills: library.skills?.length || 0,
      version: library.version || '未知'
    };
  } catch (error) {
    return {
      lastUpdated: '从未更新',
      error: error.message
    };
  }
}

export default {
  manualSync,
  startCronJob,
  stopCronJob,
  checkSyncStatus,
  syncSkills
};
