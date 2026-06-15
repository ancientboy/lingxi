/**
 * lume 团队管理 API
 * 
 * 功能：
 * - 用户团队配置存储
 * - 团队模板管理
 * - 团队 CRUD 操作
 * - 模板部署（通过 OpenClaw RPC，不依赖 SSH）
 * 
 * ✅ 配置合并策略：切换团队时保留用户自定义的模型、工作区等配置
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { getDB, saveDB } from '../utils/db.js';
import { success, errors } from '../utils/response.js';
import { authAndCheckOwnership, verifyToken } from '../middleware/auth.js';
import { getActiveServer } from '../utils/activeServer.js';
import { callOpenClawRPC } from '../utils/openclaw-rpc.js';
import { rebuildAndPushForUser } from '../utils/dispatch-config.js';
import { config as appConfig } from '../config/index.js';

const router = express.Router();

// ============ 团队模板库（从独立 JSON 文件加载） ============

// 解析当前文件所在目录，构建模板文件路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_PATH = path.join(__dirname, '..', 'templates', 'team-templates.json');

/**
 * 加载团队模板数据
 * - 启动时从 team-templates.json 读取并缓存
 * - 如果文件读取失败，回退到空数组并打印警告
 */
function loadTeamTemplates() {
  try {
    const raw = fs.readFileSync(TEMPLATES_PATH, 'utf8');
    const data = JSON.parse(raw);
    return data.templates || [];
  } catch (err) {
    console.error('⚠️ 团队模板文件加载失败:', err.message);
    return [];
  }
}

const TEAM_TEMPLATES = loadTeamTemplates();

// 预设模板 ID 集合（用于区分自定义模板，防止误删预设）
const PRESET_TEMPLATE_IDS = new Set(TEAM_TEMPLATES.map(t => t.templateId));

// ============ 自定义模板常量 ============

/** 每个用户最多保存的自定义模板数量 */
const MAX_CUSTOM_TEMPLATES_PER_USER = 20;

/** 模板名最大长度 */
const MAX_TEMPLATE_NAME_LENGTH = 50;

/**
 * 清理模板名称：去除 HTML 标签、截断长度
 */
