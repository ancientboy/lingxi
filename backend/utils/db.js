import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataDir = join(__dirname, '..', 'data');
const dbPath = join(dataDir, 'db.json');

// 数据库结构
const defaultDB = {
  users: [],
  inviteCodes: [],
  agentConfigs: []
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

// ============ 用户操作 ============

export async function createUser(inviteCode, nickname = null) {
  const db = await getDB();
  const id = randomUUID();
  const user = {
    id,
    inviteCode,
    nickname,
    instanceId: null,
    instanceStatus: 'pending',
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  };
  
  db.users.push(user);
  await saveDB(db);
  
  // 标记邀请码已使用
  await useInviteCode(inviteCode, id);
  
  return user;
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
