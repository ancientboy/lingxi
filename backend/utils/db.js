import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';

const { randomUUID } = crypto;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataDir = join(__dirname, '..', 'data');
const dbPath = join(dataDir, 'db.json');

// 数据库结构
const defaultDB = {
  users: [],
  inviteCodes: [],
  agentConfigs: [],
  userServers: [],
  userConfigs: [],
  deployTasks: []
};

// 初始化数据库
async function initDB() {
  try {
    // 确保目录存在
    if (!fsSync.existsSync(dataDir)) {
      await fs.mkdir(dataDir, { recursive: true });
    }
    
    // 读取或创建数据库
    try {
      const data = await fs.readFile(dbPath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      await fs.writeFile(dbPath, JSON.stringify(defaultDB, null, 2));
      return defaultDB;
    }
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
}

// 保存数据库
async function saveDB(db) {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

// 获取数据库
async function getDB() {
  const data = await fs.readFile(dbPath, 'utf-8');
  return JSON.parse(data);
}

// ============ 邀请码操作 ============

export async function createInviteCode(code) {
  const db = await getDB();
  db.inviteCodes.push({
    code,
    used: false,
    usedBy: null,
    createdAt: new Date().toISOString()
  });
  await saveDB(db);
  return code;
}

export async function getInviteCode(code) {
  const db = await getDB();
  return db.inviteCodes.find(c => c.code === code);
}

export async function useInviteCode(code, userId) {
  const db = await getDB();
  const inviteCode = db.inviteCodes.find(c => c.code === code);
  if (inviteCode) {
    inviteCode.used = true;
    inviteCode.usedBy = userId;
    await saveDB(db);
  }
}

export async function generateInviteCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = `LINGXI-${randomUUID().substring(0, 8).toUpperCase()}`;
    await createInviteCode(code);
    codes.push(code);
  }
  return codes;
}

export async function getAllInviteCodes() {
  const db = await getDB();
  return db.inviteCodes;
}

// ============ 用户引导系统 ============

// 用户职业类型和推荐的 Agent 配置
const JOB_RECOMMENDATIONS = {
  'developer': {
    label: '程序员/开发者',
    agents: ['coder', 'noter', 'smart'],
    skills: ['代码审查', '文档整理', '自动化脚本']
  },
  'operator': {
    label: '运营人员',
    agents: ['ops', 'inventor', 'noter'],
    skills: ['数据分析', '文案写作', '知识管理']
  },
  'product': {
    label: '产品经理',
    agents: ['pm', 'ops', 'coder'],
    skills: ['需求分析', '数据驱动', '技术沟通']
  },
  'creator': {
    label: '内容创作者',
    agents: ['inventor', 'media', 'noter'],
    skills: ['创意生成', '多媒体制作', '素材管理']
  },
  'designer': {
    label: '设计师',
    agents: ['media', 'inventor', 'pm'],
    skills: ['视觉创作', '创意灵感', '用户体验']
  },
  'entrepreneur': {
    label: '创业者/老板',
    agents: ['pm', 'ops', 'coder', 'smart'],
    skills: ['商业分析', '增长策略', '效率工具']
  },
  'student': {
    label: '学生/学习者',
    agents: ['noter', 'coder', 'inventor'],
    skills: ['知识管理', '学习辅导', '创意思考']
  },
  'other': {
    label: '其他职业',
    agents: ['lingxi', 'noter', 'smart'],
    skills: ['智能助手', '信息整理', '效率提升']
  }
};

// 检查用户是否完成引导
export async function isOnboardingCompleted(userId) {
  const db = await getDB();
  const user = db.users.find(u => u.id === userId);
  return user?.onboardingCompleted === true;
}

// 完成引导
export async function completeOnboarding(userId, jobType, selectedAgents) {
  const db = await getDB();
  const user = db.users.find(u => u.id === userId);
  
  if (user) {
    user.onboardingCompleted = true;
    user.onboardingJobType = jobType;
    user.onboardingCompletedAt = new Date().toISOString();
    // 如果选择了 Agent，更新用户的团队
    if (selectedAgents && selectedAgents.length > 0) {
      // 确保灵犀始终在
      if (!selectedAgents.includes('lingxi')) {
        selectedAgents.unshift('lingxi');
      }
      user.agents = selectedAgents;
      user.agentsUpdatedAt = new Date().toISOString();
    }
    await saveDB(db);
    console.log(`✅ 用户 ${user.nickname} 完成引导，职业: ${jobType}，团队: ${selectedAgents?.join(',')}`);
    return user;
  }
  return null;
}

// 获取推荐配置
export function getRecommendation(jobType) {
  return JOB_RECOMMENDATIONS[jobType] || JOB_RECOMMENDATIONS['other'];
}

// 获取所有职业类型
export function getJobTypes() {
  return Object.entries(JOB_RECOMMENDATIONS).map(([key, value]) => ({
    id: key,
    label: value.label
  }));
}

export async function generateUserInviteCode() {
  const db = await getDB();
  let code;
  let attempts = 0;
  
  // 确保邀请码唯一
  do {
    code = `USER-${randomUUID().substring(0, 8).toUpperCase()}`;
    attempts++;
  } while (db.users.some(u => u.userInviteCode === code) && attempts < 100);
  
  return code;
}

export async function getUserByUserInviteCode(code) {
  const db = await getDB();
  return db.users.find(u => u.userInviteCode === code);
}

// ============ 积分系统 ============

// 邀请奖励积分
const INVITE_REWARD_POINTS = 100;
// 领取团队消耗积分
const CLAIM_TEAM_COST = 100;

export async function addPoints(userId, points, reason = '') {
  const db = await getDB();
  const user = db.users.find(u => u.id === userId);
  if (user) {
    user.points = (user.points || 0) + points;
    user.pointsHistory = user.pointsHistory || [];
    user.pointsHistory.push({
      type: 'earn',
      points,
      reason,
      balance: user.points,
      time: new Date().toISOString()
    });
    await saveDB(db);
    console.log(`💰 用户 ${user.nickname} 获得 ${points} 积分 (${reason})，当前: ${user.points}`);
    return user.points;
  }
  return 0;
}

export async function spendPoints(userId, points, reason = '') {
  const db = await getDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) return { success: false, error: '用户不存在' };
  
  if ((user.points || 0) < points) {
    return { success: false, error: '积分不足' };
  }
  
  user.points -= points;
  user.pointsHistory = user.pointsHistory || [];
  user.pointsHistory.push({
    type: 'spend',
    points,
    reason,
    balance: user.points,
    time: new Date().toISOString()
  });
  await saveDB(db);
  console.log(`💸 用户 ${user.nickname} 消耗 ${points} 积分 (${reason})，剩余: ${user.points}`);
  return { success: true, balance: user.points };
}