function sanitizeTemplateName(name) {
  if (typeof name !== 'string') return '';
  return name
    .replace(/<[^>]*>/g, '')   // 去除 HTML 标签
    .replace(/[<>"'&]/g, '')   // 去除特殊字符
    .trim()
    .substring(0, MAX_TEMPLATE_NAME_LENGTH);
}

/**
 * 从用户 OpenClaw 获取当前 agents 列表并组装为模板 members 格式
 * 如果 RPC 不可用（免费用户 / 无服务器），回退到 lingxi-team 默认模板
 * 
 * ✅ 纯函数：始终返回新数组，不修改任何输入
 */
async function fetchCurrentAgentsAsMembers(userServer) {
  // 默认模板（回退用）
  const fallbackTemplate = TEAM_TEMPLATES.find(t => t.templateId === 'lingxi-team');
  const fallbackMembers = fallbackTemplate?.members || [];

  if (!userServer?.ip) {
    return [...fallbackMembers];
  }

  try {
    const result = await callOpenClawRPC(userServer, 'config.get', {}, {
      displayName: '灵犀云模板管理',
    });
    if (!result.ok) {
      console.warn('⚠️ config.get RPC 失败，回退到默认模板');
      return [...fallbackMembers];
    }

    const openclawConfig = result.payload?.config || {};
    const agentsList = openclawConfig.agents?.list || [];

    if (agentsList.length === 0) {
      return [...fallbackMembers];
    }

    // 将 OpenClaw agent 配置转换为模板 members 格式（纯函数，返回新对象）
    return agentsList.map(agent => ({
      id: agent.id === 'main' ? 'lingxi' : agent.id,
      name: agent.identity?.name || agent.name || agent.id,
      icon: agent.identity?.emoji || 'bot',
      role: agent.id === 'main' ? '队长' : (agent.identity?.name || agent.id),
      desc: '',
      triggers: [agent.id === 'main' ? '灵犀' : agent.id],
      isDefault: agent.default === true,
      capabilities: [],
      defaultModel: agent.model?.primary || 'zhipu/glm-5',
      skills: [],
      ...(agent.model ? { model: agent.model } : {}),
    }));
  } catch (err) {
    console.warn('⚠️ 获取 agents 配置失败，回退到默认模板:', err.message);
    return [...fallbackMembers];
  }
}

/**
 * 根据 templateId 查找模板（预设 + 自定义）
 * @param {string} templateId - 模板 ID
 * @param {Object} db - 数据库对象（用于查自定义模板）
 * @param {string} [userId] - 用户 ID（查自定义模板时需要）
 * @returns {Object|null} 模板对象，附带 isCustom 标记
 */
function findTemplateById(templateId, db, userId) {
  // 0. 特殊处理：配置快照
  if (templateId === 'my-snapshot') {
    const snapshot = (db.userTemplates || []).find(
      t => t.userId === userId && t.id === 'my-snapshot'
    );
    if (snapshot) {
      return {
        templateId: 'my-snapshot',
        templateName: '我的配置',
        description: snapshot.description || '当前 Agent 配置快照',
        category: 'snapshot',
        tags: [],
        members: snapshot.members || [],
        isSnapshot: true,
        isCustom: false,
      };
    }
  }

  // 1. 先查预设模板
  const preset = TEAM_TEMPLATES.find(t => t.templateId === templateId);
  if (preset) {
    return { ...preset, isCustom: false };
  }

  // 2. 再查自定义模板
  if (userId && db.customTemplates) {
    const custom = db.customTemplates.find(
      t => t.id === templateId && t.userId === userId
    );
    if (custom) {
      return {
        templateId: custom.id,
        templateName: custom.templateName,
        description: custom.description || '',
        category: custom.category || 'personal',
        tags: custom.tags || [],
        members: custom.members || [],
        isCustom: true,
      };
    }
  }

  return null;
}

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
const oldDefaults = oldAgents.defaults || { model: { primary: "lume/auto" }, workspace: "~/.openclaw/workspace" };
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
/**
 * 获取团队模板列表
 * 如果用户已登录（携带 Bearer Token），同时返回该用户的自定义模板
 */
router.get('/templates', async (req, res) => {
  // 防护：模板数据加载失败时返回 503，避免下游 API 全崩
  if (!TEAM_TEMPLATES || TEAM_TEMPLATES.length === 0) {
    return res.status(503).json({
      success: false,
      error: '团队模板数据暂时不可用，请检查模板文件配置'
    });
  }

  // 预设模板列表
  const presetTemplates = TEAM_TEMPLATES.map(t => ({
    templateId: t.templateId,
    templateName: t.templateName,
    description: t.description,
    category: t.category,
    tags: t.tags || [],
    memberCount: t.members.length,
    isCustom: false
  }));

  // 尝试识别登录用户，合并自定义模板
  let customList = [];
  let snapshotTemplate = null;
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const JWT_SECRET = appConfig.security.jwtSecret;
      const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
      const db = await getDB();
      customList = (db.customTemplates || [])
        .filter(t => t.userId === decoded.userId)
        .map(t => ({
          templateId: t.id,
          templateName: t.templateName,
          description: t.description || '',
          category: t.category || 'personal',
          tags: t.tags || [],
          memberCount: (t.members || []).length,
          isCustom: true
        }));
      // 检查是否有快照
      const snapshot = (db.userTemplates || []).find(
        t => t.userId === decoded.userId && t.id === 'my-snapshot'
      );
      if (snapshot) {
        snapshotTemplate = {
          templateId: 'my-snapshot',
          templateName: '我的配置',
          description: snapshot.description || '当前 Agent 配置快照',
          category: 'snapshot',
          tags: [],
          memberCount: (snapshot.members || []).length,
          isSnapshot: true,
          isCustom: false,
          updatedAt: snapshot.updatedAt,
        };
      }
    }
  } catch (e) {
    // Token 无效或过期 → 忽略，只返回预设模板
  }

  // 快照排在最前面
  const allTemplates = snapshotTemplate
    ? [snapshotTemplate, ...presetTemplates, ...customList]
    : [...presetTemplates, ...customList];

  success(res, {
    templates: allTemplates
  });
});

// ============ 自定义模板 API ============
// 注意：固定路径路由必须在 :templateId 参数路由之前注册

/**
 * 获取用户自己的自定义模板列表
 * GET /api/team/templates/my/list
 */
router.get('/templates/my/list', authAndCheckOwnership, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = await getDB();
    const customs = (db.customTemplates || [])
      .filter(t => t.userId === userId)
      .map(t => ({
        templateId: t.id,
        templateName: t.templateName,
        description: t.description || '',
        category: t.category || 'personal',
        tags: t.tags || [],
        members: t.members || [],
        memberCount: (t.members || []).length,
        isCustom: true,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      }));

    success(res, { templates: customs });
  } catch (error) {
    console.error('获取自定义模板失败:', error);
    errors.serverError(res, error.message);
  }
});

/**
 * 保存当前团队配置为自定义模板
 * POST /api/team/templates/save
 * Body: { templateName, description?, category?, tags? }
 */
