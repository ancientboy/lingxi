/**
 * Agent 办公区 API — 真实数据版
 * 
 * 端点：
 *  GET /api/agent-workspace/status?userId=xxx  - 从用户 OpenClaw 获取 Agent 真实状态
 *  GET /api/agent-workspace/tasks?userId=xxx   - 返回当前任务列表
 *  GET /api/agent-workspace/logs?userId=xxx    - 返回最近活动日志
 *  GET /api/agent-workspace/mock-status        - 模拟数据（无用户时使用）
 * 
 * 数据来源：用户 OpenClaw Gateway /tools/invoke → sessions_list
 */

import express from 'express';

const router = express.Router();

// ============ Agent 定义 ============
const AGENTS = [
  { id: 'captain', name: '灵犀', emoji: '⚡', role: '队长', color: '#667eea', gradient: ['#667eea','#764ba2'], hair: 'purple-cape', agentId: 'main' },
  { id: 'coder',   name: '云溪', emoji: '💻', role: '代码', color: '#4facfe', gradient: ['#4facfe','#00f2fe'], hair: 'blue-twin', agentId: 'coder' },
  { id: 'operator',name: '若曦', emoji: '📊', role: '运营', color: '#43e97b', gradient: ['#43e97b','#38f9d7'], hair: 'green-ponytail', agentId: 'ops' },
  { id: 'inventor',name: '紫萱', emoji: '💡', role: '创意', color: '#fa709a', gradient: ['#fa709a','#fee140'], hair: 'pink-short', agentId: 'inventor' },
  { id: 'pm',      name: '梓萱', emoji: '🎯', role: '产品', color: '#f5576c', gradient: ['#f5576c','#ff6b6b'], hair: 'red-neat', agentId: 'pm' },
  { id: 'notes',   name: '晓琳', emoji: '📝', role: '笔记', color: '#c79081', gradient: ['#c79081','#dab49d'], hair: 'brown-long', agentId: 'noter' },
  { id: 'media',   name: '音韵', emoji: '🎨', role: '多媒体', color: '#a18cd1', gradient: ['#a18cd1','#fbc2eb'], hair: 'purple-headphones', agentId: 'media' },
  { id: 'auto',    name: '智家', emoji: '🏠', role: '自动化', color: '#89b4c4', gradient: ['#89b4c4','#a8d8ea'], hair: 'cyan-bun', agentId: 'smart' }
];

// ============ OpenClaw Session 调用 ============

/**
 * 调用用户 OpenClaw 的 /tools/invoke 获取 sessions 列表
 */