export async function getPointsInfo(userId) {
  const db = await getDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) return null;
  
  return {
    points: user.points || 0,
    inviteReward: INVITE_REWARD_POINTS,
    claimTeamCost: CLAIM_TEAM_COST,
    canClaimTeam: (user.points || 0) >= CLAIM_TEAM_COST,
    history: user.pointsHistory || []
  };
}

// ============ 用户操作 ============

export async function createUser(inviteCode, nickname = null, password = null, invitedBy = null) {
  const db = await getDB();
  const id = randomUUID();
  
  // 密码哈希
  const passwordHash = password ? hashPassword(password) : null;
  
  // 生成用户专属邀请码
  const userInviteCode = await generateUserInviteCode();
  
  const user = {
    id,
    inviteCode,
    nickname,
    passwordHash,
    userInviteCode,        // 用户专属邀请码
    invitedBy,             // 被谁邀请的（用户ID）
    inviteCount: 0,        // 邀请了多少人
    points: 0,             // 积分
    pointsHistory: [],     // 积分历史
    instanceId: null,
    instanceStatus: 'pending',
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  };
  
  db.users.push(user);
  
  // 如果是通过用户邀请码注册的，更新邀请者的邀请数和积分
  if (invitedBy) {
    const inviter = db.users.find(u => u.id === invitedBy);
    if (inviter) {
      inviter.inviteCount = (inviter.inviteCount || 0) + 1;
      inviter.points = (inviter.points || 0) + INVITE_REWARD_POINTS;
      inviter.pointsHistory = inviter.pointsHistory || [];
      inviter.pointsHistory.push({
        type: 'earn',
        points: INVITE_REWARD_POINTS,
        reason: `邀请好友注册: ${nickname}`,
        balance: inviter.points,
        time: new Date().toISOString()
      });
      console.log(`🎉 ${inviter.nickname} 邀请了 ${nickname}，获得 ${INVITE_REWARD_POINTS} 积分`);
    }
  }
  
  await saveDB(db);
  
  // 标记系统邀请码已使用
  await useInviteCode(inviteCode, id);
  
  return user;
}

// 简单密码哈希（生产环境应用 bcrypt）
export function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'lingxi-salt-2026').digest('hex');
}

export async function verifyPassword(userId, password) {
  const db = await getDB();
  const user = db.users.find(u => u.id === userId);
  if (!user || !user.passwordHash) return false;
  
  const hash = hashPassword(password);
  return hash === user.passwordHash;
}

export async function getUser(id) {
  const db = await getDB();
  return db.users.find(u => u.id === id);
}

export async function getUserByInviteCode(inviteCode) {
  const db = await getDB();
  return db.users.find(u => u.inviteCode === inviteCode);
}

export async function updateUserInstance(userId, instanceId, status = 'ready') {
  const db = await getDB();
  const user = db.users.find(u => u.id === userId);
  if (user) {
    user.instanceId = instanceId;
    user.instanceStatus = status;
    await saveDB(db);
  }
}

export async function updateUserAgents(userId, agents) {
  const db = await getDB();
  const user = db.users.find(u => u.id === userId);
  if (user) {
    user.agents = agents;
    user.agentsUpdatedAt = new Date().toISOString();
    await saveDB(db);
    console.log(`✅ 已更新用户 ${userId} 的团队配置: ${agents.join(', ')}`);
    return user;
  }
  return null;
}

export async function updateLastLogin(userId) {
  const db = await getDB();
  const user = db.users.find(u => u.id === userId);
  if (user) {
    user.lastLoginAt = new Date().toISOString();
    await saveDB(db);
  }
}

// ============ Agent配置操作 ============

export async function saveAgentConfig(userId, agents, skills = []) {
  const db = await getDB();
  const id = randomUUID();
  const config = {
    id,
    userId,
    agents,
    skills,
    createdAt: new Date().toISOString()
  };
  
  db.agentConfigs.push(config);
  await saveDB(db);
  
  return config;
}

export async function getAgentConfig(userId) {
  const db = await getDB();
  const configs = db.agentConfigs.filter(c => c.userId === userId);
  return configs.length > 0 ? configs[configs.length - 1] : null;
}

// 导出函数供其他模块使用
export { getDB, saveDB };

// 初始化
initDB().then(() => {
  console.log('✅ JSON数据库初始化完成');
}).catch(err => {
  console.error('❌ 数据库初始化失败:', err);
});
