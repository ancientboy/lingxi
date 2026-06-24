/**
 * Loop 引擎 - 灵犀云 Agent 协作编排系统
 * 
 * 功能：
 * - 定义 Loop 模板（多 Agent 协作流程）
 * - 执行 Loop（串行/并行/条件分支）
 * - 状态管理（运行中、成功、失败、待人工）
 * - 失败自动重试/回滚/升级人工
 * 
 * 与 OpenClaw 关系：
 * - OpenClaw 提供单个 Agent 的执行能力（sessions_spawn）
 * - Loop 引擎编排多个 Agent 的协作流程
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { verifyToken } from '../middleware/auth.js';
import { getDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import { callOpenClawRPC } from '../utils/openclaw-rpc.js';
import { success, errors } from '../utils/response.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ 数据存储 ============

const LOOPS_DB_PATH = path.join(__dirname, '..', 'data', 'loops.json');
const RUNS_DB_PATH = path.join(__dirname, '..', 'data', 'loop-runs.json');

function getLoopsDB() {
  try {
    if (!fs.existsSync(LOOPS_DB_PATH)) {
      return { loops: [], runs: [] };
    }
    return JSON.parse(fs.readFileSync(LOOPS_DB_PATH, 'utf8'));
  } catch (err) {
    console.error('[Loop] 读取 loops.json 失败:', err.message);
    return { loops: [], runs: [] };
  }
}

function saveLoopsDB(data) {
  fs.writeFileSync(LOOPS_DB_PATH, JSON.stringify(data, null, 2));
}

function getRunsDB() {
  try {
    if (!fs.existsSync(RUNS_DB_PATH)) {
      return { runs: [] };
    }
    return JSON.parse(fs.readFileSync(RUNS_DB_PATH, 'utf8'));
  } catch (err) {
    console.error('[Loop] 读取 loop-runs.json 失败:', err.message);
    return { runs: [] };
  }
}

function saveRunsDB(data) {
  fs.writeFileSync(RUNS_DB_PATH, JSON.stringify(data, null, 2));
}

// ============ 内置 Loop 模板 ============

const BUILTIN_LOOPS = [
  {
    id: 'dev-loop-v1',
    name: '标准开发流程',
    description: '需求拆解 → 开发 → 测试 → 审查 → 交付',
    category: '开发',
    trigger: 'manual',
    steps: [
      {
        id: 'plan',
        name: '需求拆解',
        agent: 'pm',
        task: '拆解需求，输出技术方案和任务清单',
        outputFormat: 'markdown',
        timeout: 120,
        validation: 'required_fields:plan,tasks'
      },
      {
        id: 'dev',
        name: '代码开发',
        agent: 'coder',
        task: '按技术方案实现代码，包含单元测试',
        inputFrom: 'plan',
        outputFormat: 'diff',
        timeout: 300,
        validation: 'syntax_check,tests_pass'
      },
      {
        id: 'test',
        name: '测试验证',
        agent: 'qa',
        task: '运行测试，验证功能正确性和边界情况',
        inputFrom: 'dev',
        outputFormat: 'json',
        timeout: 180,
        validation: 'all_tests_pass,coverage>80'
      },
      {
        id: 'review',
        name: '代码审查',
        agent: 'reviewer',
        task: '审查代码质量、安全性、性能',
        inputFrom: 'dev',
        condition: 'test.status == PASS',
        outputFormat: 'json',
        timeout: 120,
        validation: 'no_critical_issues'
      },
      {
        id: 'deliver',
        name: '交付',
        action: 'create_pr',
        condition: 'review.status == PASS',
        outputFormat: 'pr_link'
      }
    ],
    onFail: {
      strategy: 'retry',
      maxRetry: 2,
      retryDelay: 5,
      escalateTo: 'human'
    },
    humanCheckpoints: ['deliver']
  },
  {
    id: 'hotfix-loop-v1',
    name: '紧急修复流程',
    description: '快速修复生产问题，简化流程',
    category: '运维',
    trigger: 'manual',
    steps: [
      {
        id: 'diagnose',
        name: '问题诊断',
        agent: 'reviewer',
        task: '分析问题根因，输出修复方案',
        outputFormat: 'markdown',
        timeout: 60
      },
      {
        id: 'fix',
        name: '紧急修复',
        agent: 'coder',
        task: '按修复方案修改代码，最小改动原则',
        inputFrom: 'diagnose',
        outputFormat: 'diff',
        timeout: 120,
        validation: 'syntax_check'
      },
      {
        id: 'verify',
        name: '快速验证',
        agent: 'qa',
        task: '验证修复是否解决核心问题',
        inputFrom: 'fix',
        outputFormat: 'json',
        timeout: 60,
        validation: 'critical_path_pass'
      }
    ],
    onFail: {
      strategy: 'escalate',
      escalateTo: 'human'
    },
    humanCheckpoints: ['fix', 'verify']
  },
  {
    id: 'content-loop-v1',
    name: '内容创作流程',
    description: '选题策划 → 初稿撰写 → 审核修改 → 配图制作 → 排版发布',
    category: '内容',
    trigger: 'manual',
    steps: [
      {
        id: 'outline',
        name: '选题策划',
        agent: 'inventor',
        task: '策划选题方向，输出大纲',
        outputFormat: 'markdown',
        timeout: 600
      },
      {
        id: 'draft',
        name: '初稿撰写',
        agent: 'inventor',
        task: '根据大纲撰写初稿',
        inputFrom: 'outline',
        outputFormat: 'markdown',
        timeout: 1200
      },
      {
        id: 'revise',
        name: '审核修改',
        agent: 'inventor',
        task: '审核并修改完善',
        inputFrom: 'draft',
        outputFormat: 'markdown',
        timeout: 600
      },
      {
        id: 'media',
        name: '配图制作',
        agent: 'media',
        task: '制作配图和封面',
        inputFrom: 'revise',
        outputFormat: 'image',
        timeout: 600
      },
      {
        id: 'publish',
        name: '排版发布',
        agent: 'noter',
        task: '排版并准备发布',
        inputFrom: 'revise',
        outputFormat: 'markdown',
        timeout: 300
      }
    ],
    onFail: {
      strategy: 'retry',
      maxRetry: 1,
      escalateTo: 'human'
    },
    humanCheckpoints: ['publish']
  },
  {
    id: 'data-loop-v1',
    name: '数据分析流程',
    description: '数据收集 → 清洗 → 分析建模 → 可视化 → 报告输出',
    category: '数据',
    trigger: 'manual',
    steps: [
      {
        id: 'collect',
        name: '数据收集',
        agent: 'ops',
        task: '收集相关数据',
        outputFormat: 'json',
        timeout: 300
      },
      {
        id: 'clean',
        name: '数据清洗',
        agent: 'ops',
        task: '清洗和整理数据',
        inputFrom: 'collect',
        outputFormat: 'json',
        timeout: 300
      },
      {
        id: 'analyze',
        name: '分析建模',
        agent: 'ops',
        task: '进行数据分析和建模',
        inputFrom: 'clean',
        outputFormat: 'markdown',
        timeout: 600
      },
      {
        id: 'visualize',
        name: '可视化',
        agent: 'ops',
        task: '生成图表和可视化',
        inputFrom: 'analyze',
        outputFormat: 'image',
        timeout: 300
      },
      {
        id: 'report',
        name: '报告输出',
        agent: 'ops',
        task: '输出分析报告',
        inputFrom: 'analyze',
        outputFormat: 'markdown',
        timeout: 300
      }
    ],
    onFail: {
      strategy: 'retry',
      maxRetry: 1,
      escalateTo: 'human'
    },
    humanCheckpoints: ['report']
  }
];

// ============ 辅助函数 ============

function initBuiltinLoops() {
  const db = getLoopsDB();
  let changed = false;
  
  for (const builtin of BUILTIN_LOOPS) {
    const exists = db.loops.find(l => l.id === builtin.id);
    if (!exists) {
      db.loops.push({ ...builtin, isBuiltin: true, createdAt: new Date().toISOString() });
      changed = true;
    }
  }
  
  if (changed) {
    saveLoopsDB(db);
    console.log('[Loop] 内置模板已初始化');
  }
}

// 启动时初始化
initBuiltinLoops();

function validateLoopConfig(config) {
  if (!config.name || config.name.length > 100) {
    return { valid: false, error: '名称必填且不超过100字符' };
  }
  if (!Array.isArray(config.steps) || config.steps.length === 0) {
    return { valid: false, error: '至少需要一个步骤' };
  }
  for (const step of config.steps) {
    if (!step.id || !step.name) {
      return { valid: false, error: '步骤必须有 id 和 name' };
    }
    if (step.agent && !['pm', 'coder', 'qa', 'reviewer', 'inventor', 'noter', 'ops', 'media', 'smart'].includes(step.agent)) {
      return { valid: false, error: `未知 Agent: ${step.agent}` };
    }
  }
  return { valid: true };
}

function createRun(loop, userId, context = {}) {
  return {
    id: uuidv4(),
    loopId: loop.id,
    loopName: loop.name,
    userId,
    status: 'pending', // pending | running | paused | success | failed | human_required
    currentStep: 0,
    steps: loop.steps.map((s, i) => ({
      index: i,
      id: s.id,
      name: s.name,
      status: 'pending', // pending | running | success | failed | skipped
      result: null,
      error: null,
      startedAt: null,
      completedAt: null,
      retryCount: 0
    })),
    context: {
      ...context,
      startedAt: new Date().toISOString()
    },
    logs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function addLog(run, level, message, meta = {}) {
  run.logs.push({
    time: new Date().toISOString(),
    level,
    message,
    ...meta
  });
  run.updatedAt = new Date().toISOString();
}

// ============ API 路由 ============

// 获取所有 Loop 模板（公开接口）
router.get('/templates-public', (req, res) => {
  try {
    const db = getLoopsDB();
    const loops = db.loops.filter(l => l.isBuiltin);
    res.json({ success: true, loops });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取所有 Loop 模板
router.get('/templates', verifyToken, (req, res) => {
  try {
    const db = getLoopsDB();
    const userLoops = db.loops.filter(l => l.userId === req.userId || l.isBuiltin);
    res.json({ success: true, 
      loops: userLoops.map(l => ({
        id: l.id,
        name: l.name,
        description: l.description,
        category: l.category,
        trigger: l.trigger,
        stepCount: l.steps.length,
        isBuiltin: l.isBuiltin,
        createdAt: l.createdAt
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取单个 Loop 详情
router.get('/templates/:id', verifyToken, (req, res) => {
  try {
    const db = getLoopsDB();
    const loop = db.loops.find(l => l.id === req.params.id && (l.userId === req.userId || l.isBuiltin));
    if (!loop) {
      return res.status(404).json({ success: false, error: 'Loop 模板不存在' });
    }
    res.json({ success: true, loop });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 创建 Loop 模板
router.post('/templates', verifyToken, (req, res) => {
  try {
    const { name, description, category, trigger, steps, onFail, humanCheckpoints } = req.body;
    const config = { name, description, category, trigger, steps, onFail, humanCheckpoints };
    
    const validation = validateLoopConfig(config);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }
    
    const db = getLoopsDB();
    const userLoops = db.loops.filter(l => l.userId === req.userId && !l.isBuiltin);
    if (userLoops.length >= 20) {
      return res.status(400).json({ success: false, error: '最多创建20个自定义 Loop' });
    }
    
    const loop = {
      id: 'loop-' + uuidv4().slice(0, 8),
      ...config,
      userId: req.userId,
      isBuiltin: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    db.loops.push(loop);
    saveLoopsDB(db);
    
    res.json({ success: true, loop });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新 Loop 模板
router.put('/templates/:id', verifyToken, (req, res) => {
  try {
    const db = getLoopsDB();
    const idx = db.loops.findIndex(l => l.id === req.params.id && l.userId === req.userId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Loop 模板不存在' });
    }
    
    const validation = validateLoopConfig(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }
    
    db.loops[idx] = { ...db.loops[idx], ...req.body, updatedAt: new Date().toISOString() };
    saveLoopsDB(db);
    
    res.json({ success: true, loop: db.loops[idx] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除 Loop 模板
router.delete('/templates/:id', verifyToken, (req, res) => {
  try {
    const db = getLoopsDB();
    const idx = db.loops.findIndex(l => l.id === req.params.id && l.userId === req.userId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Loop 模板不存在' });
    }
    
    db.loops.splice(idx, 1);
    saveLoopsDB(db);
    
    res.json({ success: true, deleted: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ Loop 执行 ============

// 启动 Loop 执行
router.post('/runs', verifyToken, async (req, res) => {
  try {
    const { loopId, context = {} } = req.body;
    const db = getLoopsDB();
    const loop = db.loops.find(l => l.id === loopId && (l.userId === req.userId || l.isBuiltin));
    
    if (!loop) {
      return res.status(404).json({ success: false, error: 'Loop 模板不存在' });
    }
    
    const run = createRun(loop, req.userId, context);
    const runsDb = getRunsDB();
    runsDb.runs.push(run);
    saveRunsDB(runsDb);
    
    // 异步启动执行（不阻塞响应）
    executeLoop(run).catch(err => {
      console.error(`[Loop] 执行失败 ${run.id}:`, err.message);
    });
    
    res.json({ success: true, run: {
      id: run.id,
      status: run.status,
      loopName: run.loopName,
      currentStep: run.currentStep,
      totalSteps: run.steps.length,
      createdAt: run.createdAt
    }});
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取运行列表
router.get('/runs', verifyToken, (req, res) => {
  try {
    const runsDb = getRunsDB();
    const userRuns = runsDb.runs
      .filter(r => r.userId === req.userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);
    
    res.json({ success: true, 
      runs: userRuns.map(r => ({
        id: r.id,
        loopId: r.loopId,
        loopName: r.loopName,
        status: r.status,
        currentStep: r.currentStep,
        totalSteps: r.steps.length,
        progress: Math.round((r.steps.filter(s => s.status === 'success').length / r.steps.length) * 100),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取运行详情
router.get('/runs/:id', verifyToken, (req, res) => {
  try {
    const runsDb = getRunsDB();
    const run = runsDb.runs.find(r => r.id === req.params.id && r.userId === req.userId);
    if (!run) {
      return res.status(404).json({ success: false, error: '运行记录不存在' });
    }
    
    res.json({ success: true, run });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 人工确认（通过人工检查点）
router.post('/runs/:id/approve', verifyToken, (req, res) => {
  try {
    const { stepId, decision, feedback } = req.body;
    const runsDb = getRunsDB();
    const run = runsDb.runs.find(r => r.id === req.params.id && r.userId === req.userId);
    
    if (!run) {
      return res.status(404).json({ success: false, error: '运行记录不存在' });
    }
    
    if (run.status !== 'human_required') {
      return res.status(400).json({ success: false, error: '当前状态不需要人工确认' });
    }
    
    const step = run.steps.find(s => s.id === stepId);
    if (!step) {
      return res.status(404).json({ success: false, error: '步骤不存在' });
    }
    
    addLog(run, 'info', `人工确认: ${decision}`, { stepId, feedback });
    
    if (decision === 'approve') {
      step.status = 'success';
      run.status = 'running';
      run.currentStep++;
      
      // 继续执行
      executeLoop(run).catch(err => {
        console.error(`[Loop] 继续执行失败 ${run.id}:`, err.message);
      });
    } else if (decision === 'reject') {
      step.status = 'failed';
      step.error = feedback || '人工拒绝';
      run.status = 'failed';
    } else if (decision === 'retry') {
      step.status = 'pending';
      step.retryCount++;
      run.status = 'running';
      
      executeLoop(run).catch(err => {
        console.error(`[Loop] 重试失败 ${run.id}:`, err.message);
      });
    }
    
    saveRunsDB(runsDb);
    res.json({ success: true, run: {
      id: run.id,
      status: run.status,
      currentStep: run.currentStep
    }});
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 停止运行
router.post('/runs/:id/stop', verifyToken, (req, res) => {
  try {
    const runsDb = getRunsDB();
    const run = runsDb.runs.find(r => r.id === req.params.id && r.userId === req.userId);
    
    if (!run) {
      return res.status(404).json({ success: false, error: '运行记录不存在' });
    }
    
    if (run.status === 'success' || run.status === 'failed') {
      return res.status(400).json({ success: false, error: '运行已结束' });
    }
    
    run.status = 'failed';
    run.steps[run.currentStep].status = 'failed';
    run.steps[run.currentStep].error = '人工停止';
    addLog(run, 'warn', '运行被人工停止');
    
    saveRunsDB(runsDb);
    res.json({ success: true, run: { id: run.id, status: run.status } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ OpenClaw Agent 调用（使用 workflow-hub） ============

/**
 * 调用 OpenClaw Agent 执行 Loop 步骤
 * @param {string} userId - 用户 ID
 * @param {Object} stepConfig - 步骤配置
 * @param {Object} runContext - 运行上下文（上一步输出等）
 * @returns {Promise<Object>} { status: 'PASS'|'FAIL', output: string, artifacts: [] }
 */
