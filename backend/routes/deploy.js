/**
 * 一键部署路由 - 阿里云 ECS 创建 + OpenClaw 部署
 * 使用打包文件方式部署，配置与代码分离
 */

import { Router } from 'express';
import { getDB, saveDB } from '../utils/db.js';
import crypto from 'crypto';
import Ecs20140526, * as $Ecs20140526 from '@alicloud/ecs20140526';
import * as $OpenApi from '@alicloud/openapi-client';
import { Client } from 'ssh2';
import { config } from '../config/index.js';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const router = Router();

// 从统一配置获取
const SERVER_PASSWORD = config.userServer.password;
const OPENCLAW_PORT = config.userServer.openclawPort;
const OPENCLAW_VERSION = '2026.2.17';

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSessionId() {
  return crypto.randomBytes(4).toString('hex');
}

function createEcsClient() {
  const clientConfig = new $OpenApi.Config({
    accessKeyId: config.aliyun.accessKeyId,
    accessKeySecret: config.aliyun.accessKeySecret,
  });
  clientConfig.endpoint = 'ecs.aliyuncs.com';
  return new Ecs20140526(clientConfig);
}

/**
 * 生成用户专属部署包
 */
async function generateUserPackage(userId, token, sessionId) {
  const installerDir = path.join(PROJECT_ROOT, 'installer');
  const releasesDir = path.join(PROJECT_ROOT, 'releases', 'users');
  
  // 确保目录存在
  if (!fs.existsSync(releasesDir)) {
    fs.mkdirSync(releasesDir, { recursive: true });
  }
  
  const packageName = `lingxi-team-${userId}-${OPENCLAW_VERSION}`;
  const packageDir = path.join(releasesDir, packageName);
  const packageFile = `${packageName}.tar.gz`;
  const packagePath = path.join(releasesDir, packageFile);
  
  // 如果包已存在，直接返回
  if (fs.existsSync(packagePath)) {
    console.log(`📦 使用已存在的部署包: ${packageFile}`);
    return { packagePath, packageName, token, sessionId };
  }
  
  console.log(`📦 生成用户部署包: ${packageName}`);
  
  // 调用打包脚本
  try {
    const scriptPath = path.join(installerDir, 'create-user-package.sh');
    execSync(`chmod +x "${scriptPath}" && "${scriptPath}" "${userId}" "${token}" "${sessionId}"`, {
      cwd: installerDir,
      stdio: 'inherit',
      timeout: 60000
    });
    
    // 检查是否生成成功
    if (!fs.existsSync(packagePath)) {
      // 脚本可能生成了不同名称的包，查找一下
      const files = fs.readdirSync(releasesDir);
      const tarFile = files.find(f => f.startsWith(`lingxi-team-${userId}`) && f.endsWith('.tar.gz'));
      if (tarFile) {
        return { 
          packagePath: path.join(releasesDir, tarFile), 
          packageName: tarFile.replace('.tar.gz', ''),
          token,
          sessionId
        };
      }
      throw new Error('打包文件生成失败');
    }
    
    return { packagePath, packageName, token, sessionId };
  } catch (error) {
    console.error('打包失败，使用快速模式:', error.message);
    // 如果打包失败，使用预置模板快速生成
    return await quickGeneratePackage(userId, token, sessionId, releasesDir);
  }
}

/**
 * 快速生成部署包（从模板复制）
 */