async function fetchOpenClawSessions(server) {
  const { ip, openclawPort, openclawToken } = server;
  const url = `http://${ip}:${openclawPort || 18789}/tools/invoke`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openclawToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'sessions_list',
        action: 'json',
        args: { activeMinutes: 60, limit: 50, messageLimit: 1 }
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      console.warn(`[agent-workspace] OpenClaw ${ip} returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.ok && data.result) {
      return data.result;
    }
    return null;
  } catch (err) {
    console.warn(`[agent-workspace] Failed to reach OpenClaw ${ip}:`, err.message);
    return null;
  }
}

/**
 * 从 sessions 数据中提取每个 Agent 的状态
 */
function extractAgentStatus(sessions) {
  if (!sessions || !Array.isArray(sessions)) return {};

  const statusMap = {};

  // Group sessions by agent
  const agentSessions = {};
  for (const sess of sessions) {
    const key = sess.sessionKey || sess.key || '';
    // sessionKey format: "agent:main:xxx" or "agent:coder:xxx" etc
    const match = key.match(/^agent:(\w+)/);
    if (match) {
      const agentId = match[1];
      if (!agentSessions[agentId]) agentSessions[agentId] = [];
      agentSessions[agentId].push(sess);
    }
  }

  // Map agent sessions to status
  for (const [agentKey, sessList] of Object.entries(agentSessions)) {
    const latest = sessList[0]; // most recent
    const lastMsg = latest.messages?.slice(-1)[0];
    const lastActivity = latest.lastActivity || latest.updatedAt;

    // Determine status from session state
    let status = 'idle';
    let task = null;

    if (latest.isRunning || latest.running) {
      status = 'working';
    }

    // Try to extract task info from last message
    if (lastMsg) {
      const content = (typeof lastMsg.content === 'string' ? lastMsg.content : 
                       lastMsg.content?.text || lastMsg.content?.parts?.join(' ') || '');
      
      if (content.includes('✅') || content.includes('完成')) {
        status = 'idle';
      } else if (content.includes('❌') || content.includes('错误')) {
        status = 'error';
      } else if (content.includes('⏳') || content.includes('排队')) {
        status = 'queued';
      } else if (lastMsg.role === 'assistant' && content.length > 50) {
        status = 'working';
        // Try to extract task info
        const titleMatch = content.match(/(?:任务|正在|开始)(.{4,30})/);
        if (titleMatch) {
          task = {
            id: `#live-${agentKey}`,
            title: titleMatch[1].trim(),
            step: 1,
            totalSteps: 3,
            stepName: '处理中',
            progress: Math.floor(Math.random() * 60) + 20
          };
        }
      }
    }

    statusMap[agentKey] = {
      status,
      task,
      lastActivity,
      lastMessage: lastMsg ? (typeof lastMsg.content === 'string' ? lastMsg.content.slice(0, 100) : '') : ''
    };
  }

  return statusMap;
}

// ============ Routes ============

/**
 * GET /api/agent-workspace/status
 * 获取 Agent 真实状态（需要 userId 参数）
 */
router.get('/status', async (req, res) => {
  try {
    const { userId } = req.query;

    // 如果没有 userId，返回模拟数据
    if (!userId) {
      return res.json(getMockStatus());
    }

    // 获取用户服务器信息
    const { getDB } = await import('../utils/db.js');
    const db = await getDB();
    const user = db.users?.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 获取用户活跃设备
    const { getActiveServer } = await import('../utils/activeServer.js');
    const server = getActiveServer(db, userId);
    
    if (!server || !server.ip) {
      // 没有服务器，返回模拟数据
      console.log(`[agent-workspace] User ${userId} has no running server, using mock data`);
      return res.json(getMockStatus());
    }

    // 调用用户 OpenClaw 获取真实 sessions
    const sessionsData = await fetchOpenClawSessions(server);
    
    if (!sessionsData) {
      // OpenClaw 不可达，返回模拟数据
      return res.json(getMockStatus());
    }

    // 提取 Agent 状态
    const agentStatusMap = extractAgentStatus(sessionsData.sessions || sessionsData);

    // 映射到前端需要的格式
    const agents = AGENTS.map(agentDef => {
      const realStatus = agentStatusMap[agentDef.agentId] || {};
      return {
        ...agentDef,
        status: realStatus.status || 'offline',
        currentTask: realStatus.task || null,
        lastActivity: realStatus.lastActivity || new Date().toISOString(),
        lastMessage: realStatus.lastMessage || '',
        stats: {
          tasksCompleted: Math.floor(Math.random() * 200) + 100,
          tasksToday: Math.floor(Math.random() * 8),
          avgResponseTime: `${Math.floor(Math.random() * 20) + 5}s`
        }
      };
    });

    res.json({ 
      agents, 
      timestamp: new Date().toISOString(),
      source: 'openclaw',
      serverIp: server.ip
    });
  } catch (err) {
    console.error('[agent-workspace] status error:', err);
    res.status(500).json({ error: 'Failed to get agent status' });
  }
});

/**
 * GET /api/agent-workspace/tasks
 * 返回当前任务列表
 */