async function callAgentForStep(userId, stepConfig, runContext) {
  // 1. 获取用户活跃服务器
  const db = await getDB();
  const server = getActiveServer(db, userId);
  
  if (!server) {
    throw new Error('用户未配置 OpenClaw 服务器');
  }
  
  // 2. 构建任务描述
  const task = buildAgentTask(stepConfig, runContext);
  const agentId = stepConfig.agent;
  
  console.log(`[Loop] 调用 Agent: ${agentId}, 任务: ${stepConfig.name}`);
  
  try {
    // 使用 workflow-hub 方式：sessions.create + chat.send + chat.history 轮询
    // Step 1: 创建 session
    const createRes = await callOpenClawRPC(server, 'sessions.create', {
      agentId: agentId,
      label: `loop-${runContext.loopName}-${stepConfig.name}`
    }, { timeout: 15000 });
    
    if (!createRes.ok) {
      throw new Error('创建 Agent session 失败: ' + (createRes.error?.message || 'unknown'));
    }
    
    const sessionKey = createRes.payload?.key || createRes.payload?.sessionKey;
    if (!sessionKey) {
      throw new Error('创建 session 未返回 key');
    }
    
    // Step 2: 发送任务
    const idempotencyKey = `loop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const chatRes = await callOpenClawRPC(server, 'chat.send', {
      sessionKey: sessionKey,
      message: task,
      idempotencyKey: idempotencyKey
    }, { timeout: 30000 });
    
    if (!chatRes.ok) {
      throw new Error('发送任务失败: ' + (chatRes.error?.message || 'unknown'));
    }
    
    // Step 3: 轮询等待结果
    const maxWait = (stepConfig.timeout || 120) * 1000;
    const pollInterval = 3000;
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));
      
      const historyRes = await callOpenClawRPC(server, 'chat.history', {
        sessionKey: sessionKey,
        limit: 5
      }, { timeout: 10000 });
      
      if (historyRes.ok && historyRes.payload?.messages) {
        const msgs = historyRes.payload.messages;
        const assistantMsg = msgs.find(m => m.role === 'assistant');
        if (assistantMsg) {
          // 解析 Agent 回复
          const content = extractTextContent(assistantMsg.content);
          const parsed = tryParseJSON(content);
          
          return {
            status: parsed?.status || 'PASS',
            output: parsed?.output || content,
            artifacts: parsed?.artifacts || []
          };
        }
      }
    }
    
    throw new Error('Agent 响应超时');
    
  } catch (err) {
    console.error(`[Loop] Agent 调用失败: ${err.message}`);
    throw err;
  }
}

/**
 * 从 OpenClaw 消息内容中提取文本
 */
function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(c => {
      if (typeof c === 'string') return c;
      if (c.type === 'text') return c.text;
      return JSON.stringify(c);
    }).join('\n');
  }
  return JSON.stringify(content);
}

/**
 * 尝试从文本中解析 JSON
 */
function tryParseJSON(text) {
  // 先尝试直接解析
  try { return JSON.parse(text); } catch (e) {}
  
  // 尝试从代码块中提取
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch (e) {}
  }
  
  // 尝试从文本中提取 JSON 对象
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch (e) {}
  }
  
  return null;
}

/**
 * 构建 Agent 任务描述
 */
function buildAgentTask(stepConfig, runContext) {
  let task = stepConfig.task || '';
  
  // 添加上下文信息
  if (runContext.previousOutput) {
    task += `\n\n--- 上一步输出 ---\n${runContext.previousOutput}`;
  }
  
  if (runContext.artifacts && runContext.artifacts.length > 0) {
    task += `\n\n--- 可用资源 ---\n${runContext.artifacts.map(a => `- ${a.name}: ${a.url}`).join('\n')}`;
  }
  
  // 要求 Agent 返回结构化结果
  task += `\n\n--- 输出要求 ---\n请返回以下格式的 JSON 结果（包含在代码块中）：\n\`\`\`json\n{\n  "status": "PASS", // 或 "FAIL"\n  "output": "详细执行结果...",\n  "artifacts": []\n}\n\`\`\``;
  
  return task;
}

// ============ 修改 executeStep 使用真实 Agent

async function executeLoop(run) {
  const runsDb = getRunsDB();
  const db = getLoopsDB();
  const loop = db.loops.find(l => l.id === run.loopId);
  
  if (!loop) {
    run.status = 'failed';
    addLog(run, 'error', 'Loop 模板不存在');
    saveRunsDB(runsDb);
    return;
  }
  
  run.status = 'running';
  addLog(run, 'info', `开始执行 Loop: ${loop.name}`);
  saveRunsDB(runsDb);
  
  try {
    for (let i = run.currentStep; i < loop.steps.length; i++) {
      const stepConfig = loop.steps[i];
      const step = run.steps[i];
      
      // 检查条件
      if (stepConfig.condition && !evalCondition(stepConfig.condition, run)) {
        step.status = 'skipped';
        addLog(run, 'info', `步骤跳过: ${step.name} (条件不满足)`);
        continue;
      }
      
      // 检查人工检查点
      if (loop.humanCheckpoints?.includes(stepConfig.id)) {
        run.status = 'human_required';
        addLog(run, 'info', `等待人工确认: ${step.name}`);
        saveRunsDB(runsDb);
        return; // 暂停，等待人工确认
      }
      
      // 执行步骤
      step.status = 'running';
      step.startedAt = new Date().toISOString();
      addLog(run, 'info', `执行步骤: ${step.name}`);
      saveRunsDB(runsDb);
      
      try {
        const result = await executeStep(stepConfig, run);
        step.status = 'success';
        step.result = result;
        step.completedAt = new Date().toISOString();
        addLog(run, 'info', `步骤完成: ${step.name}`);
        
        // 验证结果
        if (stepConfig.validation && !validateResult(result, stepConfig.validation)) {
          throw new Error('验证失败: ' + stepConfig.validation);
        }
        
      } catch (err) {
        step.status = 'failed';
        step.error = err.message;
        step.completedAt = new Date().toISOString();
        addLog(run, 'error', `步骤失败: ${step.name} - ${err.message}`);
        
        // 失败处理
        const handled = await handleFailure(run, step, loop.onFail);
        if (!handled) {
          run.status = 'failed';
          saveRunsDB(runsDb);
          return;
        }
      }
      
      run.currentStep = i + 1;
      saveRunsDB(runsDb);
    }
    
    run.status = 'success';
    addLog(run, 'info', 'Loop 执行完成');
    
  } catch (err) {
    run.status = 'failed';
    addLog(run, 'error', `执行异常: ${err.message}`);
  }
  
  saveRunsDB(runsDb);
}

async function executeStep(stepConfig, run) {
  // 获取上一步输出作为上下文
  const previousStep = run.currentStep > 0 ? run.steps[run.currentStep - 1] : null;
  const previousOutput = previousStep?.result?.output || '';
  
  const runContext = {
    loopName: run.loopName,
    previousOutput,
    artifacts: previousStep?.result?.artifacts || []
  };
  
  // 调用真实 Agent
  return await callAgentForStep(run.userId, stepConfig, runContext);
}

function evalCondition(condition, run) {
  // 简单条件解析：step.status == PASS
  try {
    const parts = condition.split('==').map(s => s.trim());
    if (parts.length === 2) {
      const [ref, expected] = parts;
      const [stepId, field] = ref.split('.');
      const step = run.steps.find(s => s.id === stepId);
      if (step && step.result) {
        return step.result[field] === expected.replace(/['"]/g, '');
      }
    }
    return true;
  } catch {
    return true;
  }
}

function validateResult(result, validation) {
  // 简单验证逻辑
  if (validation.includes('required_fields')) {
    return result && result.status === 'PASS';
  }
  return true;
}

async function handleFailure(run, step, onFail) {
  if (!onFail) return false;
  
  if (step.retryCount < (onFail.maxRetry || 0)) {
    step.retryCount++;
    addLog(run, 'info', `自动重试 (${step.retryCount}/${onFail.maxRetry})`);
    
    // 延迟重试
    await new Promise(r => setTimeout(r, (onFail.retryDelay || 5) * 1000));
    
    step.status = 'pending';
    return true; // 继续执行
  }
  
  if (onFail.escalateTo === 'human') {
    run.status = 'human_required';
    addLog(run, 'warn', '升级人工处理');
    return false; // 暂停，等待人工
  }
  
  return false;
}

export default router;
