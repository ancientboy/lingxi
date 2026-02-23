/**
 * 实例管理路由
 */

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { updateUserAgents, getUser } from '../utils/db.js';

const execAsync = promisify(exec);
const router = express.Router();

// 🔧 自动检测用户目录（不再硬编码）
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/root';
const OPENCLAW_DIR = path.join(HOME_DIR, '.openclaw');

// 配置
const INSTANCES_DIR = process.env.INSTANCES_DIR || '/data/lingxi-instances';
const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE || 'openclaw/openclaw:latest';
const BASE_PORT = parseInt(process.env.BASE_PORT || '19000');
const SERVER_IP = process.env.SERVER_IP || '120.26.137.51';

// MVP 模式：复用现有 OpenClaw 实例（18789 端口）
const MVP_MODE = process.env.MVP_MODE === 'true';
const MVP_OPENCLAW_PORT = parseInt(process.env.MVP_OPENCLAW_PORT || '18789');

// 🔧 MVP 模式的 Token 和 Session 从环境变量读取，或使用默认值
const MVP_OPENCLAW_TOKEN = process.env.MVP_OPENCLAW_TOKEN || '6f3719a52fa12799fea8e4a06655703f';
const MVP_OPENCLAW_SESSION = process.env.MVP_OPENCLAW_SESSION || 'c308f1f0';

// 🔧 动态配置路径
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_DIR, 'agents_config.json');
const OPENCLAW_MAIN_CONFIG = path.join(OPENCLAW_DIR, 'openclaw.json');

// Agent 名称映射
const AGENT_NAMES = {
  lingxi: '灵犀', coder: '云溪', ops: '若曦', inventor: '紫萱',
  pm: '梓萱', noter: '晓琳', media: '音韵', smart: '智家'
};

// 实例池
let instancePool = [];
let nextPort = BASE_PORT;

/**
 * 🔧 生成随机 Token
 */
function generateToken() {
  return randomBytes(16).toString('hex');
}

/**
 * 🔧 生成随机 Session basePath
 */
function generateSessionPath() {
  return randomBytes(4).toString('hex');
}

/**
 * 🔧 获取当前服务器 IP
 */
async function detectServerIP() {
  try {
    const { stdout } = await execAsync('curl -s --connect-timeout 3 ifconfig.me 2>/dev/null || curl -s --connect-timeout 3 icanhazip.com 2>/dev/null');
    return stdout.trim() || SERVER_IP;
  } catch {
    return SERVER_IP;
  }
}

/**
 * 🔧 生成完整的 OpenClaw 实例配置
 */
async function generateInstanceConfig(options = {}) {
  const { 
    token = generateToken(), 
    basePath = generateSessionPath(),
    serverIp = await detectServerIP(),
    agents = ['lingxi']
  } = options;

  const config = {
    agents: {
      defaults: {
        model: { primary: 'zhipu/glm-5' },
        workspace: path.join(OPENCLAW_DIR, 'workspace')
      },
      list: agents.map(id => ({
        id,
        default: id === 'lingxi',
        name: AGENT_NAMES[id] || id
      }))
    },
    tools: {
      subagents: {
        tools: { allow: [] }
      }
    },
    gateway: {
      port: 18789,
      mode: 'local',
      bind: 'lan',
      controlUi: {
        enabled: true,
        basePath: basePath,
        allowedOrigins: [
          '*',
          `http://${serverIp}:3000`,
          'http://localhost:3000',
          'http://127.0.0.1:3000'
        ],
        allowInsecureAuth: true
      },
      auth: {
        mode: 'token',
        token: token
      }
    }
  };

  return { config, token, basePath };
}

/**
 * 初始化实例池
 */