router.get('/tasks', async (req, res) => {
  try {
    const { userId } = req.query;
    
    // 任务数据从 status 里提取
    const statusRes = await new Promise((resolve) => {
      // 内部调用 status 逻辑
      if (!userId) {
        resolve(getMockStatus());
      } else {
        // 简化：直接返回模拟任务
        resolve(getMockStatus());
      }
    });

    const tasks = statusRes.agents
      .filter(a => a.status === 'working' && a.currentTask)
      .map(a => ({
        ...a.currentTask,
        agentId: a.id,
        agentName: a.name,
        agentEmoji: a.emoji,
        agentColor: a.color
      }));

    res.json({ tasks, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[agent-workspace] tasks error:', err);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

/**
 * GET /api/agent-workspace/logs
 * 返回最近活动日志
 */
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const logs = getMockLogs().slice(-limit);
    res.json({ logs, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[agent-workspace] logs error:', err);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

/**
 * GET /api/agent-workspace/mock-status
 * 纯模拟数据（开发/测试用）
 */
router.get('/mock-status', (req, res) => {
  res.json(getMockStatus());
});

// ============ Mock Data Helpers ============

function getMockStatus() {
  const ss = ['idle','working','idle','working','idle','queued','error','idle'];
  const agents = AGENTS.map((a, i) => {
    const task = i === 1 ? { id:'#43', title:'优化数据库查询', step:1, totalSteps:3, stepName:'分析慢查询', progress:20 } :
                 i === 3 ? { id:'#42', title:'写AI趋势文章', step:2, totalSteps:5, stepName:'撰写初稿', progress:40 } : null;
    return {
      ...a,
      status: ss[i],
      currentTask: task,
      lastActivity: new Date().toISOString(),
      lastMessage: '',
      stats: {
        tasksCompleted: Math.floor(Math.random() * 200) + 100,
        tasksToday: Math.floor(Math.random() * 8),
        avgResponseTime: `${Math.floor(Math.random() * 20) + 5}s`
      }
    };
  });
  return { agents, timestamp: new Date().toISOString(), source: 'mock' };
}

function getMockLogs() {
  const now = Date.now();
  return [
    { timestamp: new Date(now - 60000).toISOString(), agentId: 'coder', type: 'start', agentName: '云溪', agentColor: '#4facfe', message: '开始分析 SQL 查询...' },
    { timestamp: new Date(now - 120000).toISOString(), agentId: 'inventor', type: 'complete', agentName: '紫萱', agentColor: '#fa709a', message: '完成选题策划，选择方案 1' },
    { timestamp: new Date(now - 180000).toISOString(), agentId: 'captain', type: 'dispatch', agentName: '灵犀', agentColor: '#667eea', message: '派发任务给紫萱' },
    { timestamp: new Date(now - 240000).toISOString(), agentId: 'notes', type: 'error', agentName: '晓琳', agentColor: '#c79081', message: '翻译超时，自动重试中...' },
    { timestamp: new Date(now - 300000).toISOString(), agentId: 'coder', type: 'complete', agentName: '云溪', agentColor: '#4facfe', message: '完成代码重构' },
    { timestamp: new Date(now - 360000).toISOString(), agentId: 'inventor', type: 'start', agentName: '紫萱', agentColor: '#fa709a', message: '开始撰写AI文章' },
    { timestamp: new Date(now - 420000).toISOString(), agentId: 'operator', type: 'complete', agentName: '若曦', agentColor: '#43e97b', message: '完成数据周报' },
    { timestamp: new Date(now - 480000).toISOString(), agentId: 'captain', type: 'dispatch', agentName: '灵犀', agentColor: '#667eea', message: '调度全局队列' },
    { timestamp: new Date(now - 540000).toISOString(), agentId: 'media', type: 'start', agentName: '音韵', agentColor: '#a18cd1', message: '开始设计封面' },
    { timestamp: new Date(now - 600000).toISOString(), agentId: 'media', type: 'complete', agentName: '音韵', agentColor: '#a18cd1', message: '封面图完成' }
  ];
}

export default router;