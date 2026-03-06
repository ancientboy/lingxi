/**
 * 一键部署路由 - 阿里云 ECS 创建 + OpenClaw 部署
 * 使用打包文件方式部署，配置与代码分离
 */

import { Router } from 'express';
import { getDB, saveDB } from '../utils/db.js';
import crypto from 'crypto';
// 阿里云 SDK 使用 CommonJS 方式导入
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Ecs = require('@alicloud/ecs20140526');
const EcsClient = Ecs.default;
const $OpenApi = require('@alicloud/openapi-client');
const { Client: SSHClient } = require('ssh2');
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
const OPENCLAW_VERSION = '2026.2.25';

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
  // 增加超时时间到 120 秒（阿里云 API 有时较慢）
  clientConfig.readTimeout = 120000;
  clientConfig.connectTimeout = 60000;
  return new EcsClient(clientConfig);
}

/**
 * 确保安全组规则完整
 * 检查并添加缺失的端口规则
 */
const REQUIRED_PORTS = [
  { port: 22, desc: 'SSH' },
  { port: 80, desc: 'HTTP' },
  { port: 443, desc: 'HTTPS' },
  { port: 3000, desc: '灵犀云后端' },
  { port: 8000, desc: '备用HTTP' },
  { port: 8080, desc: '备用HTTP' },
  { port: 9876, desc: '文件预览服务' },
  { port: 13000, desc: '灵犀云备用' },
  { port: 17860, desc: '其他服务' },
  { port: 18789, desc: 'OpenClaw Gateway' },
  { port: 18790, desc: 'OpenClaw备用' },
  { port: 18791, desc: 'OpenClaw备用' },
  { port: 18792, desc: 'OpenClaw备用' }
];

let securityGroupChecked = false; // 缓存检查结果，避免每次部署都检查

