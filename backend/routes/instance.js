/**
 * 实例管理路由
 */

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const router = express.Router();

// 配置
const INSTANCES_DIR = process.env.INSTANCES_DIR || '/data/lingxi-instances';
const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE || 'openclaw/openclaw:latest';
const BASE_PORT = parseInt(process.env.BASE_PORT || '19000');

// 实例池（内存存储，MVP 阶段够用）
let instancePool = [];
let nextPort = BASE_PORT;

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
 * 分配实例给用户
 */
router.post('/assign', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // 查找空闲实例
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
    
    res.json({
      success: true,
      instance: {
        id: instance.id,
        url: instance.url,
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
