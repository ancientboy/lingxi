/**
 * Skills 管理路由
 * 支持本地技能库和热门技能
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  isSkillInstalled,
  getPopularSkills,
  installGlobalSkill
} from '../skills/clawhub-integration.mjs';
import { getUser } from '../utils/db.js';

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
    
    // 检查每个技能的安装状态（传入 userId）
    const skillsWithStatus = await Promise.all(
      allSkills.map(async (skill) => ({
        ...skill,
        installed: await isSkillInstalled(skill.id, userId)
      }))
    );
    
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
    
    // 查找技能
    const skill = library.skills.find(s => s.id === skillId);
    
    if (!skill) {
      return res.status(404).json({
        error: '技能不存在于本地技能库'
      });
    }
    
    // 检查是否已安装
    if (await isSkillInstalled(skillId, userId)) {
      return res.json({
        skillId,
        success: false,
        alreadyInstalled: true,
        message: '该技能已安装'
      });
    }
    
    // 从 ClawHub 安装（本地技能实际上是 ClawHub 的子集）
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
 * 获取用户已安装的技能
 */
router.get('/installed', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  
  // 返回空数组，前端通过 installedSkills Set 管理
  res.json({
    total: 0,
    skills: []
  });
});

export default router;
