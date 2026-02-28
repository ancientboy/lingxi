/**
 * Skills 管理路由
 * 支持本地技能库和热门技能
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import { config } from '../config/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client: SSHClient } = require('ssh2');

import { 
  isSkillInstalled,
  getPopularSkills,
  installGlobalSkill
} from '../skills/clawhub-integration.mjs';
import { getUser, getDB, saveDB } from '../utils/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// 🛡️ 验证用户Token中间件
async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'lingxi-cloud-secret-key-2026');
    const user = await getUser(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 将用户信息附加到请求对象
    req.user = user;
    next();
  } catch (error) {
    console.error('Token验证失败:', error.message);
    res.status(401).json({ error: '令牌无效或已过期' });
  }
}

// ============ 热门技能相关 API ============

/**
 * 获取本地技能库
 */
router.get('/library', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 获取用户已安装的技能
    const db = await getDB();
    const userSkills = db.userSkills?.[userId] || [];
    const installedSet = new Set(userSkills);
    
    // 读取本地技能库文件
    const libraryPath = path.join(__dirname, '../skills/library.json');
    const data = await fs.readFile(libraryPath, 'utf-8');
    const library = JSON.parse(data);
    
    // 将按 Agent 分类的对象转换为扁平数组
    let allSkills = [];
    if (library.skills) {
      // 旧格式: { skills: [...] }
      allSkills = library.skills;
    } else {
      // 新格式: { coder: [...], ops: [...], ... }
      for (const agent of Object.keys(library)) {
        if (Array.isArray(library[agent])) {
          allSkills = allSkills.concat(library[agent]);
        }
      }
    }
    
    // 添加安装状态
    const skillsWithStatus = allSkills.map(skill => ({
      ...skill,
      installed: installedSet.has(skill.id)
    }));
    
    res.json({
      source: 'local',
      timestamp: new Date().toISOString(),
      skills: skillsWithStatus
    });
  } catch (error) {
    console.error('获取本地技能库失败:', error);
    res.status(500).json({ 
      error: '获取本地技能库失败',
      message: error.message 
    });
  }
});

/**
 * 从 ClawHub 获取热门技能
 */
router.get('/popular', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const skills = await getPopularSkills();
    
    // 检查每个技能的安装状态
    const skillsWithStatus = await Promise.all(
      skills.map(async (skill) => ({
        ...skill,
        installed: await isSkillInstalled(skill.id, userId)
      }))
    );
    
    res.json({
      source: 'clawhub',
      timestamp: new Date().toISOString(),
      skills: skillsWithStatus
    });
  } catch (error) {
    console.error('获取热门技能失败:', error);
    res.status(500).json({ 
      error: '获取热门技能失败',
      message: error.message 
    });
  }
});

/**
 * 从 ClawHub 搜索热门技能
 */
router.get('/search', authenticateUser, async (req, res) => {
  const { q } = req.query;
  
  if (!q) {
    return res.status(400).json({ error: '参数 q 是必需的' });
  }
  
  try {
    const userId = req.user.id;
    // 简化版：直接调用热门技能 API，前端处理搜索
    const skills = await getPopularSkills();
    
    // 检查每个技能的安装状态
    const skillsWithStatus = await Promise.all(
      skills.map(async (skill) => ({
        ...skill,
        installed: await isSkillInstalled(skill.id, userId)
      }))
    );
    
    res.json({
      source: 'clawhub',
      query: q,
      timestamp: new Date().toISOString(),
      skills: skillsWithStatus
    });
  } catch (error) {
    console.error('搜索技能失败:', error);
    res.status(500).json({ 
      error: '搜索技能失败',
      message: error.message 
    });
  }
});

// ============ 安装 API ============

/**
 * 从 ClawHub 安装热门技能
 */
router.post('/install-global/:skillId', authenticateUser, async (req, res) => {
  const { skillId } = req.params;
  const userId = req.user.id;
  
  try {
    // 🛡️ 为当前用户安装技能（使用用户隔离）
    const result = await installGlobalSkill(skillId, userId);
    
    if (result.success || result.alreadyInstalled) {
      res.json({
        skillId,
        ...result,
        message: result.alreadyInstalled 
          ? '该技能已安装' 
          : '技能安装成功'
      });
    } else {
      res.status(400).json({
        skillId,
        ...result
      });
    }
  } catch (error) {
    console.error('安装技能失败:', error);
    res.status(500).json({ 
      error: '安装技能失败',
      message: error.message 
    });
  }
});

