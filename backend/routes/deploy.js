import { Router } from 'express';
import { getDB, saveDB } from '../utils/db.js';
import crypto from 'crypto';
import Ecs20140526, * as $Ecs20140526 from '@alicloud/ecs20140526';
import * as $OpenApi from '@alicloud/openapi';
import { Client } from 'ssh2';

const router = Router();

const SERVER_PASSWORD = 'Lingxi@2026!';
const OPENCLAW_PORT = 18789;
const ACR_REGISTRY = 'crpi-bcyqkynua4upy5gp.cn-hangzhou.personal.cr.aliyuncs.com/lingxi-cloud2026/lingxi-cloud:latest';

const ALIYUN_CONFIG = {
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  regionId: process.env.ALIYUN_REGION || 'cn-hangzhou'
};

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSessionId() {
  return crypto.randomBytes(4).toString('hex');
}

function createEcsClient() {
  const config = new $OpenApi.Config({
    accessKeyId: ALIYUN_CONFIG.accessKeyId,
    accessKeySecret: ALIYUN_CONFIG.accessKeySecret,
  });
  config.endpoint = 'ecs.aliyuncs.com';
  return new Ecs20140526(config);
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
    
    if (existingServer && existingServer.status === 'creating') {
      const task = db.deployTasks?.find(t => t.serverId === existingServer.id && t.status === 'running');
      return res.json({
        success: true,
        taskId: task?.id,
        serverId: existingServer.id,
        status: 'creating',
        message: '服务器正在创建中，请稍候'
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
      region: ALIYUN_CONFIG.regionId,
      spec: 'ecs.g6.large',
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
      params: JSON.stringify({ region: ALIYUN_CONFIG.regionId }),
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
    if (!ALIYUN_CONFIG.accessKeyId || !ALIYUN_CONFIG.accessKeySecret) {
      throw new Error('阿里云密钥未配置');
    }
    
    await updateTask(taskId, 10, '正在创建阿里云 ECS 实例...');
    
    const client = createEcsClient();
    
    const createRequest = new $Ecs20140526.CreateInstanceRequest({
      regionId: ALIYUN_CONFIG.regionId,
      instanceType: 'ecs.g6.large',
      imageId: process.env.ALIYUN_IMAGE_ID || 'ubuntu_22_04_x64_20G_alibase_20240819.vhd',
      securityGroupId: process.env.ALIYUN_SECURITY_GROUP_ID,
      vSwitchId: process.env.ALIYUN_VSWITCH_ID,
      instanceName: `lingxi-${serverId}`,
      password: SERVER_PASSWORD,
      internetMaxBandwidthOut: 10,
      spotStrategy: 'SpotAsYouGo',
    });
    
    const createResponse = await client.createInstance(createRequest);
    const instanceId = createResponse.body.instanceId;
    
    console.log(`✅ ECS 实例已创建: ${instanceId}`);
    
    await updateTask(taskId, 20, '实例创建成功，等待启动...');
    
    const server = db.userServers?.find(s => s.id === serverId);
    if (server) {
      server.aliyunInstanceId = instanceId;
      await saveDB(db);
    }
    
    try {
      await client.startInstance(new $Ecs20140526.StartInstanceRequest({
        instanceId,
      }));
    } catch (startErr) {
      console.log('启动请求已发送，等待实例就绪...');
    }
    
    let publicIp = null;
    let retries = 0;
    const maxRetries = 60;
    
    while (!publicIp && retries < maxRetries) {
      await sleep(5000);
      retries++;
      
      try {
        const describeRequest = new $Ecs20140526.DescribeInstancesRequest({
          regionId: ALIYUN_CONFIG.regionId,
          instanceIds: JSON.stringify([instanceId]),
        });
        
        const describeResponse = await client.describeInstances(describeRequest);
        const instance = describeResponse.body.instances.instance[0];
        
        if (instance && instance.status === 'Running') {
          publicIp = instance.publicIpAddress.ipAddress[0];
          console.log(`✅ 实例已运行，IP: ${publicIp}`);
        } else {
          console.log(`⏳ 等待实例启动... (${retries}/${maxRetries}) status: ${instance?.status}`);
          await updateTask(taskId, 20 + Math.floor(retries / 2), `等待实例启动... (${instance?.status || 'unknown'})`);
        }
      } catch (describeErr) {
        console.log(`查询实例状态失败: ${describeErr.message}`);
      }
    }
    
    if (!publicIp) {
      throw new Error('实例启动超时，请稍后重试');
    }
    
    await updateTask(taskId, 60, '实例已就绪，正在部署 OpenClaw...');
    
    const server2 = db.userServers?.find(s => s.id === serverId);
    if (server2) {
      server2.ip = publicIp;
      await saveDB(db);
    }
    
    await updateTask(taskId, 70, '等待 SSH 服务就绪...');
    await waitForSSH(publicIp, 22, SERVER_PASSWORD, 120000);
    
    await updateTask(taskId, 80, '正在部署 Docker 和 OpenClaw...');
    await deployOpenClaw(publicIp, openclawToken, openclawSession);
    
    await updateTask(taskId, 95, '验证服务状态...');
    await sleep(5000);
    
    const server3 = db.userServers?.find(s => s.id === serverId);
    if (server3) {
      server3.status = 'running';
      server3.healthCheckedAt = new Date().toISOString();
      await saveDB(db);
    }
    
    await updateTask(taskId, 100, '部署完成', 'success', {
      ip: publicIp,
      openclawUrl: `http://${publicIp}:${OPENCLAW_PORT}/${openclawSession}?token=${openclawToken}`
    });
    
    console.log(`🎉 部署完成: http://${publicIp}:${OPENCLAW_PORT}/${openclawSession}?token=${openclawToken}`);
    
  } catch (error) {
    console.error('异步部署失败:', error);
    await updateTask(taskId, 0, error.message, 'failed');
    
    const server = db.userServers?.find(s => s.id === serverId);
    if (server) {
      server.status = 'error';
      await saveDB(db);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForSSH(host, port, password, timeout = 120000) {
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (Date.now() - startTime > timeout) {
        reject(new Error('SSH 连接超时'));
        return;
      }
      
      const conn = new Client();
      
      conn.on('ready', () => {
        conn.end();
        resolve();
      });
      
      conn.on('error', (err) => {
        console.log(`SSH 未就绪，5秒后重试... (${err.message})`);
        setTimeout(tryConnect, 5000);
      });
      
      conn.connect({
        host,
        port,
        username: 'root',
        password,
        readyTimeout: 10000,
      });
    };
    
    tryConnect();
  });
}

async function deployOpenClaw(host, token, session) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      console.log('SSH 连接成功，开始部署...');
      
      const commands = `
set -e

echo "1️⃣ 检查 Docker..."
if ! command -v docker &> /dev/null; then
    echo "安装 Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl start docker
    systemctl enable docker
fi

echo "2️⃣ 停止旧容器..."
docker stop lingxi-cloud 2>/dev/null || true
docker rm lingxi-cloud 2>/dev/null || true

echo "3️⃣ 拉取镜像..."
docker pull ${ACR_REGISTRY}

echo "4️⃣ 创建配置目录..."
mkdir -p /data/lingxi/config
mkdir -p /data/lingxi/data
mkdir -p /data/lingxi/logs

echo "5️⃣ 生成配置文件..."
cat > /data/lingxi/config/openclaw.json << 'CONFIG_EOF'
{
  "agents": {
    "defaults": {
      "model": { "primary": "zhipu/glm-5" },
      "workspace": "/home/node/.openclaw/workspace",
      "memory": { "enabled": true, "provider": "local", "path": "/home/node/.openclaw/data/memory" }
    },
    "list": [{ "id": "lingxi", "default": true, "name": "灵犀", "soul": "/home/node/.openclaw/agents/lingxi/SOUL.md" }]
  },
  "tools": {
    "subagents": { "enabled": true, "tools": { "allow": ["lingxi", "coder", "ops", "inventor", "pm", "noter", "media", "smart"] } },
    "filesystem": { "enabled": true, "paths": ["/home/node/.openclaw/workspace", "/home/node/.openclaw/data"] },
    "shell": { "enabled": true, "allowed": ["ls", "cat", "grep", "find", "mkdir", "touch"] }
  },
  "skills": { "paths": ["/home/node/.openclaw/skills"] },
  "channels": {
    "feishu": {
      "accounts": { "default": { "appId": "", "appSecret": "", "domain": "feishu", "enabled": false } },
      "dmPolicy": "pairning", "groupPolicy": "open", "blockStreaming": true
    },
    "wecom": {
      "accounts": { "default": { "corpId": "", "agentId": "", "secret": "", "token": "", "encodingAesKey": "", "enabled": false } },
      "dmPolicy": "pairning", "groupPolicy": "open"
    }
  },
  "server": { "port": 18789, "host": "0.0.0.0", "cors": { "enabled": true, "origins": ["*"] } },
  "gateway": { "auth": { "token": "TOKEN_PLACEHOLDER" }, "session": { "default": "SESSION_PLACEHOLDER" }, "ui": { "embeddable": true } },
  "logging": { "level": "info", "path": "/home/node/.openclaw/logs" }
}
CONFIG_EOF

sed -i "s/TOKEN_PLACEHOLDER/${token}/g" /data/lingxi/config/openclaw.json
sed -i "s/SESSION_PLACEHOLDER/${session}/g" /data/lingxi/config/openclaw.json

echo "6️⃣ 启动容器..."
docker run -d \\
    --name lingxi-cloud \\
    -p 18789:18789 \\
    -v /data/lingxi/config:/home/node/.openclaw \\
    -v /data/lingxi/data:/home/node/.openclaw/data \\
    -v /data/lingxi/logs:/home/node/.openclaw/logs \\
    --restart unless-stopped \\
    ${ACR_REGISTRY}

echo "7️⃣ 等待服务启动..."
sleep 10

echo "8️⃣ 检查服务状态..."
curl -s http://localhost:18789/health || echo "服务启动中..."

echo "✅ 部署完成!"
`;
      
      conn.exec(commands, (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }
        
        let output = '';
        
        stream.on('close', (code, signal) => {
          conn.end();
          console.log('部署脚本输出:', output);
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`部署脚本退出码: ${code}`));
          }
        });
        
        stream.on('data', (data) => {
          output += data.toString();
          console.log(data.toString());
        });
        
        stream.stderr.on('data', (data) => {
          console.error(data.toString());
        });
      });
    });
    
    conn.on('error', (err) => {
      reject(new Error(`SSH 连接失败: ${err.message}`));
    });
    
    conn.connect({
      host,
      port: 22,
      username: 'root',
      password: SERVER_PASSWORD,
      readyTimeout: 30000,
    });
  });
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
      task: {
        id: task.id,
        status: task.status,
        progress: task.progress,
        errorMessage: task.errorMessage,
        result: task.result ? JSON.parse(task.result) : null,
        completedAt: task.completedAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