async function quickGeneratePackage(userId, token, sessionId, releasesDir) {
  const packageName = `lingxi-team-${userId}-${OPENCLAW_VERSION}`;
  const packageDir = path.join(releasesDir, packageName);
  const packagePath = path.join(releasesDir, `${packageName}.tar.gz`);
  const templatesDir = path.join(PROJECT_ROOT, 'backend', 'templates');
  
  // 创建目录结构 - 所有 8 个 agent
  const agents = ['main', 'coder', 'ops', 'inventor', 'pm', 'noter', 'media', 'smart'];
  for (const agent of agents) {
    fs.mkdirSync(path.join(packageDir, '.openclaw', 'agents', agent), { recursive: true });
  }
  fs.mkdirSync(path.join(packageDir, '.openclaw', 'workspace'), { recursive: true });
  
  // 复制所有 agent 的 SOUL.md
  for (const agent of agents) {
    const soulPath = path.join(templatesDir, 'agents', agent, 'SOUL.md');
    if (fs.existsSync(soulPath)) {
      fs.copyFileSync(soulPath, path.join(packageDir, '.openclaw', 'agents', agent, 'SOUL.md'));
    }
  }
  
  // 生成配置文件
  const configJson = {
    "meta": { "lastTouchedVersion": OPENCLAW_VERSION },
    "env": {
      "ZHIPU_API_KEY": "77c2b59d03e646a9884f78f8c4787885.XunhoXmFaErSD0dR",
      "DASHSCOPE_API_KEY": "sk-64985bfe63dd45e0a8e2e456624e3d21"
    },
    "auth": {
      "profiles": {
        "zhipu:default": { "provider": "zhipu", "mode": "api_key" }
      }
    },
    "models": {
      "mode": "merge",
      "providers": {
        "zhipu": {
          "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4",
          "api": "openai-completions",
          "authHeader": true,
          "models": [
            { "id": "glm-5", "name": "GLM-5", "contextWindow": 200000, "maxTokens": 8192 }
          ]
        }
      }
    },
    "agents": {
      "defaults": { "model": { "primary": "zhipu/glm-5" }, "workspace": "~/.openclaw/workspace" },
      "list": [
        { "id": "main", "default": true, "name": "灵犀", "agentDir": "~/.openclaw/agents/main", "subagents": { "allowAgents": ["coder", "ops", "inventor", "pm", "noter", "media", "smart"] } },
        { "id": "coder", "name": "云溪", "agentDir": "~/.openclaw/agents/coder" },
        { "id": "ops", "name": "若曦", "agentDir": "~/.openclaw/agents/ops" },
        { "id": "inventor", "name": "紫萱", "agentDir": "~/.openclaw/agents/inventor" },
        { "id": "pm", "name": "梓萱", "agentDir": "~/.openclaw/agents/pm" },
        { "id": "noter", "name": "晓琳", "agentDir": "~/.openclaw/agents/noter" },
        { "id": "media", "name": "音韵", "agentDir": "~/.openclaw/agents/media" },
        { "id": "smart", "name": "智家", "agentDir": "~/.openclaw/agents/smart" }
      ]
    },
    "gateway": {
      "port": 18789,
      "mode": "local",
      "bind": "lan",
      "controlUi": {
        "enabled": true,
        "basePath": sessionId,
        "allowedOrigins": ["*"],
        "allowInsecureAuth": true,
        "dangerouslyDisableDeviceAuth": true
      },
      "auth": { "mode": "token", "token": token }
    },
    "plugins": { "entries": {} }
  };
  
  fs.writeFileSync(
    path.join(packageDir, '.openclaw', 'openclaw.json'),
    JSON.stringify(configJson, null, 2)
  );
  
  // 生成部署脚本
  const deployScript = `#!/bin/bash
set -e

echo "1️⃣ 检查 Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "2️⃣ 停止旧进程..."
pkill -f openclaw 2>/dev/null || true
sleep 2

echo "3️⃣ 安装 OpenClaw..."
npm install -g openclaw@${OPENCLAW_VERSION}

echo "4️⃣ 复制配置..."
cp -r .openclaw ~/.openclaw

echo "5️⃣ 启动 Gateway..."
cd ~/.openclaw
nohup openclaw gateway > /var/log/openclaw.log 2>&1 &
sleep 5

echo "✅ 部署完成!"
`;

  fs.writeFileSync(path.join(packageDir, 'deploy-local.sh'), deployScript, { mode: 0o755 });
  
  // 打包
  execSync(`tar -czf "${packagePath}" -C "${releasesDir}" "${packageName}"`, { stdio: 'inherit' });
  
  return { packagePath, packageName, token, sessionId };
}

