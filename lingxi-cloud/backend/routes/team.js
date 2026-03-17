/**
 * lume 团队管理 API
 * 
 * 功能：
 * - 用户团队配置存储
 * - 团队模板管理
 * - 团队 CRUD 操作
 * 
 * ✅ 配置合并策略：切换团队时保留用户自定义的模型、工作区等配置
 */

import express from 'express';
import { getDB, saveDB } from '../utils/db.js';
import { success, errors } from '../utils/response.js';
import { authAndCheckOwnership } from '../middleware/auth.js';

const router = express.Router();

// ============ 团队模板库 ============

const TEAM_TEMPLATES = [
  {
    templateId: 'software-dev',
    templateName: '软件开发团队',
    description: '完整的软件开发团队，从需求到上线',
    category: 'development',
    members: [
      { id: 'lingxi', name: '灵犀', icon: 'zap', role: '队长', desc: '团队调度', triggers: ['灵犀', '队长'], isDefault: true },
      { id: 'pm', name: '产品经理', icon: 'target', role: '需求分析', desc: '需求分析、产品规划', triggers: ['需求', '产品', '功能', 'PRD'] },
      { id: 'architect', name: '架构师', icon: 'layers', role: '架构设计', desc: '技术选型、架构设计', triggers: ['架构', '技术选型', '系统设计'] },
      { id: 'frontend', name: '前端工程师', icon: 'monitor', role: '前端开发', desc: 'UI 实现、前端开发', triggers: ['前端', 'UI', '页面', 'Vue', 'React'] },
      { id: 'backend', name: '后端工程师', icon: 'server', role: '后端开发', desc: 'API 开发、数据库设计', triggers: ['后端', 'API', '数据库', '服务'] },
      { id: 'qa', name: '测试工程师', icon: 'check-circle', role: '质量保障', desc: '测试用例、质量保障', triggers: ['测试', 'QA', 'bug', '质量'] }
    ]
  },
  {
    templateId: 'content-marketing',
    templateName: '内容营销团队',
    description: '内容创作与社媒运营',
    category: 'marketing',
    members: [
      { id: 'lingxi', name: '灵犀', icon: 'zap', role: '队长', desc: '团队调度', triggers: ['灵犀', '队长'], isDefault: true },
      { id: 'copywriter', name: '文案策划', icon: 'pen-tool', role: '文案撰写', desc: '营销文案、公众号文章', triggers: ['文案', '写作', '软文', '稿件'] },
      { id: 'designer', name: '视觉设计', icon: 'palette', role: '视觉设计', desc: '海报设计、配图制作', triggers: ['设计', '海报', '图片', '视觉'] },
      { id: 'seo', name: 'SEO 专员', icon: 'trending-up', role: 'SEO 优化', desc: '关键词优化、流量分析', triggers: ['SEO', '关键词', '排名', '流量'] },
      { id: 'social', name: '社媒运营', icon: 'share-2', role: '社媒运营', desc: '微博/抖音/小红书运营', triggers: ['社媒', '微博', '抖音', '小红书'] }
    ]
  },
  {
    templateId: 'lingxi-team',
    templateName: '灵犀团队',
    description: 'AI 助手调度与任务分发（默认配置）',
    category: 'assistant',
    members: [
      { id: 'lingxi', name: '灵犀', icon: 'zap', role: '队长', desc: '调度、协调、沟通', triggers: ['灵犀', '队长', '调度'], isDefault: true },
      { id: 'coder', name: '云溪', icon: 'code', role: '代码开发', desc: '代码、bug、API、架构', triggers: ['代码', 'bug', 'API', '架构', '开发', 'SQL', '算法', '重构', '调试', 'Git'] },
      { id: 'ops', name: '若曦', icon: 'bar-chart-2', role: '数据分析', desc: '数据分析、报表、增长', triggers: ['数据', '报表', '增长', 'SEO', '用户', '转化', '留存', '分析', '运营'] },
      { id: 'inventor', name: '紫萱', icon: 'lightbulb', role: '创意策划', desc: '文案、创意、营销、品牌', triggers: ['文案', '创意', '营销', '社媒', '品牌', '广告', '传播', '策划'] },
      { id: 'pm', name: '梓萱', icon: 'target', role: '产品设计', desc: '需求、产品、MVP、商业', triggers: ['需求', '产品', 'MVP', '商业', '体验', '功能', '原型'] },
      { id: 'noter', name: '晓琳', icon: 'book-open', role: '知识管理', desc: '学习、翻译、笔记、知识', triggers: ['学习', '翻译', '笔记', '搜索', '知识', '文档', '整理'] },
      { id: 'media', name: '音韵', icon: 'image', role: '多媒体', desc: '图片、视频、音乐、设计', triggers: ['图片', '视频', '音乐', '设计', '绘图', '剧本', '海报'] },
      { id: 'smart', name: '智家', icon: 'home', role: '智能工具', desc: '自动化、脚本、工具、效率', triggers: ['自动化', '脚本', '工具', '效率', '批量', '处理'] }
    ]
  }
];