async function ensureSecurityGroupRules(client) {
  // 如果已经检查过，直接返回
  if (securityGroupChecked) {
    return;
  }

  const sgId = process.env.ALIYUN_SECURITY_GROUP_ID;
  const regionId = config.aliyun.region;

  if (!sgId) {
    console.log('⚠️ 未配置安全组 ID，跳过规则检查');
    return;
  }

  console.log('🔒 检查安全组规则...');

  try {
    // 获取现有规则
    const result = await client.describeSecurityGroupAttribute({
      regionId: regionId,
      securityGroupId: sgId,
      direction: 'ingress'
    });

    const permissions = result.body.permissions.permission;
    const existingPorts = permissions
      .filter(p => p.sourceCidrIp === '0.0.0.0/0' && p.ipProtocol === 'TCP')
      .map(p => parseInt(p.portRange.split('/')[0]));

    // 检查缺失的端口
    const missingPorts = REQUIRED_PORTS.filter(p => !existingPorts.includes(p.port));

    if (missingPorts.length === 0) {
      console.log('✅ 安全组规则完整');
      securityGroupChecked = true;
      return;
    }

    console.log(`🔧 发现 ${missingPorts.length} 个缺失端口，正在添加...`);

    // 添加缺失的端口
    for (const rule of missingPorts) {
      try {
        await client.authorizeSecurityGroup({
          regionId: regionId,
          securityGroupId: sgId,
          ipProtocol: 'TCP',
          portRange: `${rule.port}/${rule.port}`,
          sourceCidrIp: '0.0.0.0/0',
          description: rule.desc
        });
        console.log(`  ✅ 端口 ${rule.port} (${rule.desc})`);
      } catch (e) {
        if (e.message.includes('already exist') || e.message.includes('Duplicate')) {
          console.log(`  ⚠️ 端口 ${rule.port} 已存在`);
        } else {
          console.log(`  ❌ 端口 ${rule.port} 添加失败: ${e.message}`);
        }
      }
    }

    securityGroupChecked = true;
    console.log('✅ 安全组规则检查完成');
  } catch (e) {
    console.error('⚠️ 检查安全组规则失败:', e.message);
    // 不抛出错误，继续部署
  }
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
      "ZHIPU_API_KEY": config.env.ZHIPU_API_KEY,
      "DASHSCOPE_API_KEY": config.env.DASHSCOPE_API_KEY
    },
    "auth": {
      "profiles": {
        "zhipu:default": { "provider": "zhipu", "mode": "api_key" },
        "alibaba-cloud:default": { "provider": "alibaba-cloud", "mode": "api_key" }
      }
    },
    "models": {
      "mode": "merge",
      "providers": {
        "alibaba-cloud": {
          "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
          "api": "openai-completions",
          "models": [
            { "id": "qwen3.5-plus", "name": "通义千问3.5-Plus", "contextWindow": 262144, "maxTokens": 65536 },
            { "id": "qwen3-max-2026-01-23", "name": "通义千问3-Max", "contextWindow": 262144, "maxTokens": 65536 },
            { "id": "glm-5", "name": "GLM-5 (智谱)", "contextWindow": 200000, "maxTokens": 8192 }
          ]
        },
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
      "defaults": { "model": { "primary": "alibaba-cloud/qwen3.5-plus" }, "workspace": "~/.openclaw/workspace" },
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
        "allowedOrigins": [
          "*",
          "http://120.26.137.51:3000",
          "http://120.26.137.51",
          "http://8.219.243.199:3000",
          "http://8.219.243.199",
          "http://lumeword.com",
          "http://www.lumeword.com",
          "http://localhost:3000",
          "http://120.55.192.144:3000",
          "http://120.55.192.144",
          "http://localhost"
        ],
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

echo "5️⃣ 配置 auth-profiles.json..."
mkdir -p ~/.openclaw/agents/main/agent

# 位置1: agents/main/auth-profiles.json (主配置目录)
cat > ~/.openclaw/agents/main/auth-profiles.json << 'AUTHEOF'
{
  "version": 1,
  "profiles": {
    "zhipu:default": {
      "type": "api_key",
      "provider": "zhipu",
      "key": config.env.ZHIPU_API_KEY
    },
    "alibaba-cloud:default": {
      "type": "api_key",
      "provider": "alibaba-cloud",
      "key": config.env.DASHSCOPE_API_KEY
    }
  },
  "lastGood": {
    "zhipu": "zhipu:default",
    "alibaba-cloud": "alibaba-cloud:default"
  }
}
AUTHEOF

# 位置2: agents/main/agent/auth-profiles.json (agent子目录)
cp ~/.openclaw/agents/main/auth-profiles.json ~/.openclaw/agents/main/agent/auth-profiles.json

echo "6️⃣ 启动 Gateway..."
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
        openclawUrl: `http://${existingServer.ip}:${existingServer.openclawPort}/${existingServer.openclawSession}/?token=${existingServer.openclawToken}`,
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
    
    // 获取用户信息用于命名实例
    const serverInfo = db.userServers?.find(s => s.id === serverId);
    const userInfo = serverInfo ? db.users?.find(u => u.id === serverInfo.userId) : null;
    const userName = userInfo?.nickname || 'user';
    
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
    
    // 确保安全组规则完整（首次部署时检查）
    await ensureSecurityGroupRules(client);
    
    // 优先使用自定义镜像（预装 Node.js 22 + OpenClaw）
    const customImageId = process.env.ALIYUN_CUSTOM_IMAGE_ID;
    const useCustomImage = !!customImageId;
    
    const createRequest = new Ecs.CreateInstanceRequest({
      regionId: config.aliyun.region,
      instanceType: config.aliyun.instanceType,
      imageId: useCustomImage ? customImageId : (process.env.ALIYUN_IMAGE_ID || 'ubuntu_22_04_x64_20G_alibase_20260119.vhd'),
      securityGroupId: process.env.ALIYUN_SECURITY_GROUP_ID,
      vSwitchId: process.env.ALIYUN_VSWITCH_ID,
      instanceName: `lingxi-${userName}`,
      password: SERVER_PASSWORD,
      // 公网 IP 配置（按量付费实例需要）
      internetMaxBandwidthOut: config.aliyun.bandwidth,
      allocatePublicIp: true,
      networkChargeType: 'PayByBandwidth',
    });
    
    const createResponse = await client.createInstance(createRequest);
    const instanceId = createResponse.body.instanceId;
    
    console.log(`✅ ECS 实例已创建: ${instanceId}`);
    
    await updateTask(taskId, 20, '实例创建成功，等待初始化...');
    
    const server = db.userServers?.find(s => s.id === serverId);
    if (server) {
      server.aliyunInstanceId = instanceId;
      await saveDB(db);
    }
    
    // 等待实例初始化完成（状态从 Creating 变为 Stopped）
    console.log(`⏳ 等待实例初始化...`);
    let instanceReady = false;
    let initRetries = 0;
    const maxInitRetries = 30; // 最多等待 2.5 分钟
    
    while (!instanceReady && initRetries < maxInitRetries) {
      await sleep(5000);
      initRetries++;
      
      try {
        const describeRequest = new Ecs.DescribeInstancesRequest({
          regionId: config.aliyun.region,
          instanceIds: JSON.stringify([instanceId]),
        });
        
        const describeResponse = await client.describeInstances(describeRequest);
        const instance = describeResponse.body.instances.instance[0];
        const status = instance?.status;
        
        console.log(`  状态: ${status} (${initRetries}/${maxInitRetries})`);
        
        if (status === 'Stopped') {
          instanceReady = true;
          console.log(`✅ 实例初始化完成，准备启动...`);
        } else if (status === 'Running') {
          // 实例已经在运行（可能启动成功了）
          instanceReady = true;
          console.log(`✅ 实例已在运行中`);
        }
      } catch (err) {
        console.log(`查询状态失败: ${err.message}`);
      }
    }
    
    // 启动实例
    console.log(`🔄 正在启动实例 ${instanceId}...`);
    try {
      await client.startInstance(new Ecs.StartInstanceRequest({ instanceId }));
      console.log(`✅ 启动请求已发送`);
    } catch (startErr) {
      console.log(`⚠️ 启动请求异常: ${startErr.message}`);
      // 如果已经在运行，继续执行
    }
    
    // 等待实例进入 Running 状态
    console.log(`⏳ 等待实例进入 Running 状态...`);
    let isRunning = false;
    let runRetries = 0;
    const maxRunRetries = 60;
    
    while (!isRunning && runRetries < maxRunRetries) {
      await sleep(5000);
      runRetries++;
      
      try {
        const describeRequest = new Ecs.DescribeInstancesRequest({
          regionId: config.aliyun.region,
          instanceIds: JSON.stringify([instanceId]),
        });
        
        const describeResponse = await client.describeInstances(describeRequest);
        const instance = describeResponse.body.instances.instance[0];
        const status = instance?.status;
        
        console.log(`  状态: ${status} (${runRetries}/${maxRunRetries})`);
        
        if (status === 'Running') {
          isRunning = true;
          console.log(`✅ 实例已运行`);
        }
      } catch (err) {
        console.log(`查询状态失败: ${err.message}`);
      }
    }
    
    // 分配公网 IP
    console.log(`🌐 正在分配公网 IP...`);
    let publicIp = null;
    try {
      const allocateResponse = await client.allocatePublicIpAddress(
        new Ecs.AllocatePublicIpAddressRequest({ instanceId })
      );
      publicIp = allocateResponse.body?.ipAddress;
      console.log(`✅ 公网 IP 已分配: ${publicIp}`);
    } catch (allocErr) {
      console.log(`⚠️ 分配公网 IP 异常: ${allocErr.message}`);
      // 可能已经分配过了，尝试从实例信息中获取
    }
    
    // 如果分配失败，从实例信息中获取
    if (!publicIp) {
      let retries = 0;
      const maxRetries = 120;
      
      while (!publicIp && retries < maxRetries) {
        await sleep(5000);
        retries++;
        
        try {
          const describeRequest = new Ecs.DescribeInstancesRequest({
            regionId: config.aliyun.region,
            instanceIds: JSON.stringify([instanceId]),
          });
          
          const describeResponse = await client.describeInstances(describeRequest);
          const instance = describeResponse.body.instances.instance[0];
          
          if (instance && instance.status === 'Running') {
            // 安全获取公网 IP
            const ipList = instance.publicIpAddress?.ipAddress || [];
            publicIp = ipList[0];
            if (publicIp) {
              console.log(`✅ 获取到公网 IP: ${publicIp}`);
            } else {
              console.log(`⏳ 等待公网 IP... (${retries}/${maxRetries})`);
            }
          }
        } catch (describeErr) {
          console.log(`查询实例状态失败: ${describeErr.message}`);
        }
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
    await uploadAndDeploy(publicIp, packagePath, packageName, useCustomImage);
    
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
      openclawUrl: `http://${publicIp}:${OPENCLAW_PORT}/${openclawSession}/?token=${openclawToken}`
    });
    
    console.log(`🎉 部署完成: http://${publicIp}:${OPENCLAW_PORT}/${openclawSession}/?token=${openclawToken}`);
    
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
      
      const conn = new SSHClient();
      
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
async function uploadAndDeploy(host, packagePath, packageName, useCustomImage = false) {
  // 根据是否使用自定义镜像选择安装步骤
  const installSteps = useCustomImage ? "echo \"⚡ 使用自定义镜像，跳过安装...\"" : `
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
npm install -g openclaw@${OPENCLAW_VERSION}
`;

  const packageFile = `${packageName}.tar.gz`;
  const projectRoot = path.resolve(__dirname, '..', '..');
  const openclawPackagePath = path.join(projectRoot, 'releases', 'packages', 'openclaw-2026.2.17.tgz');
  const hasOfflinePackage = fs.existsSync(openclawPackagePath);
  
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    
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
          // 直接执行部署（OSS 加速，无需上传其他文件）
          executeDeploy(conn, packageFile, packageName, useCustomImage, host, resolve, reject);
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
      readyTimeout: 60000,
      keepaliveInterval: 10000,  // 每 10 秒发送心跳
      keepaliveCountMax: 30,      // 最多 30 次无响应后断开
    });
  });
}

