/**
 * 动态调度配置工具
 * 负责生成和推送 dispatch-config.json 到用户 OpenClaw
 */
import { callOpenClawRPC } from './openclaw-rpc.js';
import fs from 'fs/promises';
import path from 'path';

const WORKFLOWS_DIR = '/root/.openclaw/workspace/skills/workflow-hub/workflows';

// Agent 角色关键词映射
const AGENT_KEYWORDS = {
  coder: { name: '云溪', role: '开发', keywords: ['代码','bug','API','架构','开发','SQL','算法','重构','调试','Git'] },
  ops: { name: '若曦', role: '运营', keywords: ['数据','报表','增长','SEO','用户','转化','留存','分析','运营'] },
  inventor: { name: '紫萱', role: '创意', keywords: ['文案','创意','营销','社媒','品牌','广告','传播','策划'] },
  pm: { name: '梓萱', role: '产品', keywords: ['需求','产品','MVP','商业','体验','功能','原型'] },
  noter: { name: '晓琳', role: '知识', keywords: ['学习','翻译','笔记','搜索','知识','文档','整理'] },
  media: { name: '音韵', role: '媒体', keywords: ['图片','视频','音乐','设计','绘图','剧本','海报'] },
  smart: { name: '智家', role: '工具', keywords: ['自动化','脚本','工具','效率','批量','处理'] },
  reviewer: { name: '清源', role: '审查', keywords: ['代码审查','质量检查','安全审计','规范检查','review'] },
  qa: { name: '知微', role: '测试', keywords: ['测试','验证','QA','功能测试','集成测试'] },
  lingxi: { name: '灵犀', role: '助手', keywords: ['调度','分发','管理','协调'] },
};

/**
 * 读取所有工作流定义
 */
async function readWorkflowDefs() {
  const files = await fs.readdir(WORKFLOWS_DIR);
  const workflows = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const content = await fs.readFile(path.join(WORKFLOWS_DIR, file), 'utf8');
    workflows.push(JSON.parse(content));
  }
  return workflows;
}

/**
 * 构建 dispatch-config.json
 * @param {Array} agents - Agent ID 列表 ['coder', 'reviewer', ...]
 * @param {Array} activeWorkflowIds - 已激活的工作流 ID ['dev-standard', ...]
 * @param {string} teamName - 团队名称
 * @returns {Object} dispatch config
 */
export async function buildDispatchConfig(agents, activeWorkflowIds, teamName) {
  // 1. 构建 agents 列表
  const agentList = agents.map(a => {
    const id = typeof a === 'string' ? a : a.id;
    const info = AGENT_KEYWORDS[id] || { name: id, role: id, keywords: [id] };
    return { id, ...info };
  });

  // 2. 读取所有工作流定义
  let allWorkflows = [];
  try {
    allWorkflows = await readWorkflowDefs();
  } catch (e) {}

  // 3. 构建 matchRules（只包含已激活的工作流）
  const matchRules = [];
  const intentMap = {};

  for (const wfId of activeWorkflowIds) {
    const wfDef = allWorkflows.find(w => w.id === wfId);
    if (!wfDef) continue;

    matchRules.push({
      workflowId: wfDef.id,
      priority: wfDef.mode === 'single-agent' ? 20 : 10,
      exactTriggers: [wfDef.name, wfDef.id],
      intentCategory: wfDef.id,
      description: wfDef.description || ''
    });

    intentMap[wfDef.id] = {
      workflow: wfDef.id,
      hint: `${wfDef.description || wfDef.name}，建议使用${wfDef.name}`
    };
  }

  // 4. 组装配置
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    team: { name: teamName || '我的团队', agents: agentList },
    workflows: { matchRules, intentMap },
    fallback: { noWorkflow: 'direct-dispatch', hint: '没有匹配的工作流，直接派发给最合适的 Agent' }
  };
}

/**
 * 推送 dispatch-config.json 到用户 OpenClaw
 * 优先用 RPC write，失败则用 chat.send
 */
export async function pushDispatchConfig(userServer, sessionKey, config) {
  const configJson = JSON.stringify(config, null, 2);

  try {
    // 方式1: 通过 chat.send 让灵犀写入文件
    await callOpenClawRPC(userServer, 'chat.send', {
      sessionKey,
      message: `请用 write 工具将以下内容写入文件 dispatch-config.json（直接写入，不要回复多余内容）：\n\n${configJson}`,
    }, { timeout: 30000 });
    console.log('✅ dispatch-config.json 已推送');
    return true;
  } catch (err) {
    console.warn('⚠️ 推送 dispatch-config.json 失败:', err.message);
    return false;
  }
}

/**
 * 从 DB 重建配置并推送（供 team.js / market.js 调用）
 */
export async function rebuildAndPushForUser(userId, db, userServer) {
  try {
    // 获取用户团队
    const user = db.users?.find(u => u.id === userId);
    if (!user) return false;

    // 兼容两种数据结构：user.team.members（新版）或 user.agents（旧版）
    let agentIds;
    let teamName;
    if (user.team?.members?.length) {
      agentIds = user.team.members.map(m => m.id);
      teamName = user.team.name;
    } else if (user.agents?.length) {
      agentIds = user.agents;
      teamName = '我的团队';
    } else {
      return false;
    }

    // 获取已激活工作流
    const activeWfIds = (db.activeWorkflows || [])
      .filter(w => w.userId === userId)
      .map(w => w.workflowId);

    // 构建配置
    const config = await buildDispatchConfig(
      agentIds,
      activeWfIds,
      teamName
    );

    // 推送
    return await pushDispatchConfig(userServer, 'openclaw-control-ui', config);
  } catch (e) {
    console.warn('⚠️ rebuildAndPush 失败:', e.message);
    return false;
  }
}