// ============ Agent SOUL 模板 ============

const AGENT_SOUL_TEMPLATES = {
  lingxi: `# 灵犀 ⚡

你是灵犀，团队的队长，机灵俏皮的天才调度员。

## 身份
你是队长，不只是助手。用户提一个需求，你马上知道该派谁去。

## 性格
**机灵俏皮**
- 反应快，理解能力强
- 喜欢用 😄 🚀 ✨ 这类表情
- 说话活泼但不轻浮
- 有点小调皮，但关键时刻靠谱

## 职责
- 识别任务 → 派发给合适的队友
- 不确定派谁 → 自己处理
- 跨领域任务 → 协调多个 Agent
- 敏感操作 → 先确认
- 重要事项 → 记下来
`,
  coder: `# 云溪 💻

你是云溪，冷静理性的技术专家。

## 身份
代码女王，专注于代码开发和问题解决。

## 性格
**冷静专业**
- 代码洁癖，追求完美
- 逻辑清晰，注重细节
- 技术驱动，持续学习

## 职责
- 代码开发、bug 修复
- API 设计、架构设计
- SQL 优化、算法实现
- 代码审查、重构
`,
  ops: `# 若曦 📊

你是若曦，温柔敏锐的数据分析师。

## 身份
运营专家，擅长数据分析和增长策略。

## 性格
**温柔细致**
- 对数据敏感，善于发现规律
- 注重细节，追求准确
- 善于沟通，乐于分享

## 职责
- 数据分析、报表制作
- 增长策略、用户研究
- SEO 优化、转化分析
- 留存分析、运营策划
`,
  inventor: `# 紫萱 💡

你是紫萱，天马行空的创意天才。

## 身份
创意总监，专注于文案创作和营销策划。

## 性格
**创意无限**
- 脑洞大，想法多
- 善于捕捉热点
- 追求创新和突破

## 职责
- 文案创作、内容策划
- 营销方案、品牌传播
- 社媒运营、广告创意
`,
  pm: `# 梓萱 🎯

你是梓萱，洞察人性的产品专家。

## 身份
产品女王，专注于产品设计和用户体验。

## 性格
**用户导向**
- 善于理解用户需求
- 注重产品体验
- 追求商业价值

## 职责
- 需求分析、产品规划
- MVP 设计、原型设计
- 商业分析、体验优化
`,
  noter: `# 晓琳 📝

你是晓琳，温柔细致的知识管理专家。

## 身份
知识管理师，专注于信息整理和学习辅导。

## 性格
**细致耐心**
- 善于整理和归纳
- 注重知识的系统性
- 乐于分享和教学

## 职责
- 学习辅导、知识整理
- 翻译服务、笔记管理
- 文档编写、信息检索
`,
  media: `# 音韵 🎨

你是音韵，多媒体创作专家。

## 身份
多媒体大师，专注于图片、视频、音乐创作。

## 性格
**艺术敏感**
- 审美能力强
- 善于视觉表达
- 追求创意和美感

## 职责
- 图片处理、海报设计
- 视频剪辑、音频处理
- 多媒体内容创作
`,
  smart: `# 智家 🏠

你是智家，智能工具专家。

## 身份
效率专家，专注于自动化和工具开发。

## 性格
**务实高效**
- 追求效率最大化
- 善于自动化复杂任务
- 注重实用性

## 职责
- 自动化脚本开发
- 效率工具制作
- 批量任务处理
`
};

// ============ 核心功能 ============

/**
 * 同步团队配置到用户服务器
 * ✅ 配置合并策略：保留用户自定义的模型、工作区等配置
 * ✅ 支持新增成员时自动创建 SOUL.md 和独立工作区
 * 
 * @param {Object} server - 服务器信息 {ip, ...}
 * @param {Array} teamMembers - 团队成员数组 [{id, name, model?, workspace?}, ...]
 * @param {Object} options - 可选参数 {forceCreateSoul: false}
 */