/**
 * 执行部署命令
 */
function executeDeploy(conn, packageFile, packageName, useCustomImage, serverIp, resolve, reject) {
  // OSS 签名 URL（有效期 1 年：2026-02-24 ~ 2027-02-24）
  // Node.js 22 (OpenClaw 需要 >= 22.12.0)
  const NODE_URL = 'https://lume-openclaw.oss-cn-hangzhou.aliyuncs.com/packages%2Fnode22.tar.xz?Expires=1803473753&OSSAccessKeyId=LTAI5tFwob255ZynLRpQB628&Signature=85q3T7ZuqtvSCmYt2SlSgoi4jRg%3D';
  const OPENCLAW_URL = 'https://lume-openclaw.oss-cn-hangzhou.aliyuncs.com/packages%2Fopenclaw-2026.2.17.tgz?Expires=1803470246&OSSAccessKeyId=LTAI5tFwob255ZynLRpQB628&Signature=TJ5QX24i7H5dXfEbBcxdSujLHAE%3D';

  // 根据是否使用自定义镜像选择部署脚本
  const installSteps = useCustomImage ? `
echo "⚡ 使用自定义镜像，跳过 Node.js 和 OpenClaw 安装..."
echo "Node 版本: $(node --version)"
echo "OpenClaw 版本: $(openclaw --version 2>/dev/null || echo '已预装')"
` : `
echo "2️⃣ 安装 Node.js 22 (OSS 加速)..."
if ! node --version 2>/dev/null | grep -q "v22"; then
    apt-get update -qq
    apt-get install -y xz-utils
    wget -q '${NODE_URL}' -O /tmp/node22.tar.xz
    tar -xf /tmp/node22.tar.xz -C /tmp
    cp -r /tmp/node-v22.14.0-linux-x64/* /usr/local/
    rm -f /usr/bin/node /usr/bin/npm
    ln -s /usr/local/bin/node /usr/bin/node
    ln -s /usr/local/bin/npm /usr/bin/npm
    rm -rf /tmp/node22.tar.xz /tmp/node-v22.14.0-linux-x64
fi
echo "Node 版本: $(node --version)"

echo "3️⃣ 配置 git 使用 HTTPS..."
git config --global url."https://github.com/".insteadOf git@github.com:
git config --global url."https://github.com/".insteadOf ssh://git@github.com/

echo "4️⃣ 安装 OpenClaw (OSS 加速)..."
wget -q '${OPENCLAW_URL}' -O /tmp/openclaw.tgz
npm install -g /tmp/openclaw.tgz
rm -f /tmp/openclaw.tgz
echo "OpenClaw 版本: $(openclaw --version)"
`;

  const deployCommands = `
set -e

cd /root

echo "1️⃣ 解压部署包..."
tar -xzf ${packageFile}

${installSteps}

echo "5️⃣ 复制配置文件..."
cd ${packageName}
mkdir -p ~/.openclaw
cp -r .openclaw/* ~/.openclaw/

echo "6️⃣ 动态添加服务器 IP 到 allowedOrigins..."
SERVER_IP="${serverIp}"
if [ -n "$SERVER_IP" ]; then
    # 使用 Python 更新 JSON 配置
    python3 << PYEOF
import json
import os

config_file = os.path.expanduser("~/.openclaw/openclaw.json")

with open(config_file, 'r') as f:
    config = json.load(f)

# 确保 gateway.controlUi 存在
if 'gateway' not in config:
    config['gateway'] = {}
if 'controlUi' not in config['gateway']:
    config['gateway']['controlUi'] = {}
if 'allowedOrigins' not in config['gateway']['controlUi']:
    config['gateway']['controlUi']['allowedOrigins'] = []

origins = config['gateway']['controlUi']['allowedOrigins']

# 添加服务器 IP 相关的 origin
new_origins = [
    "http://${serverIp}:18789",
    "http://${serverIp}"
]

for origin in new_origins:
    if origin not in origins:
        origins.append(origin)
        print(f"添加 origin: {origin}")

with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)

print("✅ allowedOrigins 已更新")
PYEOF
fi

echo "7️⃣ 配置 auth-profiles.json (API Keys)..."
mkdir -p ~/.openclaw/agents/main/agent

# 位置1: agents/main/auth-profiles.json (主配置目录)
cat > ~/.openclaw/agents/main/auth-profiles.json << 'AUTHEOF'
{
  "version": 1,
  "profiles": {
    "zhipu:default": {
      "type": "api_key",
      "provider": "zhipu",
      "key": config.env.ZHIPU_API_KEY
    },
    "alibaba-cloud:default": {
      "type": "api_key",
      "provider": "alibaba-cloud",
      "key": config.env.DASHSCOPE_API_KEY
    }
  },
  "lastGood": {
    "zhipu": "zhipu:default",
    "alibaba-cloud": "alibaba-cloud:default"
  }
}
AUTHEOF

# 位置2: agents/main/agent/auth-profiles.json (agent子目录)
cp ~/.openclaw/agents/main/auth-profiles.json ~/.openclaw/agents/main/agent/auth-profiles.json

echo "✅ auth-profiles.json 已配置"

echo "8️⃣ 启动 OpenClaw..."
cd ~/.openclaw
killall node 2>/dev/null || true
sleep 1
nohup openclaw gateway > /var/log/openclaw.log 2>&1 &
sleep 3

echo "9️⃣ 检查服务状态..."
if pgrep -f "openclaw gateway" > /dev/null; then
    echo "✅ OpenClaw 正在运行"
    ss -tlnp | grep 18789 || echo "端口 18789 已监听"
else
    echo "❌ OpenClaw 启动失败"
    cat /var/log/openclaw.log | tail -20
    exit 1
fi

echo "✅ 部署完成!"
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
    // 检查是否使用自定义镜像
    const useCustomImage = !!process.env.ALIYUN_CUSTOM_IMAGE_ID;
    await uploadAndDeployCustom(host, port, password, packagePath, packageName, useCustomImage);
    
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
      openclawUrl: `http://${host}:${OPENCLAW_PORT}/${openclawSession}/?token=${openclawToken}`
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

async function uploadAndDeployCustom(host, port, password, packagePath, packageName, useCustomImage = false) {
  const packageFile = `${packageName}.tar.gz`;
  
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    
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