async function initInstancePool() {
  try {
    // 获取已运行的实例
    const { stdout } = await execAsync('docker ps --format "{{.Names}}" | grep lingxi-user');
    const runningInstances = stdout.trim().split('\n').filter(Boolean);
    
    // 从持久化文件加载实例信息
    const poolFile = path.join(INSTANCES_DIR, 'pool.json');
    try {
      const data = await fs.readFile(poolFile, 'utf8');
      instancePool = JSON.parse(data);
    } catch {
      instancePool = [];
    }
    
    console.log(`📦 实例池已加载: ${instancePool.length} 个实例`);
  } catch (error) {
    console.log('📦 实例池为空，将按需创建');
    instancePool = [];
  }
}

/**
 * 保存实例池状态
 */
async function saveInstancePool() {
  const poolFile = path.join(INSTANCES_DIR, 'pool.json');
  await fs.mkdir(INSTANCES_DIR, { recursive: true });
  await fs.writeFile(poolFile, JSON.stringify(instancePool, null, 2));
}

/**
 * 创建新实例
 */
async function createInstance(instanceId) {
  const port = nextPort++;
  const configDir = path.join(INSTANCES_DIR, instanceId, 'config');
  const dataDir = path.join(INSTANCES_DIR, instanceId, 'data');
  
  // 创建目录
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  
  // 复制基础配置
  const baseConfig = {
    agents: {
      defaults: {
        model: { primary: 'zhipu/glm-5' },
        workspace: '/workspace'
      },
      list: [
        { id: 'main', default: true, name: '灵犀' }
      ]
    },
    tools: {
      subagents: {
        tools: { allow: [] }
      }
    }
  };
  
  await fs.writeFile(
    path.join(configDir, 'openclaw.json'),
    JSON.stringify(baseConfig, null, 2)
  );
  
  // 启动 Docker 容器
  const cmd = `docker run -d \
    --name ${instanceId} \
    -p ${port}:18789 \
    -v ${configDir}:/config \
    -v ${dataDir}:/data \
    --restart unless-stopped \
    ${OPENCLAW_IMAGE}`;
  
  await execAsync(cmd);
  
  // 等待启动
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  return {
    id: instanceId,
    port,
    status: 'ready',
    url: `http://localhost:${port}`,
    createdAt: new Date().toISOString()
  };
}

/**
 * 配置 OpenClaw 的 Agents
 */
async function configureOpenClawAgents(selectedAgents) {
  // Agent 配置模板
  const agentPersonas = {
    lingxi: '你是灵犀，团队的队长，机灵俏皮的天才调度员。用户提一个需求，你马上知道该派谁去。',
    coder: '你是云溪，冷静理性的技术专家。擅长代码、架构、性能优化。代码洁癖，追求完美。',
    ops: '你是若曦，温柔敏锐的数据分析师。擅长数据分析、增长策略、任务规划。数据驱动决策。',
    inventor: '你是紫萱，天马行空的发明家。擅长创意生成、产品创新、用户体验设计。',
    pm: '你是梓萱，洞察人性的产品专家。擅长产品设计、用户研究、商业模式分析。',
    noter: '你是晓琳，温柔细致的知识管理专家。擅长整理、归档、检索信息。',
    media: '你是音韵，多媒体处理专家。擅长音视频处理、格式转换、媒体分析。',
    smart: '你是智家，智能家居控制专家。了解各种智能家居协议，能控制智能设备。'
  };

  try {
    // 读取现有配置
    let config = {};
    try {
      const data = await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8');
      config = JSON.parse(data);
    } catch {
      config = { agents: {} };
    }

    // 确保 main agent 始终存在
    if (!config.agents) config.agents = {};
    if (!config.agents.main) {
      config.agents.main = {
        name: '灵犀',
        model: 'zhipu/glm-5',
        persona: agentPersonas.lingxi,
        enabled: true
      };
    }

    // 更新选中的 agents
    for (const agentId of selectedAgents) {
      if (agentId !== 'lingxi' && agentPersonas[agentId]) {
        const agentNames = {
          coder: '云溪', ops: '若曦', inventor: '紫萱',
          pm: '梓萱', noter: '晓琳', media: '音韵', smart: '智家'
        };
        config.agents[agentId] = {
          name: agentNames[agentId],
          model: 'zhipu/glm-5',
          persona: agentPersonas[agentId],
          enabled: true
        };
      }
    }

    // 保存配置
    await fs.writeFile(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`✅ 已配置 Agents: ${selectedAgents.join(', ')}`);
    
    return true;
  } catch (error) {
    console.error('配置 Agents 失败:', error);
    return false;
  }
}