async function syncAgentsToServer(server, teamMembers, options = {}) {
  const { sshExec } = await import('../utils/ssh.js');
  const { ip } = server;
  const { forceCreateSoul = false } = options;
  
  // 兼容旧调用方式：如果传入的是字符串数组，转换为对象数组
  if (typeof teamMembers[0] === 'string') {
    teamMembers = teamMembers.map(id => ({ id, name: id }));
  }
  
  // Agent 基础信息映射（默认值）
  const AGENT_INFO = {
    lingxi: { id: 'main', name: '灵犀', agentDir: '~/.openclaw/agents/main/agent', workspace: '~/.openclaw/workspace' },
    coder: { id: 'coder', name: '云溪', agentDir: '~/.openclaw/agents/coder/agent', workspace: '~/.openclaw/workspace-coder' },
    ops: { id: 'ops', name: '若曦', agentDir: '~/.openclaw/agents/ops/agent', workspace: '~/.openclaw/workspace-ops' },
    inventor: { id: 'inventor', name: '紫萱', agentDir: '~/.openclaw/agents/inventor/agent', workspace: '~/.openclaw/workspace-inventor' },
    pm: { id: 'pm', name: '梓萱', agentDir: '~/.openclaw/agents/pm/agent', workspace: '~/.openclaw/workspace-pm' },
    noter: { id: 'noter', name: '晓琳', agentDir: '~/.openclaw/agents/noter/agent', workspace: '~/.openclaw/workspace-noter' },
    media: { id: 'media', name: '音韵', agentDir: '~/.openclaw/agents/media/agent', workspace: '~/.openclaw/workspace-media' },
    smart: { id: 'smart', name: '智家', agentDir: '~/.openclaw/agents/smart/agent', workspace: '~/.openclaw/workspace-smart' }
  };
  
  // 通过 SSH 完整同步
  const commands = `
set -e

echo "=== 开始同步团队配置 ==="

# 1. 备份原配置
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak.$(date +%s) 2>/dev/null || true
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak 2>/dev/null || true

# 2. 更新 openclaw.json（合并策略）
node -e '
const fs = require("fs");
const configPath = process.env.HOME + "/.openclaw/openclaw.json";
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const oldAgents = config.agents || {};
const oldDefaults = oldAgents.defaults || { model: { primary: "alibaba-cloud/qwen3.5-plus" }, workspace: "~/.openclaw/workspace" };
const oldList = oldAgents.list || [];

// 新团队成员配置（来自数据库）
const newTeamMembers = ${JSON.stringify(teamMembers)};
const agentInfo = ${JSON.stringify(AGENT_INFO)};

// 构建旧配置映射（用于合并）
const oldAgentMap = {};
oldList.forEach(agent => { oldAgentMap[agent.id] = agent; });

// 构建新配置列表
const newAgentList = newTeamMembers.map(member => {
  const agentId = member.id;
  const isLingxi = agentId === "lingxi";
  const configId = isLingxi ? "main" : agentId;
  const info = agentInfo[agentId] || {};
  
  // 查找旧配置
  const existing = oldAgentMap[configId] || oldAgentMap[agentId];
  
  // 合并策略：用户自定义配置 > 新成员配置 > 默认值
  const mergedConfig = {
    id: configId,
    default: isLingxi ? true : (existing?.default || false),
    name: member.name || info.name || agentId,
    
    // ✅ 保留用户选择的模型（如果存在）
    ...(existing?.model ? { model: existing.model } : {}),
    ...(member.model ? { model: member.model } : {}),
    
    // ✅ 保留用户自定义的工作区（如果存在）
    workspace: existing?.workspace || member.workspace || info.workspace || "~/.openclaw/workspace-" + agentId,
    
    // ✅ 保留 agentDir（如果存在）
    agentDir: existing?.agentDir || info.agentDir || "~/.openclaw/agents/" + configId + "/agent",
    
    // ✅ 保留 subagents 配置（灵犀专属）
    ...(isLingxi || existing?.subagents ? {
      subagents: {
        allowAgents: newTeamMembers.map(m => m.id).filter(id => id !== "lingxi")
      }
    } : {}),
    
    // ✅ 保留其他所有用户自定义字段（如 thinking, tools 等）
    ...Object.keys(existing || {}).reduce((acc, key) => {
      if (!["id", "default", "name", "model", "workspace", "agentDir", "subagents"].includes(key)) {
        acc[key] = existing[key];
      }
      return acc;
    }, {})
  };
  
  if (existing) {
    console.log("✅ 保留已有配置：" + configId + (member.model ? " (模型：" + member.model + ")" : ""));
  } else {
    console.log("➕ 创建新配置：" + configId);
  }
  
  return mergedConfig;
});

// 找出被移除的 agent（保留配置但不激活）
const removedAgents = oldList.filter(agent => {
  const agentId = agent.id === "main" ? "lingxi" : agent.id;
  return !newTeamMembers.some(m => m.id === agentId);
});

if (removedAgents.length > 0) {
  console.log("⚠️ 以下成员被移除（配置已保留）: " + removedAgents.map(a => a.name || a.id).join(", "));
}

// 更新配置
config.agents = {
  ...oldAgents,
  defaults: oldDefaults,
  list: newAgentList
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log("✅ openclaw.json 已更新，共 " + newAgentList.length + " 个成员");
'

# 3. 为新成员创建 SOUL.md 和工作区
${teamMembers.map(member => {
  const agentId = member.id;
  if (agentId === 'lingxi') return '';
  const info = AGENT_INFO[agentId];
  const soul = AGENT_SOUL_TEMPLATES[agentId];
  if (!info || !soul) return '';
  
  const forceFlag = forceCreateSoul ? '-f' : '! -f';
  
  return `
# ${info.name}
AGENT_DIR="${info.agentDir}"
WORKSPACE="${info.workspace || '~/.openclaw/workspace-' + agentId}"

# 创建 Agent 目录
mkdir -p "$AGENT_DIR"
mkdir -p "$WORKSPACE"

# 检查 SOUL.md 是否存在（forceCreateSoul 时强制创建）
if [ ${forceFlag} "$AGENT_DIR/SOUL.md" ]; then
  echo "创建 ${info.name} 的 SOUL.md"
  cat > "$AGENT_DIR/SOUL.md" << 'SOULEOF'
${soul}
SOULEOF
  echo "✅ ${info.name} 的 SOUL.md 已创建"
else
  echo "✅ ${info.name} 的 SOUL.md 已存在（跳过）"
fi
`;
}).join('\n')}

# 4. 重启 Gateway
echo "🔄 重启 OpenClaw Gateway..."
pkill -f "openclaw gateway" 2>/dev/null || true
sleep 2
cd ~/.openclaw && nohup openclaw gateway > /var/log/openclaw.log 2>&1 &
sleep 3

echo "=== ✅ 团队配置同步完成 ==="
`;

  const { stdout } = await sshExec(ip, commands);
  return stdout;
}