/**
 * 从本地技能库安装技能
 */
router.post('/install/:skillId', authenticateUser, async (req, res) => {
  const { skillId } = req.params;
  const userId = req.user.id;
  
  try {
    // 读取本地技能库
    const libraryPath = path.join(__dirname, '../skills/library.json');
    const data = await fs.readFile(libraryPath, 'utf-8');
    const library = JSON.parse(data);
    
    // 扁平化 library
    let allSkills = [];
    if (library.skills) {
      allSkills = library.skills;
    } else {
      for (const agent of Object.keys(library)) {
        if (Array.isArray(library[agent])) {
          allSkills = allSkills.concat(library[agent]);
        }
      }
    }
    
    // 查找技能
    const skill = allSkills.find(s => s.id === skillId);
    
    if (!skill) {
      return res.status(404).json({
        error: '技能不存在于本地技能库'
      });
    }
    
    // 获取数据库
    const db = await getDB();
    if (!db.userSkills) db.userSkills = {};
    if (!db.userSkills[userId]) db.userSkills[userId] = [];
    
    // 检查是否已安装
    if (db.userSkills[userId].includes(skillId)) {
      return res.json({
        skillId,
        success: true,
        alreadyInstalled: true,
        message: '该技能已安装'
      });
    }
    
    // 记录安装
    db.userSkills[userId].push(skillId);
    await saveDB(db);
    
    res.json({
      skillId,
      success: true,
      message: '技能安装成功'
    });
  } catch (error) {
    console.error('安装技能失败:', error);
    res.status(500).json({ 
      error: '安装技能失败',
      message: error.message 
    });
  }
});

/**
 * 获取用户已安装的技能（通过 SSH 连接用户实例）
 */
router.get('/installed', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  
  try {
    const db = await getDB();
    
    // 获取用户运行中的服务器
    const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
    
    if (!server || !server.ip) {
      return res.json({
        total: 0,
        skills: [],
        message: '暂无运行中的实例'
      });
    }
    
    // 通过 SSH 从用户服务器的 skills 目录获取已安装技能
    console.log('📡 从用户服务器获取技能:', server.ip);
    const skills = await getInstalledSkillsViaSSH(server.ip);
    
    console.log('✅ 获取到已安装技能:', skills.length, '个');
    res.json({
      total: skills.length,
      skills: skills
    });
  } catch (error) {
    console.error('获取已安装技能失败:', error);
    res.status(500).json({ 
      error: '获取已安装技能失败',
      message: error.message 
    });
  }
});

/**
 * 通过 SSH 获取用户实例的已安装技能
 * OpenClaw 技能目录: ~/.openclaw/workspace/skills/
 */
async function getInstalledSkillsViaSSH(host, port = 22) {
  const SERVER_PASSWORD = config.userServer.password;
  console.log('🔐 SSH 连接:', host, '密码:', SERVER_PASSWORD ? '***' : '空');
  
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    const skills = [];
    
    conn.on('ready', () => {
      console.log('✅ SSH 连接成功:', host);
      const cmd = 'ls -1 ~/.openclaw/workspace/skills/ 2>/dev/null';
      console.log('📡 执行命令:', cmd);
      
      conn.exec(cmd, (err, stream) => {
        if (err) {
          conn.end();
          resolve([]);
          return;
        }
        
        let output = '';
        stream.on('data', (data) => {
          output += data.toString();
        });
        
        stream.on('close', () => {
          conn.end();
          console.log('📦 SSH 输出:', output);
          
          const lines = output.trim().split('\n');
          for (const line of lines) {
            const skillId = line.trim();
            if (skillId && !skillId.startsWith('ls:') && !skillId.includes('No such file') && skillId !== '') {
              skills.push({
                id: skillId,
                name: skillId,
                desc: '已安装的技能',
                agent: 'lingxi'
              });
            }
          }
          
          console.log(`✅ 从 ${host} 获取到 ${skills.length} 个技能:`, skills.map(s => s.id));
          resolve(skills);
        });
      });
    });
    
    conn.on('error', (err) => {
      console.error('SSH 连接失败:', err.message);
      resolve([]);
    });
    
    conn.connect({
      host,
      port: typeof port === 'number' ? port : 22,
      username: 'root',
      password: SERVER_PASSWORD,
      readyTimeout: 10000
    });
  });
}

export default router;