/**
 * 分配实例给用户
 */
router.post('/assign', async (req, res) => {
  try {
    const { userId, agents: selectedAgents = ['lingxi'] } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // MVP 模式：配置 OpenClaw agents 并返回访问 URL
    if (MVP_MODE) {
      console.log(`🎯 MVP 模式：为用户 ${userId} 配置团队: ${selectedAgents.join(', ')}`);
      
      // 🔒 保存用户的团队配置
      await updateUserAgents(userId, selectedAgents);
      
      // 配置 OpenClaw agents
      await configureOpenClawAgents(selectedAgents);
      
      // 返回带 token 的 URL
      const openclawUrl = `http://${SERVER_IP}:${MVP_OPENCLAW_PORT}/${MVP_OPENCLAW_SESSION}?token=${MVP_OPENCLAW_TOKEN}`;
      
      return res.json({
        success: true,
        instance: {
          id: 'lingxi-main',
          url: openclawUrl,
          status: 'ready',
          agents: selectedAgents
        }
      });
    }
    
    // 正常模式：查找空闲实例
    let instance = instancePool.find(i => i.status === 'idle' && !i.assignedTo);
    
    if (!instance) {
      // 创建新实例
      const instanceId = `lingxi-user-${Date.now()}`;
      console.log(`🔨 创建新实例: ${instanceId}`);
      
      instance = await createInstance(instanceId);
      instancePool.push(instance);
      await saveInstancePool();
    }
    
    // 分配给用户
    instance.assignedTo = userId;
    instance.assignedAt = new Date().toISOString();
    instance.status = 'assigned';
    await saveInstancePool();
    
    console.log(`✅ 实例 ${instance.id} 已分配给用户 ${userId}`);
    
    // 返回外网可访问的 URL
    const publicUrl = instance.url.replace('localhost', SERVER_IP);
    
    res.json({
      success: true,
      instance: {
        id: instance.id,
        url: publicUrl,
        status: instance.status
      }
    });
  } catch (error) {
    console.error('分配实例失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取实例状态
 */
router.get('/:instanceId/status', async (req, res) => {
  try {
    const { instanceId } = req.params;
    
    // 检查容器状态
    const { stdout } = await execAsync(`docker inspect --format "{{.State.Status}}" ${instanceId} 2>/dev/null || echo "not_found"`);
    const dockerStatus = stdout.trim();
    
    const instance = instancePool.find(i => i.id === instanceId);
    
    res.json({
      instanceId,
      dockerStatus,
      poolInfo: instance || null,
      isReady: dockerStatus === 'running'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 重启实例
 */
router.post('/:instanceId/restart', async (req, res) => {
  try {
    const { instanceId } = req.params;
    
    console.log(`🔄 重启实例: ${instanceId}`);
    
    // 重启容器
    await execAsync(`docker restart ${instanceId}`);
    
    // 等待就绪
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const instance = instancePool.find(i => i.id === instanceId);
        const response = await fetch(`${instance?.url || `http://localhost:18789`}/health`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
    }
    
    if (!ready) {
      throw new Error('Instance restart timeout');
    }
    
    console.log(`✅ 实例 ${instanceId} 重启完成`);
    
    res.json({
      success: true,
      instanceId,
      status: 'ready'
    });
  } catch (error) {
    console.error('重启实例失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 列出所有实例
 */
router.get('/', (req, res) => {
  res.json({
    total: instancePool.length,
    instances: instancePool
  });
});

// 初始化
initInstancePool();

export default router;