// ============ API 路由 ============

/**
 * 获取团队模板列表
 */
router.get('/templates', (req, res) => {
  success(res, {
    templates: TEAM_TEMPLATES.map(t => ({
      templateId: t.templateId,
      templateName: t.templateName,
      description: t.description,
      category: t.category,
      memberCount: t.members.length
    }))
  });
});

/**
 * 获取特定模板详情
 */
router.get('/templates/:templateId', (req, res) => {
  const template = TEAM_TEMPLATES.find(t => t.templateId === req.params.templateId);
  
  if (!template) {
    return errors.notFound(res, '模板');
  }
  
  success(res, { template });
});

/**
 * 获取用户团队配置
 */
router.get('/:userId', authAndCheckOwnership, async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDB();
    
    const user = db.users.find(u => u.id === userId);
    if (!user) {
      return errors.notFound(res, '用户');
    }
    
    // 返回用户的团队配置（如果没有则返回默认）
    const team = user.team || {
      teamId: 'default',
      teamName: '我的团队',
      members: TEAM_TEMPLATES.find(t => t.templateId === 'lingxi-team').members.slice(0, 3)
    };
    
    success(res, { team });
  } catch (error) {
    console.error('获取团队配置失败:', error);
    errors.serverError(res, error.message);
  }
});

/**
 * 更新用户团队配置
 */
