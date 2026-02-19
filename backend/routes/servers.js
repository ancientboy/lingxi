import { Router } from 'express';
import { getDB, saveDB } from '../utils/db.js';
import crypto from 'crypto';

const router = Router();

const SERVER_PASSWORD = 'Lingxi@2026!';
const OPENCLAW_PORT = 18789;

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSessionId() {
  return crypto.randomBytes(4).toString('hex');
}

router.post('/create', async (req, res) => {
  try {
    const { userId, region = 'cn-hangzhou', spec = 'ecs.tiny' } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId 必填' });
    }
    
    const db = await getDB();
    const user = db.users?.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    const existingServer = db.userServers?.find(s => s.userId === userId);
    if (existingServer) {
      return res.json({
        success: true,
        server: existingServer,
        message: '用户已有服务器'
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
      region,
      spec,
      sshPort: 22,
      sshPassword: SERVER_PASSWORD,
      openclawPort: OPENCLAW_PORT,
      openclawToken,
      openclawSession,
      status: 'pending',
      healthCheckedAt: null,
      createdAt: new Date().toISOString()
    };
    
    if (!db.userServers) db.userServers = [];
    db.userServers.push(server);
    await saveDB(db);
    
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
    console.error('创建服务器失败:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    const server = db.userServers?.find(s => s.userId === userId);
    if (!server) {
      return res.json({
        hasServer: false,
        status: 'not_created'
      });
    }
    
    const task = db.deployTasks
      ?.filter(t => t.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    
    res.json({
      hasServer: true,
      server: {
        id: server.id,
        ip: server.ip,
        status: server.status,
        region: server.region,
        openclawUrl: server.ip ? `http://${server.ip}:${server.openclawPort}/${server.openclawSession}?token=${server.openclawToken}` : null
      },
      task: task ? {
        id: task.id,
        type: task.taskType,
        status: task.status,
        progress: task.progress,
        errorMessage: task.errorMessage
      } : null
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/deploy/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const db = await getDB();
    
    const server = db.userServers?.find(s => s.id === serverId);
    if (!server) {
      return res.status(404).json({ error: '服务器不存在' });
    }
    
    if (!server.ip) {
      return res.status(400).json({ error: '服务器IP未分配，请先完成服务器创建' });
    }
    
    const config = db.userConfigs?.find(c => c.userId === server.userId);
    
    const taskId = `task-${crypto.randomUUID().substring(0, 8)}`;
    const task = {
      id: taskId,
      userId: server.userId,
      serverId,
      taskType: 'deploy_openclaw',
      status: 'pending',
      progress: 0,
      params: JSON.stringify({
        ip: server.ip,
        openclawToken: server.openclawToken,
        openclawSession: server.openclawSession,
        agents: config?.agents ? JSON.parse(config.agents) : ['lingxi'],
        feishu: config?.feishuAppId ? {
          appId: config.feishuAppId,
          appSecret: config.feishuAppSecret
        } : null,
        wecom: config?.wecomCorpId ? {
          corpId: config.wecomCorpId,
          agentId: config.wecomAgentId,
          secret: config.wecomSecret
        } : null
      }),
      result: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString()
    };
    
    if (!db.deployTasks) db.deployTasks = [];
    db.deployTasks.push(task);
    await saveDB(db);
    
    res.json({
      success: true,
      task: {
        id: taskId,
        status: 'pending'
      },
      message: '部署任务已提交'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/update-config/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { agents, feishu, wecom } = req.body;
    
    const db = await getDB();
    
    const server = db.userServers?.find(s => s.userId === userId);
    if (!server || !server.ip) {
      return res.status(400).json({ error: '用户没有可用的服务器' });
    }
    
    let config = db.userConfigs?.find(c => c.userId === userId);
    if (!config) {
      config = {
        id: `cfg-${crypto.randomUUID().substring(0, 8)}`,
        userId,
        feishuAppId: null,
        feishuAppSecret: null,
        feishuEnabled: 0,
        wecomCorpId: null,
        wecomAgentId: null,
        wecomSecret: null,
        wecomToken: null,
        wecomEncodingAesKey: null,
        wecomEnabled: 0,
        agents: '["lingxi"]',
        skills: null,
        modelProvider: 'zhipu',
        modelName: 'glm-5',
        updatedAt: new Date().toISOString()
      };
      if (!db.userConfigs) db.userConfigs = [];
      db.userConfigs.push(config);
    }
    
    if (agents) {
      config.agents = JSON.stringify(agents);
    }
    if (feishu) {
      config.feishuAppId = feishu.appId;
      config.feishuAppSecret = feishu.appSecret;
      config.feishuEnabled = feishu.appId ? 1 : 0;
    }
    if (wecom) {
      config.wecomCorpId = wecom.corpId;
      config.wecomAgentId = wecom.agentId;
      config.wecomSecret = wecom.secret;
      config.wecomToken = wecom.token;
      config.wecomEncodingAesKey = wecom.encodingAesKey;
      config.wecomEnabled = wecom.corpId ? 1 : 0;
    }
    config.updatedAt = new Date().toISOString();
    
    await saveDB(db);
    
    const taskId = `task-${crypto.randomUUID().substring(0, 8)}`;
    const task = {
      id: taskId,
      userId,
      serverId: server.id,
      taskType: 'update_config',
      status: 'pending',
      progress: 0,
      params: JSON.stringify({ agents, feishu, wecom }),
      result: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString()
    };
    
    if (!db.deployTasks) db.deployTasks = [];
    db.deployTasks.push(task);
    await saveDB(db);
    
    res.json({
      success: true,
      task: {
        id: taskId,
        status: 'pending'
      },
      message: '配置更新任务已提交，将同步到用户服务器'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/list', async (req, res) => {
  try {
    const db = await getDB();
    const servers = db.userServers || [];
    
    res.json({
      total: servers.length,
      servers: servers.map(s => ({
        id: s.id,
        userId: s.userId,
        ip: s.ip,
        status: s.status,
        region: s.region,
        createdAt: s.createdAt
      }))
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const db = await getDB();
    
    const task = db.deployTasks?.find(t => t.id === taskId);
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    
    res.json({
      id: task.id,
      type: task.taskType,
      status: task.status,
      progress: task.progress,
      result: task.result ? JSON.parse(task.result) : null,
      errorMessage: task.errorMessage,
      startedAt: task.startedAt,
      completedAt: task.completedAt
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