router.post('/templates/save', authAndCheckOwnership, async (req, res) => {
  try {
    const userId = req.user.id;
    const { templateName, description = '', category = 'personal', tags = [] } = req.body;

    if (!templateName || !templateName.trim()) {
      return errors.badRequest(res, 'templateName 是必需的');
    }

    // 清理 & 长度校验
    const cleanName = sanitizeTemplateName(templateName);
    if (!cleanName) {
      return errors.badRequest(res, 'templateName 包含无效字符');
    }
    if (description.length > 500) {
      return errors.badRequest(res, 'description 不能超过 500 个字符');
    }
    const normalizedTags = Array.isArray(tags) ? tags.slice(0, 10) : [];
    if (normalizedTags.some(t => typeof t !== 'string' || t.length > 20)) {
      return errors.badRequest(res, '每个 tag 不能超过 20 个字符');
    }

    const db = await getDB();
    if (!db.customTemplates) db.customTemplates = [];

    // 每用户模板数量限制
    const userTemplateCount = db.customTemplates.filter(t => t.userId === userId).length;
    if (userTemplateCount >= MAX_CUSTOM_TEMPLATES_PER_USER) {
      return errors.badRequest(res, `自定义模板数量已达上限（${MAX_CUSTOM_TEMPLATES_PER_USER} 个），请删除后再创建`);
    }

    // 获取用户的活跃服务器
    const userServer = getActiveServer(db, userId);

    // 问题 4：members 赋值逻辑改为直接赋值
    const user = db.users.find(u => u.id === userId);
    const members = (user?.team?.members?.length > 0)
      ? JSON.parse(JSON.stringify(user.team.members))
      : await fetchCurrentAgentsAsMembers(userServer);

    // 生成模板 ID
    const templateId = `custom-${crypto.randomUUID().substring(0, 8)}`;

    const now = new Date().toISOString();
    const newTemplate = {
      id: templateId,
      userId,
      templateName: cleanName,
      description,
      category,
      tags: normalizedTags,
      members,
      createdAt: now,
      updatedAt: now
    };

    db.customTemplates.push(newTemplate);
    await saveDB(db);

    console.log(`✅ 用户 ${userId} 保存自定义模板: ${templateName} (${members.length} 人)`);

    success(res, {
      template: {
        templateId: newTemplate.id,
        templateName: newTemplate.templateName,
        description: newTemplate.description,
        category: newTemplate.category,
        tags: newTemplate.tags,
        members: newTemplate.members,
        memberCount: newTemplate.members.length,
        isCustom: true,
        createdAt: newTemplate.createdAt,
        updatedAt: newTemplate.updatedAt
      }
    });
  } catch (error) {
    console.error('保存自定义模板失败:', error);
    errors.serverError(res, error.message);
  }
});

// ============ 配置快照（模板切换前自动保存） ============

/**
 * 保存当前 OpenClaw Agent 配置为"我的配置"快照
 * POST /api/team/templates/snapshot
 *
 * 逻辑：
 * 1. 通过 RPC 读 OpenClaw config.get 获取 agents.list
 * 2. 提取每个 agent 的关键信息
 * 3. 存到 db.userTemplates（覆盖已有的 my-snapshot）
 */