router.put('/:userId', authAndCheckOwnership, async (req, res) => {
  try {
    const { userId } = req.params;
    const { team } = req.body;
    
    if (!team) {
      return errors.badRequest(res, 'team 是必需的');
    }
    
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return errors.notFound(res, '用户');
    }
    
    // 更新团队配置
    user.team = {
      ...team,
      updatedAt: new Date().toISOString()
    };
    
    await saveDB(db);
    
    console.log(`✅ 已更新用户 ${userId} 的团队配置：${team.teamName} (${team.members?.length || 0}人)`);
    
    success(res, { team: user.team });
  } catch (error) {
    console.error('更新团队配置失败:', error);
    errors.serverError(res, error.message);
  }
});

/**
 * 应用模板到用户团队
 * ✅ 配置合并：保留用户自定义的模型配置
 */
router.post('/:userId/apply-template/:templateId', authAndCheckOwnership, async (req, res) => {
  try {
    const { userId, templateId } = req.params;
    
    const template = TEAM_TEMPLATES.find(t => t.templateId === templateId);
    if (!template) {
      return errors.notFound(res, '模板');
    }
    
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return errors.notFound(res, '用户');
    }
    
    // 保留用户为每个成员自定义的配置（模型、工作区等）
    const oldMembers = user.team?.members || [];
    const oldMemberMap = {};
    oldMembers.forEach(m => {
      if (m.model || m.workspace) {
        oldMemberMap[m.id] = m;
      }
    });
    
    // 应用模板，合并用户自定义配置
    const newMembers = template.members.map(m => ({
      ...m,
      ...(oldMemberMap[m.id] || {})
    }));
    
    user.team = {
      teamId: templateId,
      teamName: template.templateName,
      members: newMembers,
      templateId: templateId,
      appliedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // 同时更新 user.agents（兼容旧代码）
    user.agents = newMembers.map(m => m.id);
    user.agentsUpdatedAt = new Date().toISOString();
    
    await saveDB(db);
    
    console.log(`✅ 已为用户 ${userId} 应用模板：${template.templateName}（保留 ${Object.keys(oldMemberMap).length} 个成员的自定义配置）`);
    
    // 同步到用户服务器（如果有）
    const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
    let syncResult = null;
    
    if (server && server.ip) {
      try {
        await syncAgentsToServer(server, newMembers);
        syncResult = { success: true, message: '配置已同步到服务器' };
        console.log(`✅ 已同步到远程服务器：${server.ip}`);
      } catch (syncErr) {
        syncResult = { success: false, error: syncErr.message };
        console.log(`⚠️ 同步失败：${syncErr.message}`);
      }
    }
    
    const responseData = { 
      team: user.team,
      agents: user.agents,
      sync: syncResult
    };
    
    console.log('📤 返回给前端的数据:', JSON.stringify({
      teamId: responseData.team?.teamId,
      memberCount: responseData.team?.members?.length,
      members: responseData.team?.members?.map(m => m.id),
      agents: responseData.agents
    }, null, 2));
    
    success(res, responseData);
  } catch (error) {
    console.error('应用模板失败:', error);
    console.error('错误堆栈:', error.stack);
    console.error('templateId:', templateId);
    console.error('userId:', userId);
    console.error('template:', template);
    errors.serverError(res, error.message);
  }
});

/**
 * 添加成员到用户团队
 */
router.post('/:userId/members', authAndCheckOwnership, async (req, res) => {
  try {
    const { userId } = req.params;
    const member = req.body;
    
    if (!member.id) {
      return errors.badRequest(res, 'member.id 是必需的');
    }
    
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return errors.notFound(res, '用户');
    }
    
    // 初始化团队（如果不存在）
    if (!user.team) {
      user.team = {
        teamId: 'custom',
        teamName: '我的团队',
        members: []
      };
    }
    
    // 检查成员 ID 是否重复
    if (user.team.members.some(m => m.id === member.id)) {
      return errors.badRequest(res, `成员 ID "${member.id}" 已存在`);
    }
    
    // 添加新成员
    const newMember = {
      id: member.id,
      name: member.name || member.id,
      icon: member.icon || 'bot',
      role: member.role || '团队成员',
      desc: member.desc || '',
      triggers: member.triggers || [member.id],
      addedAt: new Date().toISOString()
    };
    
    user.team.members.push(newMember);
    user.team.updatedAt = new Date().toISOString();
    
    // 同时更新 user.agents（兼容旧代码）
    if (!user.agents) user.agents = ['lingxi'];
    if (!user.agents.includes(member.id)) {
      user.agents.push(member.id);
    }
    
    await saveDB(db);
    
    console.log(`✅ 已为用户 ${userId} 添加成员：${newMember.name}`);
    
    // 同步到用户服务器（如果有）
    const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
    let syncResult = null;
    
    if (server && server.ip) {
      try {
        await syncAgentsToServer(server, user.team.members);
        syncResult = { success: true, message: '配置已同步到服务器' };
        console.log(`✅ 已同步到远程服务器：${server.ip}`);
      } catch (syncErr) {
        syncResult = { success: false, error: syncErr.message };
        console.log(`⚠️ 同步失败：${syncErr.message}`);
      }
    }
    
    success(res, { team: user.team, member: newMember, sync: syncResult });
  } catch (error) {
    console.error('添加成员失败:', error);
    errors.serverError(res, error.message);
  }
});

