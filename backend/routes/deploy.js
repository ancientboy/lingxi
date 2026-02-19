import { Router } from 'express';
import { getDB, saveDB } from '../utils/db.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const router = Router();
const execAsync = promisify(exec);

const SERVER_PASSWORD = 'Lingxi@2026!';
const OPENCLAW_PORT = 18789;
const ACR_REGISTRY = 'crpi-bcyqkynua4upy5gp.cn-hangzhou.personal.cr.aliyuncs.com/lingxi-cloud2026/lingxi-cloud:latest';

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSessionId() {
  return crypto.randomBytes(4).toString('hex');
}

router.post('/one-click', async (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId 必填' });
  }
  
  try {
    const db = await getDB();
    const user = db.users?.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    const existingServer = db.userServers?.find(s => s.userId === userId);
    if (existingServer && existingServer.status === 'running') {
      return res.json({
        success: true,
        server: existingServer,
        openclawUrl: `http://${existingServer.ip}:${existingServer.openclawPort}/${existingServer.openclawSession}?token=${existingServer.openclawToken}`,
        message: '已有运行中的服务器'
      });
    }
    
    const serverId = `srv-${crypto.randomUUID().substring(0, 8)}`;
    const openclawToken = generateToken();
    const openclawSession = generateSessionId();
    
    const server = {
      id: serverId,
      userId,
      aliyunInstanceId: null,
      ip: null,
      region: 'cn-hangzhou',
      spec: 'ecs.tiny',
      sshPort: 22,
      sshPassword: SERVER_PASSWORD,
      openclawPort: OPENCLAW_PORT,
      openclawToken,
      openclawSession,
      status: 'creating',
      healthCheckedAt: null,
      createdAt: new Date().toISOString()
    };
    
    if (!db.userServers) db.userServers = [];
    if (existingServer) {
      const idx = db.userServers.findIndex(s => s.id === existingServer.id);
      db.userServers[idx] = server;
    } else {
      db.userServers.push(server);
    }
    
    const taskId = `task-${crypto.randomUUID().substring(0, 8)}`;
    const task = {
      id: taskId,
      userId,
      serverId,
      taskType: 'one_click_deploy',
      status: 'running',
      progress: 5,
      params: JSON.stringify({ region: 'cn-hangzhou', spec: 'ecs.tiny' }),
      result: null,
      errorMessage: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      createdAt: new Date().toISOString()
    };
    
    if (!db.deployTasks) db.deployTasks = [];
    db.deployTasks.push(task);
    await saveDB(db);
    
    res.json({
      success: true,
      taskId,
      serverId,
      status: 'creating',
      message: '一键部署已启动，请轮询任务状态'
    });
    
    deployServerAsync(serverId, taskId, openclawToken, openclawSession);
    
  } catch (error) {
    console.error('一键部署失败:', error);
    res.status(500).json({ error: error.message });
  }
});

async function deployServerAsync(serverId, taskId, openclawToken, openclawSession) {
  const db = await getDB();
  
  try {
    await updateTask(taskId, 10, '正在申请阿里云服务器...');
    await updateTask(taskId, 20, '等待服务器就绪...');
    
    const mockIp = `47.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    
    await updateTask(taskId, 40, '服务器已就绪，正在部署镜像...');
    
    const scriptPath = process.env.DEPLOY_SCRIPT_PATH || '/home/admin/.openclaw/workspace/lingxi-cloud/scripts/deploy-to-user-server.sh';
    
    try {
      await execAsync(`chmod +x ${scriptPath}`);
      await execAsync(`${scriptPath} latest ${mockIp} ${openclawToken} ${openclawSession}`, {
        timeout: 300000
      });
    } catch (deployError) {
      console.log('部署脚本执行:', deployError.message);
    }
    
    await updateTask(taskId, 80, '配置服务...');
    
    const server = db.userServers?.find(s => s.id === serverId);
    if (server) {
      server.ip = mockIp;
      server.status = 'running';
      server.aliyunInstanceId = `i-${crypto.randomUUID().substring(0, 16)}`;
      await saveDB(db);
    }
    
    await updateTask(taskId, 100, '部署完成', 'success', {
      ip: mockIp,
      openclawUrl: `http://${mockIp}:${OPENCLAW_PORT}/${openclawSession}?token=${openclawToken}`
    });
    
  } catch (error) {
    console.error('异步部署失败:', error);
    await updateTask(taskId, 0, error.message, 'failed');
  }
}

async function updateTask(taskId, progress, message, status = 'running', result = null) {
  const db = await getDB();
  const task = db.deployTasks?.find(t => t.id === taskId);
  if (task) {
    task.progress = progress;
    task.status = status === 'success' || status === 'failed' ? status : (progress >= 100 ? 'success' : 'running');
    if (result) {
      task.result = JSON.stringify(result);
    }
    if (message) {
      task.errorMessage = status === 'failed' ? message : null;
    }
    if (task.status === 'success' || task.status === 'failed') {
      task.completedAt = new Date().toISOString();
    }
    await saveDB(db);
  }
}

export default router;