// ==================== 路由 ====================

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
    
    // 生成新的 Token 和 Session
    const serverId = `srv-${crypto.randomUUID().substring(0, 8)}`;
    const openclawToken = generateToken();
    const openclawSession = generateSessionId();
    
    const server = {
      id: serverId,
      userId,
      aliyunInstanceId: null,
      ip: null,
      region: config.aliyun.region,
      spec: config.aliyun.instanceType,
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
      params: JSON.stringify({ region: config.aliyun.region }),
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
    
    // 异步部署
    deployServerAsync(serverId, taskId, openclawToken, openclawSession);
    
  } catch (error) {
    console.error('一键部署失败:', error);
    res.status(500).json({ error: error.message });
  }
});

async function deployServerAsync(serverId, taskId, openclawToken, openclawSession) {
  const db = await getDB();
  
  try {
    if (!config.aliyun.accessKeyId || !config.aliyun.accessKeySecret) {
      throw new Error('阿里云密钥未配置');
    }
    
    // 0. 生成用户部署包
    await updateTask(taskId, 5, '正在生成部署包...');
    const { packagePath, packageName } = await generateUserPackage(
      serverId.replace('srv-', 'user'), 
      openclawToken, 
      openclawSession
    );
    console.log(`✅ 部署包已生成: ${packagePath}`);
    
    await updateTask(taskId, 10, '正在创建阿里云 ECS 实例...');
    
    const client = createEcsClient();
    
    const createRequest = new $Ecs20140526.CreateInstanceRequest({
      regionId: config.aliyun.region,
      instanceType: config.aliyun.instanceType,
      imageId: process.env.ALIYUN_IMAGE_ID || 'ubuntu_22_04_x64_20G_alibase_20240819.vhd',
      securityGroupId: process.env.ALIYUN_SECURITY_GROUP_ID,
      vSwitchId: process.env.ALIYUN_VSWITCH_ID,
      instanceName: `lingxi-${serverId}`,
      password: SERVER_PASSWORD,
      internetMaxBandwidthOut: config.aliyun.bandwidth,
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
      await client.startInstance(new $Ecs20140526.StartInstanceRequest({ instanceId }));
    } catch (startErr) {
      console.log('启动请求已发送，等待实例就绪...');
    }
    
    // 等待实例就绪
    let publicIp = null;
    let retries = 0;
    const maxRetries = 60;
    
    while (!publicIp && retries < maxRetries) {
      await sleep(5000);
      retries++;
      
      try {
        const describeRequest = new $Ecs20140526.DescribeInstancesRequest({
          regionId: config.aliyun.region,
          instanceIds: JSON.stringify([instanceId]),
        });
        
        const describeResponse = await client.describeInstances(describeRequest);
        const instance = describeResponse.body.instances.instance[0];
        
        if (instance && instance.status === 'Running') {
          publicIp = instance.publicIpAddress.ipAddress[0];
          console.log(`✅ 实例已运行，IP: ${publicIp}`);
        } else {
          console.log(`⏳ 等待实例启动... (${retries}/${maxRetries})`);
          await updateTask(taskId, 20 + Math.floor(retries / 2), `等待实例启动... (${instance?.status || 'unknown'})`);
        }
      } catch (describeErr) {
        console.log(`查询实例状态失败: ${describeErr.message}`);
      }
    }
    
    if (!publicIp) {
      throw new Error('实例启动超时，请稍后重试');
    }
    
    await updateTask(taskId, 60, '实例已就绪，准备部署...');
    
    const server2 = db.userServers?.find(s => s.id === serverId);
    if (server2) {
      server2.ip = publicIp;
      await saveDB(db);
    }
    
    await updateTask(taskId, 65, '等待 SSH 服务就绪...');
    await waitForSSH(publicIp, 22, SERVER_PASSWORD, 120000);
    
    await updateTask(taskId, 70, '正在上传部署包...');
    await uploadAndDeploy(publicIp, packagePath, packageName);
    
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
        console.log(`SSH 未就绪，5秒后重试...`);
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

/**
 * 上传部署包并执行部署
 * 优先使用离线包，回退到淘宝镜像
 */
async function uploadAndDeploy(host, packagePath, packageName) {
  const packageFile = `${packageName}.tar.gz`;
  const projectRoot = path.resolve(__dirname, '..', '..');
  const openclawPackagePath = path.join(projectRoot, 'releases', 'packages', 'openclaw-2026.2.17.tgz');
  const hasOfflinePackage = fs.existsSync(openclawPackagePath);
  
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      console.log('SSH 连接成功，开始部署...');
      
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }
        
        // 上传部署包
        const remotePath = `/root/${packageFile}`;
        const writeStream = sftp.createWriteStream(remotePath);
        
        writeStream.on('close', () => {
          console.log('✅ 部署包上传完成');
          
          // 决定安装命令
          let installCmd;
          if (hasOfflinePackage) {
            // 上传离线包并安装
            console.log('📦 使用离线安装包...');
            const offlineRemotePath = '/root/openclaw-2026.2.17.tgz';
            const offlineWriteStream = sftp.createWriteStream(offlineRemotePath);
            
            offlineWriteStream.on('close', () => {
              installCmd = `npm install -g /root/openclaw-2026.2.17.tgz`;
              executeDeploy(conn, packageFile, packageName, installCmd, resolve, reject);
            });
            
            offlineWriteStream.on('error', (err) => {
              console.log('⚠️ 离线包上传失败，使用淘宝镜像:', err.message);
              installCmd = `npm install -g openclaw@2026.2.17 --registry=https://registry.npmmirror.com`;
              executeDeploy(conn, packageFile, packageName, installCmd, resolve, reject);
            });
            
            fs.createReadStream(openclawPackagePath).pipe(offlineWriteStream);
          } else {
            // 使用淘宝镜像
            console.log('🌐 使用淘宝镜像安装...');
            installCmd = `npm install -g openclaw@2026.2.17 --registry=https://registry.npmmirror.com`;
            executeDeploy(conn, packageFile, packageName, installCmd, resolve, reject);
          }
        });
        
        writeStream.on('error', (err) => {
          conn.end();
          reject(new Error(`上传失败: ${err.message}`));
        });
        
        // 开始上传部署包
        const readStream = fs.createReadStream(packagePath);
        readStream.pipe(writeStream);
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

/**
 * 执行部署命令
 */
function executeDeploy(conn, packageFile, packageName, installCmd, resolve, reject) {
  const deployCommands = `
set -e

cd /root

echo "1️⃣ 解压部署包..."
tar -xzf ${packageFile}

echo "2️⃣ 检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo "安装 Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "Node 版本: $(node --version)"

echo "3️⃣ 停止旧进程..."
pkill -f openclaw 2>/dev/null || true
systemctl stop openclaw 2>/dev/null || true
sleep 2

echo "4️⃣ 安装 OpenClaw..."
${installCmd}
echo "OpenClaw 版本: $(openclaw --version)"

echo "5️⃣ 复制配置文件..."
cd ${packageName}
cp -r .openclaw ~/.openclaw

echo "6️⃣ 配置 Systemd 自动重启..."
cat > /etc/systemd/system/openclaw.service << 'SYSTEMD_EOF'
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/.openclaw
ExecStart=/usr/bin/openclaw gateway
Restart=always
RestartSec=5
StandardOutput=append:/var/log/openclaw.log
StandardError=append:/var/log/openclaw.log

[Install]
WantedBy=multi-user.target
SYSTEMD_EOF

systemctl daemon-reload
systemctl enable openclaw
systemctl start openclaw
sleep 5

echo "7️⃣ 检查服务状态..."
systemctl status openclaw --no-pager | head -5
ss -tlnp | grep 18789 || netstat -tlnp | grep 18789 || echo "端口检查完成"

echo "✅ 部署完成! (自动重启已启用)"
`;

  conn.exec(deployCommands, (err, stream) => {
    if (err) {
      conn.end();
      reject(err);
      return;
    }
    
    let output = '';
    
    stream.on('close', (code) => {
      conn.end();
      console.log('部署输出:', output);
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

// 任务状态查询
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

// 手动服务器部署（已有服务器）
router.post('/manual', async (req, res) => {
  const { userId, serverIp, sshPassword, sshPort = 22 } = req.body;
  
  if (!userId || !serverIp) {
    return res.status(400).json({ error: 'userId 和 serverIp 必填' });
  }
  
  try {
    const db = await getDB();
    const user = db.users?.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    const openclawToken = generateToken();
    const openclawSession = generateSessionId();
    const serverId = `srv-${crypto.randomUUID().substring(0, 8)}`;
    
    const server = {
      id: serverId,
      userId,
      aliyunInstanceId: null,
      ip: serverIp,
      region: 'manual',
      spec: 'manual',
      sshPort: sshPort,
      sshPassword: sshPassword || SERVER_PASSWORD,
      openclawPort: OPENCLAW_PORT,
      openclawToken,
      openclawSession,
      status: 'creating',
      healthCheckedAt: null,
      createdAt: new Date().toISOString()
    };
    
    if (!db.userServers) db.userServers = [];
    db.userServers.push(server);
    
    const taskId = `task-${crypto.randomUUID().substring(0, 8)}`;
    const task = {
      id: taskId,
      userId,
      serverId,
      taskType: 'manual_deploy',
      status: 'running',
      progress: 5,
      params: JSON.stringify({ ip: serverIp }),
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
      message: '部署已启动'
    });
    
    // 手动部署流程
    manualDeployAsync(serverId, taskId, openclawToken, openclawSession, serverIp, sshPassword || SERVER_PASSWORD, sshPort);
    
  } catch (error) {
    console.error('手动部署失败:', error);
    res.status(500).json({ error: error.message });
  }
});

async function manualDeployAsync(serverId, taskId, openclawToken, openclawSession, host, password, port) {
  try {
    // 生成部署包
    await updateTask(taskId, 10, '正在生成部署包...');
    const { packagePath, packageName } = await generateUserPackage(
      serverId.replace('srv-', 'user'), 
      openclawToken, 
      openclawSession
    );
    
    await updateTask(taskId, 30, '等待 SSH 连接...');
    await waitForSSH(host, port, password, 60000);
    
    await updateTask(taskId, 50, '正在上传部署包...');
    
    // 使用自定义密码上传部署
    await uploadAndDeployCustom(host, port, password, packagePath, packageName);
    
    await updateTask(taskId, 95, '验证服务状态...');
    await sleep(5000);
    
    const db = await getDB();
    const server = db.userServers?.find(s => s.id === serverId);
    if (server) {
      server.status = 'running';
      server.healthCheckedAt = new Date().toISOString();
      await saveDB(db);
    }
    
    await updateTask(taskId, 100, '部署完成', 'success', {
      ip: host,
      openclawUrl: `http://${host}:${OPENCLAW_PORT}/${openclawSession}?token=${openclawToken}`
    });
    
  } catch (error) {
    console.error('手动部署失败:', error);
    await updateTask(taskId, 0, error.message, 'failed');
    
    const db = await getDB();
    const server = db.userServers?.find(s => s.id === serverId);
    if (server) {
      server.status = 'error';
      await saveDB(db);
    }
  }
}

async function uploadAndDeployCustom(host, port, password, packagePath, packageName) {
  const packageFile = `${packageName}.tar.gz`;
  
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }
        
        const remotePath = `/root/${packageFile}`;
        const writeStream = sftp.createWriteStream(remotePath);
        
        writeStream.on('close', () => {
          const deployCommands = `
cd /root
tar -xzf ${packageFile}

if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

pkill -f openclaw 2>/dev/null || true
sleep 2

npm install -g openclaw@${OPENCLAW_VERSION}

cd ${packageName}
cp -r .openclaw ~/.openclaw

cd ~/.openclaw
nohup openclaw gateway > /var/log/openclaw.log 2>&1 &
sleep 5

ss -tlnp | grep 18789
`;
          
          conn.exec(deployCommands, (err, stream) => {
            if (err) {
              conn.end();
              reject(err);
              return;
            }
            
            stream.on('close', (code) => {
              conn.end();
              if (code === 0) resolve();
              else reject(new Error(`部署脚本退出码: ${code}`));
            });
            
            stream.on('data', (data) => console.log(data.toString()));
            stream.stderr.on('data', (data) => console.error(data.toString()));
          });
        });
        
        writeStream.on('error', reject);
        fs.createReadStream(packagePath).pipe(writeStream);
      });
    });
    
    conn.on('error', reject);
    
    conn.connect({
      host,
      port,
      username: 'root',
      password,
      readyTimeout: 30000,
    });
  });
}

export default router;