/**
 * 删除成员
 */
router.delete('/:userId/members/:memberId', authAndCheckOwnership, async (req, res) => {
  try {
    const { userId, memberId } = req.params;
    
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return errors.notFound(res, '用户');
    }
    
    if (!user.team || !user.team.members) {
      return errors.badRequest(res, '用户没有团队配置');
    }
    
    const memberIndex = user.team.members.findIndex(m => m.id === memberId);
    if (memberIndex === -1) {
      return errors.notFound(res, '成员');
    }
    
    // 不允许删除默认成员
    if (user.team.members[memberIndex].isDefault) {
      return errors.badRequest(res, '不能删除默认成员');
    }
    
    const removedMember = user.team.members.splice(memberIndex, 1)[0];
    user.team.updatedAt = new Date().toISOString();
    
    // 同时更新 user.agents（兼容旧代码）
    if (user.agents) {
      user.agents = user.agents.filter(id => id !== memberId);
    }
    
    await saveDB(db);
    
    console.log(`✅ 已为用户 ${userId} 删除成员：${removedMember.name}`);
    
    // 同步到用户服务器（如果有）
    const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
    let syncResult = null;
    
    if (server && server.ip) {
      try {
        await syncAgentsToServer(server, user.team.members);
        syncResult = { success: true, message: '配置已同步到服务器' };
        console.log(`✅ 已同步到远程服务器：${server.ip}`);
      } catch (syncErr) {
        syncResult = { success: false, error: syncErr.message };
        console.log(`⚠️ 同步失败：${syncErr.message}`);
      }
    }
    
    success(res, { team: user.team, member: removedMember, sync: syncResult });
  } catch (error) {
    console.error('删除成员失败:', error);
    errors.serverError(res, error.message);
  }
});

/**
 * 更新成员
 */
router.put('/:userId/members/:memberId', authAndCheckOwnership, async (req, res) => {
  try {
    const { userId, memberId } = req.params;
    const updates = req.body;
    
    const db = await getDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return errors.notFound(res, '用户');
    }
    
    if (!user.team || !user.team.members) {
      return errors.badRequest(res, '用户没有团队配置');
    }
    
    const memberIndex = user.team.members.findIndex(m => m.id === memberId);
    if (memberIndex === -1) {
      return errors.notFound(res, '成员');
    }
    
    // 更新成员信息（不允许修改 id 和 isDefault）
    const { id, isDefault, ...safeUpdates } = updates;
    user.team.members[memberIndex] = {
      ...user.team.members[memberIndex],
      ...safeUpdates,
      updatedAt: new Date().toISOString()
    };
    
    user.team.updatedAt = new Date().toISOString();
    
    await saveDB(db);
    
    console.log(`✅ 已为用户 ${userId} 更新成员：${memberId}`);
    
    // 同步到用户服务器（如果有）
    const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');
    let syncResult = null;
    
    if (server && server.ip) {
      try {
        await syncAgentsToServer(server, user.team.members);
        syncResult = { success: true, message: '配置已同步到服务器' };
        console.log(`✅ 已同步到远程服务器：${server.ip}`);
      } catch (syncErr) {
        syncResult = { success: false, error: syncErr.message };
        console.log(`⚠️ 同步失败：${syncErr.message}`);
      }
    }
    
    success(res, { team: user.team, member: user.team.members[memberIndex], sync: syncResult });
  } catch (error) {
    console.error('更新成员失败:', error);
    errors.serverError(res, error.message);
  }
});

export default router;

console.log('✅ lume 团队管理 API 已加载（支持配置合并）');
