/**
 * 服务器管理路由
 */

import { Router } from 'express';
import crypto from 'crypto';
import { getDB, saveDB } from '../utils/db.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

const router = Router();

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSessionId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * 创建服务器（数据库记录，异步创建 ECS）
 */
router.post('/create', async (req, res) => {
  try {
    const { userId, region = config.aliyun.region, spec = config.aliyun.instanceType } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId 必填' });
    }
    
    const db = await getDB();
    const user = db.users?.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 检查是否已有服务器
    const existingServer = db.userServers?.find(s => s.userId === userId);
    if (existingServer) {
      logger.info(`用户 ${userId} 已有服务器: ${existingServer.id}`);
      return res.json({
        success: true,
        server: existingServer,
        message: '用户已有服务器'
      });
    }
    
    // 创建服务器记录
    const serverId = `srv-${crypto.randomUUID().substring(0, 8)}`;
    const openclawToken = generateToken();
    const openclawSession = generateSessionId();
    
    const server = {
      id: serverId,
      userId,
      aliyunInstanceId: null,
      ip: null,
      region,
      spec,
      sshPort: 22,
      sshPassword: config.userServer.password,
      openclawPort: config.userServer.openclawPort,
      openclawToken,
      openclawSession,
      status: 'pending',
      healthCheckedAt: null,
      createdAt: new Date().toISOString()
    };
    
    if (!db.userServers) db.userServers = [];
    db.userServers.push(server);
    
    // 创建部署任务
    const taskId = `task-${crypto.randomUUID().substring(0, 8)}`;
    const task = {
      id: taskId,
      userId,
      serverId,
      taskType: 'create_server',
      status: 'pending',
      progress: 0,
      params: JSON.stringify({ region, spec }),
      result: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString()
    };
    
    if (!db.deployTasks) db.deployTasks = [];
    db.deployTasks.push(task);
    
    await saveDB(db);
    
    logger.success(`服务器创建任务已提交: ${serverId}`);
    
    res.json({
      success: true,
      server,
      task: {
        id: taskId,
        status: 'pending'
      },
      message: '服务器创建任务已提交，请稍后查询状态'
    });
    
  } catch (error) {
    logger.fail('创建服务器失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 查询用户服务器状态
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    const server = db.userServers?.find(s => s.userId === userId);
    
    if (!server) {
      return res.json({
        success: true,
        server: null,
        message: '用户暂无服务器'
      });
    }
    
    // 查询部署任务状态
    const task = db.deployTasks?.find(t => 
      t.serverId === server.id && 
      ['pending', 'running'].includes(t.status)
    );
    
    res.json({
      success: true,
      server,
      task: task || null
    });
    
  } catch (error) {
    logger.fail('查询服务器失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 查询部署任务状态
 */
router.get('/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const db = await getDB();
    
    const task = db.deployTasks?.find(t => t.id === taskId);
    
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    
    res.json({
      success: true,
      task
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 列出所有服务器
 */
router.get('/', async (req, res) => {
  try {
    const db = await getDB();
    const servers = db.userServers || [];
    
    res.json({
      success: true,
      total: servers.length,
      servers
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