router.post('/templates/snapshot', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = await getDB();
    const userServer = getActiveServer(db, userId);

    if (!userServer?.ip) {
      return res.status(400).json({ success: false, error: '没有可用的服务器' });
    }

    // 读 OpenClaw 当前 Agent 列表
    const configRes = await callOpenClawRPC(userServer, 'config.get', {}, {
      displayName: '灵犀云快照',
    });
    if (!configRes.ok) {
      return res.status(500).json({ success: false, error: '读取配置失败' });
    }

    const agentsList = configRes.payload?.config?.agents?.list || [];

    const snapshot = {
      id: 'my-snapshot',
      userId,
      name: '我的配置',
      description: '当前 OpenClaw Agent 配置快照',
      isSnapshot: true,
      members: agentsList
        .filter(a => a.id !== 'main')
        .map(a => ({
          id: a.id,
          agentId: a.id,
          name: a.identity?.name || a.name || a.id,
          icon: a.identity?.emoji || '🤖',
          role: a.identity?.name || a.id,
          desc: '',
          triggers: [a.id],
          model: a.model || '',
          workspace: a.workspace || '',
        })),
      agents: agentsList.map(a => ({
        id: a.id,
        name: a.identity?.name || a.name || a.id,
        model: a.model,
        workspace: a.workspace,
        default: a.default === true,
        subagents: a.subagents || {},
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 存到 userTemplates（覆盖已有的 my-snapshot）
    if (!db.userTemplates) db.userTemplates = [];
    const idx = db.userTemplates.findIndex(t => t.userId === userId && t.id === 'my-snapshot');
    if (idx >= 0) {
      snapshot.createdAt = db.userTemplates[idx].createdAt; // 保留首次创建时间
      db.userTemplates[idx] = snapshot;
    } else {
      db.userTemplates.push(snapshot);
    }
    await saveDB(db);

    console.log(`✅ 用户 ${userId} 保存配置快照，共 ${snapshot.agents.length} 个 Agent`);
    res.json({ success: true, snapshot });
  } catch (error) {
    console.error('保存配置快照失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取用户的配置快照
 * GET /api/team/templates/snapshot
 */
router.get('/templates/snapshot', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = await getDB();
    const snapshot = (db.userTemplates || []).find(
      t => t.userId === userId && t.id === 'my-snapshot'
    );

    if (!snapshot) {
      return res.json({ success: true, snapshot: null });
    }

    res.json({ success: true, snapshot });
  } catch (error) {
    console.error('获取配置快照失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 内部函数：保存当前配置快照（不通过 HTTP，供 apply-template 内部调用）
 * 优先从 OpenClaw RPC 读取，失败则从 db 中的 team.members 读取
 * @returns {boolean} 是否成功保存
 */
async function _saveSnapshotInternal(userId, db) {
  try {
    const userServer = getActiveServer(db, userId);
    let agentsList = [];
    let members = [];

    // 尝试从 RPC 读取
    if (userServer?.ip) {
      try {
        const configRes = await callOpenClawRPC(userServer, 'config.get', {}, {
          displayName: '灵犀云快照',
        });
        if (configRes.ok) {
          agentsList = configRes.payload?.config?.agents?.list || [];
        }
      } catch (e) {
        console.warn('⚠️ 快照: RPC 读取失败，回退到 db:', e.message);
      }
    }

    // 回退：从 db 中读取用户的 team.members
    if (agentsList.length === 0) {
      const user = db.users.find(u => u.id === userId);
      const dbMembers = user?.team?.members || [];
      if (dbMembers.length > 0) {
        members = dbMembers.map(m => ({
          id: m.id,
          name: m.name || m.id,
          icon: m.icon || '🤖',
          role: m.role || '',
          desc: m.desc || '',
          triggers: m.triggers || [m.id],
          model: m.model || '',
          workspace: m.workspace || '',
        }));
      }
    } else {
      members = agentsList
        .filter(a => a.id !== 'main')
        .map(a => ({
          id: a.id,
          name: a.identity?.name || a.name || a.id,
          icon: a.identity?.emoji || '🤖',
          role: a.identity?.name || a.id,
          desc: '',
          triggers: [a.id],
          model: a.model || '',
          workspace: a.workspace || '',
        }));
    }

    if (members.length === 0 && agentsList.length === 0) {
      console.warn('⚠️ 快照: 没有可保存的配置');
      return false;
    }

    const snapshot = {
      id: 'my-snapshot',
      userId,
      name: '我的配置',
      description: '切换模板前的 Agent 配置快照',
      isSnapshot: true,
      members,
      agents: agentsList.length > 0
        ? agentsList.map(a => ({
            id: a.id,
            name: a.identity?.name || a.name || a.id,
            model: a.model,
            workspace: a.workspace,
            default: a.default === true,
            subagents: a.subagents || {},
          }))
        : members.map(m => ({ id: m.id, name: m.name, model: m.model || '', workspace: m.workspace || '' })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!db.userTemplates) db.userTemplates = [];
    const idx = db.userTemplates.findIndex(t => t.userId === userId && t.id === 'my-snapshot');
    if (idx >= 0) {
      snapshot.createdAt = db.userTemplates[idx].createdAt;
      db.userTemplates[idx] = snapshot;
    } else {
      db.userTemplates.push(snapshot);
    }

    console.log(`✅ 用户 ${userId} 自动保存配置快照，共 ${snapshot.members.length} 个成员`);
    return true;
  } catch (error) {
    console.error('自动保存快照失败:', error);
    return false;
  }
}


/**
 * 删除自定义模板
 * DELETE /api/team/templates/:templateId
 */
router.delete('/templates/:templateId', authAndCheckOwnership, async (req, res) => {
  try {
    const userId = req.user.id;
    const { templateId } = req.params;

    // 不允许删除预设模板
    if (PRESET_TEMPLATE_IDS.has(templateId)) {
      return errors.badRequest(res, '不能删除预设模板');
    }

    const db = await getDB();
    if (!db.customTemplates) db.customTemplates = [];

    const index = db.customTemplates.findIndex(
      t => t.id === templateId && t.userId === userId
    );

    if (index === -1) {
      return errors.notFound(res, '自定义模板');
    }

    const removed = db.customTemplates.splice(index, 1)[0];
    await saveDB(db);

    console.log(`✅ 用户 ${userId} 删除自定义模板: ${removed.templateName}`);

    success(res, {
      message: '模板已删除',
      templateId: removed.id,
      templateName: removed.templateName
    });
  } catch (error) {
    console.error('删除自定义模板失败:', error);
    errors.serverError(res, error.message);
  }
});

/**
 * 获取特定模板详情（支持预设和自定义）
 * 预设模板无需登录；自定义模板需鉴权（verifyToken），401/404 语义分离
 */
router.get('/templates/:templateId', async (req, res, next) => {
  const { templateId } = req.params;

  // 先查预设模板（无需登录）
  const preset = TEAM_TEMPLATES.find(t => t.templateId === templateId);
  if (preset) {
    return success(res, { template: { ...preset, isCustom: false } });
  }

  // 自定义模板需要登录 → 交给 verifyToken 中间件处理后的 handler
  // 使用 verifyToken 中间件，让 401 和 404 语义分离
  verifyToken(req, res, () => {
    _handleCustomTemplateLookup(req, res);
  });
});

/**
 * 自定义模板查询 handler（需在 verifyToken 之后调用）
 */
async function _handleCustomTemplateLookup(req, res) {
  try {
    const { templateId } = req.params;
    const userId = req.user.id;
    const db = await getDB();

    // 特殊处理：配置快照
    if (templateId === 'my-snapshot') {
      const snapshot = (db.userTemplates || []).find(
        t => t.userId === userId && t.id === 'my-snapshot'
      );
      if (snapshot) {
        return success(res, {
          template: {
            templateId: 'my-snapshot',
            templateName: '我的配置',
            description: snapshot.description || '当前 Agent 配置快照',
            category: 'snapshot',
            tags: [],
            members: snapshot.members || [],
            isSnapshot: true,
            isCustom: false,
            updatedAt: snapshot.updatedAt,
          }
        });
      }
      return errors.notFound(res, '快照');
    }

    const custom = (db.customTemplates || []).find(
      t => t.id === templateId && t.userId === userId
    );
    if (!custom) {
      return errors.notFound(res, '模板');
    }
    return success(res, {
      template: {
        templateId: custom.id,
        templateName: custom.templateName,
        description: custom.description || '',
        category: custom.category || 'personal',
        tags: custom.tags || [],
        members: custom.members || [],
        isCustom: true,
        createdAt: custom.createdAt,
        updatedAt: custom.updatedAt
      }
    });
  } catch (e) {
    return errors.notFound(res, '模板');
  }
}

// ═══════════════════════════════════════════════════════════
// 工作流管理（必须在 /:userId 之前注册，否则被参数路由拦截）
// ═══════════════════════════════════════════════════════════

router.get('/workflows/available', verifyToken, async (req, res) => {
  try {
    const dir = '/root/.openclaw/workspace/skills/workflow-hub/workflows';
    const files = fs.readdirSync(dir);
    const workflows = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const wf = JSON.parse(content);
      workflows.push({
        id: wf.id,
        name: wf.name,
        description: wf.description,
        mode: wf.mode,
        agents: wf.agents || [],
        estimatedDuration: wf.estimatedDuration,
        steps: (wf.steps || []).map(s => ({
          name: s.name || s.task || '步骤',
          agent: s.agent || s.agentId || '',
          description: s.description || s.prompt || ''
        }))
      });
    }
    res.json({ success: true, workflows });
  } catch (err) {
    console.error('读取可用工作流失败:', err.message);
    res.json({ success: true, workflows: [] });
  }
});

router.post('/workflows/activate', verifyToken, async (req, res) => {
  try {
    const { workflowIds, serverId } = req.body;
    if (!Array.isArray(workflowIds) || workflowIds.length === 0) {
      return res.status(400).json({ success: false, error: '请选择要激活的工作流' });
    }
    if (workflowIds.length > 20) {
      return res.status(400).json({ success: false, error: '一次最多激活 20 个工作流' });
    }
    // 校验每个元素
    for (const id of workflowIds) {
      if (typeof id !== 'string' || id.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        return res.status(400).json({ success: false, error: '工作流 ID 格式无效' });
      }
    }
    const userId = req.user.id;
    const db = await getDB();
    if (!db.activeWorkflows) db.activeWorkflows = [];
    let activated = 0;
    for (const wfId of workflowIds) {
      if (typeof wfId !== 'string' || wfId.length > 50) continue;
      const exists = db.activeWorkflows.find(w => w.userId === userId && w.serverId === serverId && w.workflowId === wfId);
      if (!exists) {
        db.activeWorkflows.push({ userId, serverId, workflowId: wfId, activatedAt: new Date().toISOString() });
        activated++;
      }
    }
    await saveDB(db);
    res.json({ success: true, activated });
    // 更新 dispatch-config.json
    try {
      const server = db.userServers?.find(s => s.userId === userId && s.id === serverId);
      if (server) await rebuildAndPushForUser(userId, db, server);
    } catch (e) { console.warn('推送调度配置失败:', e.message); }
  } catch (err) {
    console.error('激活工作流失败:', err);
    res.status(500).json({ success: false, error: '激活失败' });
  }
});

router.get('/workflows/list', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const serverId = req.query.serverId;
    const db = await getDB();

    // 1. 从 db 读取灵犀云记录的激活状态
    let active = (db.activeWorkflows || []).filter(w => w.userId === userId);
    if (serverId) {
      active = active.filter(w => w.serverId === serverId);
    }

    // 2. 从设备 OpenClaw 读 dispatch-config.json 获取真实状态
    let deviceWorkflows = [];
    let userServer = null;
    if (serverId) {
      userServer = db.userServers?.find(s => s.userId === userId && s.id === serverId);
    } else {
      userServer = getActiveServer(db, userId);
    }

    if (userServer && userServer.ip) {
      try {
        const rpcResult = await callOpenClawRPC(userServer, 'agents.files.get', {
          agentId: 'main',
          name: 'dispatch-config.json'
        }, 8000);

        const content = rpcResult?.payload?.content || rpcResult?.payload?.text || '';
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        if (contentStr) {
          const config = JSON.parse(contentStr);
          if (config?.workflows?.matchRules) {
            deviceWorkflows = config.workflows.matchRules.map(r => ({
              workflowId: r.workflowId,
              serverId: serverId || userServer.id,
              activatedAt: config.updatedAt || new Date().toISOString(),
              fromDevice: true // 标记来自设备真实状态
            }));
          }
        }
      } catch (e) {
        // 设备不可达或文件不存在，只用 db 数据
        console.warn('⚠️ 读取设备 dispatch-config 失败:', e.message);
      }
    }

    // 3. 合并：设备真实状态优先，db 补充
    const OFFICIAL_IDS = new Set(['dev-standard', 'dev-quick', 'content-standard', 'data-analysis', 'gstack-sprint']);
    const dbIds = new Set(active.map(w => w.workflowId));
    for (const dw of deviceWorkflows) {
      if (!dbIds.has(dw.workflowId)) {
        // 不在 db 里的 → 设备独有的
        dw.custom = !OFFICIAL_IDS.has(dw.workflowId); // 非官方的标记为自定义
        active.push(dw);
      } else {
        // 设备确认了 db 里的记录，标记为已验证
        const existing = active.find(w => w.workflowId === dw.workflowId);
        if (existing) existing.verified = true;
      }
    }

    // 标记哪些只在 db 里但设备没确认（可能没真正激活）
    for (const w of active) {
      if (!w.fromDevice && !w.verified) {
        w.pending = true; // 待确认
      }
    }

    res.json({ success: true, workflows: active, deviceChecked: !!userServer });
  } catch (err) {
    console.error('获取工作流列表失败:', err);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

router.post('/workflows/deactivate', verifyToken, async (req, res) => {
  try {
    const { workflowId, serverId } = req.body;
    const userId = req.user.id;
    const db = await getDB();
    if (!db.activeWorkflows) db.activeWorkflows = [];
    db.activeWorkflows = db.activeWorkflows.filter(w => {
      // 匹配 userId + workflowId + serverId（如果传了 serverId 则精确匹配，否则按旧行为）
      if (w.userId !== userId || w.workflowId !== workflowId) return true;
      if (serverId && w.serverId !== serverId) return true;
      return false;
    });
    await saveDB(db);
    res.json({ success: true });
    // 更新 dispatch-config.json
    try {
      const server = db.userServers?.find(s => s.userId === userId && (serverId ? s.id === serverId : s.status === 'running'));
      if (server) await rebuildAndPushForUser(userId, db, server);
    } catch (e) { console.warn('推送调度配置失败:', e.message); }
  } catch (err) {
    res.status(500).json({ success: false, error: '停用失败' });
  }
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
    const defaultTemplate = TEAM_TEMPLATES.find(t => t.templateId === 'lingxi-team');
    const team = user.team || {
      teamId: 'default',
      teamName: '我的团队',
      members: defaultTemplate?.members?.slice(0, 3) || []
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
    
    const db = await getDB();
    
    // ✅ 同时查找预设模板和自定义模板
    const template = findTemplateById(templateId, db, userId);
    if (!template) {
      return errors.notFound(res, '模板');
    }
    
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return errors.notFound(res, '用户');
    }

    // ✅ 模板切换前自动保存当前配置为快照（仅在当前有团队配置时）
    let snapshotSaved = false;
    if (user.team?.members?.length > 0 && templateId !== 'my-snapshot') {
      snapshotSaved = await _saveSnapshotInternal(userId, db);
      if (snapshotSaved) {
        console.log(`✅ 已为用户 ${userId} 自动保存配置快照`);
      }
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
      sync: syncResult,
      snapshotSaved
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

// ============ 模板部署（通过 OpenClaw RPC） ============

/**
 * 用户部署锁 — 防止同一用户并发部署导致 config.patch 冲突
 * key: userId, value: true
 */
const _deployLocks = new Map();

/**
 * 为指定 agent 生成默认 SOUL.md
 * 预设角色用 AGENT_SOUL_TEMPLATES，自定义角色根据模板信息生成
 */
function generateSoulMd(member) {
  // 预设角色使用硬编码模板
  if (AGENT_SOUL_TEMPLATES[member.id]) {
    return AGENT_SOUL_TEMPLATES[member.id];
  }

  // 自定义角色：根据模板信息生成通用 SOUL.md
  const name = member.name || member.id;
  const role = member.role || '团队成员';
  const desc = member.desc || '';
  const capabilities = member.capabilities || [];
  const triggers = member.triggers || [member.id];

  return `# ${name}

你是${name}，${role}。

## 身份
${role}，专注于${desc || '团队协作'}。

## 性格
**专业可靠**
- 认真负责，注重细节
- 善于沟通和协作
- 追求高质量输出

## 职责
${capabilities.length > 0 ? capabilities.map(c => `- ${c}`).join('\n') : `- 团队分配的任务`}

## 触发词
${triggers.join('、')}
`;
}

/**
 * 通过 OpenClaw RPC 将整个模板部署到用户服务器
 * 分阶段执行，每个阶段通过 callback 报告进度
 * 
 * @param {Object} userServer - 用户服务器信息
 * @param {Object} template - 模板对象（含 members）
 * @param {Array} oldMembers - 旧成员列表（用于合并配置）
 * @param {Function} onProgress - 进度回调 (phase, detail) => void
 * @returns {Object} 部署结果
 */
async function deployTemplateViaRPC(userServer, template, oldMembers, onProgress) {
  // 每次部署用唯一 sessionKey，避免并发部署干扰
  const deployId = crypto.randomUUID().substring(0, 8);
  const sessionKey = `agent:main:lingxi-cloud-deploy-${deployId}`;

  const newMembers = template.members || [];

  // ── 阶段 1：读取当前配置 ──
  onProgress('read-config', '正在读取 OpenClaw 配置...');
  const configRes = await callOpenClawRPC(userServer, 'config.get', {}, {
    displayName: '灵犀云部署',
  });
  if (!configRes.ok) {
    throw new Error('读取 OpenClaw 配置失败: ' + JSON.stringify(configRes.error));
  }

  const baseHash = configRes.payload?.hash;
  const currentConfig = configRes.payload?.config || {};
  const agentsList = currentConfig.agents?.list || [];
  const defaultWorkspace = currentConfig.agents?.defaults?.workspace || '~/.openclaw/workspace';

  // 构建旧 agent 映射（用于合并用户自定义配置）
  const oldAgentMap = {};
  agentsList.forEach(a => { oldAgentMap[a.id] = a; });

  // 旧成员的自定义配置（模型、工作区）
  const oldMemberConfigMap = {};
  oldMembers.forEach(m => {
    if (m.model || m.workspace) {
      oldMemberConfigMap[m.id] = m;
    }
  });

  onProgress('read-config', `已读取配置，当前 ${agentsList.length} 个 Agent`);

  // ── 阶段 2：构建新 agents 列表 ──
  onProgress('build-config', '正在构建新的 Agent 列表...');

  const updatedList = newMembers.map(member => {
    const agentId = member.id;
    const isMain = agentId === 'lingxi';
    const configId = isMain ? 'main' : agentId;
    const workspace = member.workspace || `${defaultWorkspace}-${agentId}`;

    // 合并旧配置
    const existing = oldAgentMap[configId];
    const oldCustom = oldMemberConfigMap[agentId];

    const agent = {
      id: configId,
      ...(isMain ? { default: true } : {}),
      workspace: existing?.workspace || workspace,
      identity: {
        name: member.name || agentId,
        emoji: member.icon || '🤖',
      },
      // 保留用户选择的模型
      ...(existing?.model ? { model: existing.model } : {}),
      ...(oldCustom?.model ? { model: oldCustom.model } : {}),
      ...(member.model ? { model: member.model } : {}),
    };

    // 灵犀的 subagents 配置
    if (isMain) {
      agent.subagents = {
        allowAgents: newMembers
          .filter(m => m.id !== 'lingxi')
          .map(m => m.id),
      };
      // 保留旧的其他 subagents 字段
      if (existing?.subagents) {
        Object.keys(existing.subagents).forEach(key => {
          if (key !== 'allowAgents') {
            agent.subagents[key] = existing.subagents[key];
          }
        });
      }
    }

    // 保留旧的其他自定义字段
    if (existing) {
      Object.keys(existing).forEach(key => {
        if (!['id', 'default', 'workspace', 'identity', 'model', 'subagents'].includes(key)) {
          agent[key] = existing[key];
        }
      });
    }

    return agent;
  });

  onProgress('build-config', `已构建 ${updatedList.length} 个 Agent 配置`);

  // ── 阶段 3：通过 config.patch 更新 ──
  onProgress('patch-config', '正在更新 OpenClaw 配置（Agent 将重启）...');

  const patchRes = await callOpenClawRPC(userServer, 'config.patch', {
    raw: JSON.stringify({ agents: { list: updatedList } }),
    baseHash,
    note: `灵犀云部署模板: ${template.templateName || template.id}`,
  }, { timeout: 15000 });

  if (!patchRes.ok) {
    throw new Error('配置更新失败: ' + JSON.stringify(patchRes.error));
  }

  onProgress('patch-config', '配置已更新，等待 OpenClaw 重启...');

  // 等待重启（config.patch 后 OpenClaw 会自动重启）
  await new Promise(resolve => setTimeout(resolve, 5000));

  // ── 阶段 4：为新 agent 写入 SOUL.md ──
  const newAgentIds = newMembers
    .filter(m => m.id !== 'lingxi') // 灵犀的 SOUL.md 通常已存在
    .map(m => m.id);

  const existingIds = new Set(agentsList.map(a => a.id === 'main' ? 'lingxi' : a.id));
  const agentsNeedingSoul = newAgentIds.filter(id => !existingIds.has(id));

  for (let i = 0; i < agentsNeedingSoul.length; i++) {
    const agentId = agentsNeedingSoul[i];
    const member = newMembers.find(m => m.id === agentId);
    if (!member) continue;

    onProgress('write-soul', `正在写入 ${member.name || agentId} 的 SOUL.md (${i + 1}/${agentsNeedingSoul.length})`);

    try {
      const soulContent = generateSoulMd(member);
      // 通过 chat.send 让灵犀写入文件
      await callOpenClawRPC(userServer, 'chat.send', {
        sessionKey,
        message: `请用 write 工具将以下内容写入 agent:${agentId} 的工作区文件 SOUL.md，直接写入不要回复多余内容：\n\n${soulContent}`,
      }, { timeout: 30000 });
    } catch (err) {
      console.warn(`⚠️ 写入 ${agentId} SOUL.md 失败:`, err.message);
      // 不中断流程，继续下一个
    }
  }

  if (agentsNeedingSoul.length > 0) {
    onProgress('write-soul', `已写入 ${agentsNeedingSoul.length} 个 Agent 的 SOUL.md`);
  }

  // ── 阶段 5：安装模板指定的 Skills ──
  // 收集所有成员的 skills
  const skillsToInstall = newMembers
    .flatMap(m => (m.skills || []).map(s => ({ agentId: m.id, skillId: s })))
    .filter(s => s.skillId && typeof s.skillId === 'string');

  // 去重
  const uniqueSkills = [...new Set(skillsToInstall.map(s => s.skillId))];

  for (let i = 0; i < uniqueSkills.length; i++) {
    const skillId = uniqueSkills[i];
    const targetAgents = skillsToInstall.filter(s => s.skillId === skillId).map(s => s.agentId);

    onProgress('install-skills', `正在安装 Skill: ${skillId} (${i + 1}/${uniqueSkills.length})`);

    try {
      // 让灵犀通过 clawhub skill 安装
      await callOpenClawRPC(userServer, 'chat.send', {
        sessionKey,
        message: `请使用 clawhub skill 安装技能 "${skillId}"，为以下 agent 安装: ${targetAgents.join(', ')}。执行安装即可，不需要回复多余内容。`,
      }, { timeout: 60000 });
    } catch (err) {
      console.warn(`⚠️ 安装 Skill ${skillId} 失败:`, err.message);
    }
  }

  if (uniqueSkills.length > 0) {
    onProgress('install-skills', `已安装 ${uniqueSkills.length} 个 Skill`);
  }

  return {
    agentsDeployed: updatedList.length,
    soulsWritten: agentsNeedingSoul.length,
    skillsInstalled: uniqueSkills.length,
  };
}

/**
 * 通过 SSE 部署模板到用户 OpenClaw
 * POST /api/team/:userId/deploy-template/:templateId
 * 
 * 流程：应用模板到数据库 → 通过 RPC 部署到 OpenClaw → SSE 推送进度
 * 如果没有运行中的服务器，只更新数据库（同步方式）
 */
router.post('/:userId/deploy-template/:templateId', authAndCheckOwnership, async (req, res) => {
  const { userId, templateId } = req.params;

  // ── 并发保护：同一用户不能同时部署 ──
  if (_deployLocks.has(userId)) {
    return errors.badRequest(res, '部署正在进行中，请稍后再试');
  }
  _deployLocks.set(userId, true);

  // ── 1. 查找模板 ──
  const db = await getDB();
  const template = findTemplateById(templateId, db, userId);
  if (!template) {
    _deployLocks.delete(userId);
    return errors.notFound(res, '模板');
  }

  const user = db.users.find(u => u.id === userId);
  if (!user) {
    _deployLocks.delete(userId);
    return errors.notFound(res, '用户');
  }

  // ── 2. 先同步更新数据库（跟 apply-template 一样） ──
  const oldMembers = user.team?.members || [];
  const oldMemberMap = {};
  oldMembers.forEach(m => {
    if (m.model || m.workspace) {
      oldMemberMap[m.id] = m;
    }
  });

  const newMembers = template.members.map(m => ({
    ...m,
    ...(oldMemberMap[m.id] || {}),
  }));

  user.team = {
    teamId: templateId,
    teamName: template.templateName || template.templateId,
    members: newMembers,
    templateId,
    appliedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  user.agents = newMembers.map(m => m.id);
  user.agentsUpdatedAt = new Date().toISOString();
  await saveDB(db);

  console.log(`✅ 已为用户 ${userId} 更新数据库：${template.templateName || templateId}`);

  // ── 3. 检查是否有运行中的服务器 ──
  const server = getActiveServer(db, userId);

  if (!server?.ip) {
    _deployLocks.delete(userId);
    // 没有服务器 → 数据库已更新，直接返回成功
    return success(res, {
      team: user.team,
      agents: user.agents,
      deploy: { mode: 'db-only', message: '数据库已更新，无运行中的服务器需要部署' },
    });
  }

  // ── 4. 有服务器 → SSE 流式部署 ──
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx 不缓冲
  });

  /** 发送 SSE 事件 */
  function sendEvent(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // 心跳保活：每 15 秒发送一次，防止代理/负载均衡器超时断开
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  // 确保部署结束时清理锁和心跳
  function finish() {
    clearInterval(heartbeat);
    _deployLocks.delete(userId);
    res.end();
  }

  // 客户端断开时清理
  req.on('close', () => {
    clearInterval(heartbeat);
    _deployLocks.delete(userId);
  });

  sendEvent('start', {
    templateId,
    templateName: template.templateName || template.templateId,
    memberCount: newMembers.length,
  });

  try {
    const result = await deployTemplateViaRPC(server, template, oldMembers, (phase, detail) => {
      sendEvent('progress', { phase, detail });
    });

    sendEvent('complete', {
      team: user.team,
      agents: user.agents,
      deploy: {
        mode: 'rpc',
        agentsDeployed: result.agentsDeployed,
        soulsWritten: result.soulsWritten,
        skillsInstalled: result.skillsInstalled,
        recommendedWorkflows: template.recommendedWorkflows || [],
      },
    });

    // 推送 dispatch-config.json
    try {
      await rebuildAndPushForUser(user.id, await getDB(), server);
    } catch (e) { console.warn('部署后推送调度配置失败:', e.message); }
  } catch (err) {
    console.error('❌ 模板部署失败:', err.message);
    sendEvent('error', {
      message: err.message,
      team: user.team, // 数据库已更新，返回当前状态
    });
  }

  finish();
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

// ═══════════════════════════════════════════════════════════
// 工作流激活
export default router;

console.log('✅ lume 团队管理 API 已加载（支持配置合并）');
