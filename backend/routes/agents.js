/**
 * Agent 配置路由
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

// Agent 信息
const AGENT_INFO = {
  coder: { id: 'coder', name: '云溪', emoji: '💻', desc: '代码女王' },
  ops: { id: 'ops', name: '若曦', emoji: '📊', desc: '运营专家' },
  inventor: { id: 'inventor', name: '紫萱', emoji: '💡', desc: '创意天才' },
  pm: { id: 'pm', name: '梓萱', emoji: '🎯', desc: '产品女王' },
  noter: { id: 'noter', name: '晓琳', emoji: '📝', desc: '知识管理' },
  media: { id: 'media', name: '音韵', emoji: '🎧', desc: '多媒体专家' },
  smart: { id: 'smart', name: '智家', emoji: '🏠', desc: '智能家居' }
};

/**
 * 更新用户的 Agent 配置（不需要实例）
 */
router.post('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { agents } = req.body;
    
    if (!agents || !Array.isArray(agents)) {
      return res.status(400).json({ error: 'agents[] is required' });
    }
    
    // 确保 lingxi 始终存在
    if (!agents.includes('lingxi')) {
      agents.unshift('lingxi');
    }
    
    const { getDB, saveDB } = await import('../utils/db.js');
    const db = await getDB();
    
    const user = db.users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.agents = agents;
    user.agentsUpdatedAt = new Date().toISOString();
    
    await saveDB(db);
    
    console.log(`✅ 已更新用户 ${userId} 的团队配置: ${agents.join(', ')}`);
    
    res.json({
      success: true,
      agents: agents.map(id => {
        const info = AGENT_INFO[id];
        if (id === 'lingxi') return { id: 'lingxi', name: '灵犀', emoji: '⚡' };
        return info || { id, name: id, emoji: '🤖' };
      })
    });
  } catch (error) {
    console.error('更新用户 Agent 配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 配置 Agent
 */
router.post('/configure', async (req, res) => {
  try {
    const { instanceId, agents, skills = [] } = req.body;
    
    if (!instanceId || !agents || !Array.isArray(agents)) {
      return res.status(400).json({ error: 'instanceId and agents[] are required' });
    }
    
    console.log(`⚙️ 配置实例 ${instanceId} 的 Agent: ${agents.join(', ')}`);
    
    // 读取现有配置
    const configPath = path.join(INSTANCES_DIR, instanceId, 'config', 'openclaw.json');
    let config;
    
    try {
      const data = await fs.readFile(configPath, 'utf8');
      config = JSON.parse(data);
    } catch {
      return res.status(404).json({ error: 'Instance config not found' });
    }
    
    // 更新 agents.list
    const agentList = [
      { id: 'main', default: true, name: '灵犀', workspace: '/workspace' }
    ];
    
    for (const agentId of agents) {
      const info = AGENT_INFO[agentId];
      if (info) {
        agentList.push({
          id: agentId,
          name: info.name,
          workspace: `/workspace-${agentId}`
        });
      }
    }
    
    config.agents.list = agentList;
    
    // 更新 subagents 权限
    config.tools = config.tools || {};
    config.tools.subagents = config.tools.subagents || {};
    config.tools.subagents.tools = config.tools.subagents.tools || {};
    config.tools.subagents.tools.allow = ['main', ...agents];
    
    // 更新 main agent 的 subagents 配置
    const mainAgent = config.agents.list.find(a => a.id === 'main');
    if (mainAgent) {
      mainAgent.subagents = mainAgent.subagents || {};
      mainAgent.subagents.allowAgents = agents;
    }
    
    // 写入配置
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    console.log(`✅ 配置已更新，正在重启实例...`);
    
    // 重启实例
    await execAsync(`docker restart ${instanceId}`);
    
    // 等待就绪
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const instance = await getInstanceInfo(instanceId);
        if (instance) {
          const response = await fetch(`${instance.url}/health`);
          if (response.ok) {
            ready = true;
            break;
          }
        }
      } catch {}
    }
    
    if (!ready) {
      console.log(`⚠️ 实例重启超时，但配置已保存`);
    } else {
      console.log(`✅ 实例 ${instanceId} 重启完成`);
    }
    
    // 返回结果
    const configuredAgents = agents.map(id => AGENT_INFO[id]).filter(Boolean);
    
    res.json({
      success: true,
      instanceId,
      agents: configuredAgents,
      skills,
      restarted: ready,
      message: ready 
        ? '配置完成，团队已就绪' 
        : '配置已保存，实例正在重启'
    });
  } catch (error) {
    console.error('配置 Agent 失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取实例信息
 */
async function getInstanceInfo(instanceId) {
  // 从实例池文件读取
  try {
    const poolFile = path.join(INSTANCES_DIR, 'pool.json');
    const data = await fs.readFile(poolFile, 'utf8');
    const pool = JSON.parse(data);
    return pool.find(i => i.id === instanceId);
  } catch {
    return null;
  }
}

/**
 * 获取可用的 Agent 列表
 */
router.get('/available', (req, res) => {
  res.json({
    agents: Object.values(AGENT_INFO)
  });
});

/**
 * 获取实例的 Agent 配置
 */
router.get('/:instanceId', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const configPath = path.join(INSTANCES_DIR, instanceId, 'config', 'openclaw.json');
    
    const data = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(data);
    
    const agents = config.agents?.list || [];
    const agentDetails = agents.map(a => ({
      id: a.id,
      name: a.name,
      isDefault: a.default || false
    }));
    
    res.json({
      instanceId,
      agents: agentDetails
    });
  } catch (error) {
    res.status(404).json({ error: 'Instance not found' });
  }
});

export default router;
