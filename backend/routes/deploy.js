/**
 * 云端 OpenClaw 部署 — 阿里云 ECS + SSH 远程安装
 * 仅面向付费订阅；本机桌面包见 installer/local/
 */

import { Router } from 'express';
import { getDB, saveDB } from '../utils/db.js';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Ecs = require('@alicloud/ecs20140526');
const EcsClient = Ecs.default;
const $OpenApi = require('@alicloud/openapi-client');
const { Client: SSHClient } = require('ssh2');
import { config } from '../config/index.js';
import fs from 'fs';
import { generateCloudPackage } from '../utils/cloud-deploy-package.js';
import { buildCloudRemoteDeployScript } from '../utils/cloud-deploy-remote.js';
import { isPaidSubscription, paidSubscriptionError } from '../utils/subscription-utils.js';
import { LUME_PLUGIN_PORT } from '../utils/openclaw-deploy-constants.js';

const router = Router();

const SERVER_PASSWORD = config.userServer.password;
const OPENCLAW_PORT = config.userServer.openclawPort || 18789;

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

async function generateUserPackage(userId, token, sessionId) {
  return generateCloudPackage(userId, token, sessionId);
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

    if (!isPaidSubscription(user)) {
      const err = paidSubscriptionError();
      return res.status(err.status).json(err.body);
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
      serverInfo?.userId || serverId,
      openclawToken,
      openclawSession
    );
    console.log(`✅ 部署包已生成: ${packagePath}`);
    
    await updateTask(taskId, 10, '正在创建阿里云 ECS 实例...');
    
    const client = createEcsClient();

    await ensureSecurityGroupPorts(client);
    
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

/** 确保安全组放行 Gateway 与 Lume 插件端口（云端 lume-ws 代理需连 18790） */
async function ensureSecurityGroupPorts(client) {
  const sgId = config.aliyun.securityGroupId || process.env.ALIYUN_SECURITY_GROUP_ID;
  if (!sgId) {
    console.log('⚠️ 未配置 ALIYUN_SECURITY_GROUP_ID，跳过安全组端口放行');
    return;
  }

  const ports = [OPENCLAW_PORT, LUME_PLUGIN_PORT];
  for (const port of ports) {
    try {
      await client.authorizeSecurityGroup(
        new Ecs.AuthorizeSecurityGroupRequest({
          regionId: config.aliyun.region,
          securityGroupId: sgId,
          nicType: 'internet',
          ipProtocol: 'tcp',
          portRange: `${port}/${port}`,
          sourceCidrIp: '0.0.0.0/0',
          policy: 'accept',
          priority: '1',
        }),
      );
      console.log(`✅ 安全组已放行 TCP ${port}`);
    } catch (err) {
      const msg = err?.message || String(err);
      if (/already|duplicate|InvalidPermission\.Duplicate/i.test(msg)) {
        console.log(`ℹ️ 安全组端口 ${port} 规则已存在`);
      } else {
        console.log(`⚠️ 安全组放行 ${port} 失败: ${msg}`);
      }
    }
  }
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
  const packageFile = `${packageName}.tar.gz`;

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
  const deployCommands = buildCloudRemoteDeployScript({
    packageFile,
    packageName,
    serverIp,
    useCustomImage,
    zhipuKey: config.env?.ZHIPU_API_KEY || '',
    dashscopeKey: config.env?.DASHSCOPE_API_KEY || '',
  });

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

    if (!isPaidSubscription(user)) {
      const err = paidSubscriptionError();
      return res.status(err.status).json(err.body);
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
    const db = await getDB();
    const serverRecord = db.userServers?.find((s) => s.id === serverId);
    const packageUserId = serverRecord?.userId || serverId;

    await updateTask(taskId, 10, '正在生成部署包...');
    const { packagePath, packageName } = await generateUserPackage(
      packageUserId,
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
          executeDeploy(
            conn,
            packageFile,
            packageName,
            useCustomImage,
            host,
            resolve,
            reject,
          );
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
