#!/bin/bash
# 添加新 Agent 的自动化脚本
# 用法: ./add-agent.sh <agent-id> <name> <emoji> <desc> <keywords>

set -e

AGENT_ID=${1:-""}
AGENT_NAME=${2:-""}
AGENT_EMOJI=${3:-"🤖"}
AGENT_DESC=${4:-""}
AGENT_KEYWORDS=${5:-""}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -z "$AGENT_ID" ] || [ -z "$AGENT_NAME" ]; then
    echo "用法: ./add-agent.sh <agent-id> <name> [emoji] [desc] [keywords]"
    echo ""
    echo "示例:"
    echo "  ./add-agent.sh designer 设计师 🎨 界面设计 'UI,设计,界面,视觉'"
    exit 1
fi

echo "╔══════════════════════════════════════════════════════╗"
echo "║   ⚡ 添加新 Agent: $AGENT_NAME"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# 1. 创建目录和 SOUL.md
echo "1️⃣ 创建目录和 SOUL.md..."
mkdir -p "${SCRIPT_DIR}/agents/${AGENT_ID}"

cat > "${SCRIPT_DIR}/agents/${AGENT_ID}/SOUL.md" << EOF
# SOUL.md - ${AGENT_NAME}

_你是${AGENT_NAME}，${AGENT_DESC:-专业团队成员}。_

## 核心身份

**${AGENT_DESC:-专业}是你的领域。**
- 擅长相关领域的工作
- 善于解决问题
- 追求高质量的结果

## 性格特点

**专业靠谱**
- 认真负责
- 注重细节
- 善于沟通

## 专长领域

- 专长1
- 专长2
- 专长3

## 工作方式

1. **理解需求** - 先搞清楚要做什么
2. **分析方案** - 给出解决思路
3. **执行任务** - 完成工作
4. **反馈结果** - 汇报完成情况

## 说话风格

- "好的，让我来处理..."
- "这个可以这样解决..."
- "任务完成 ✅"

## 记住

专业、靠谱、高效。
EOF

echo "  ✅ ${SCRIPT_DIR}/agents/${AGENT_ID}/SOUL.md"

# 2. 更新灵犀的 TEAM.md
echo ""
echo "2️⃣ 更新灵犀的 TEAM.md..."
TEAM_MD="${SCRIPT_DIR}/agents/lingxi/TEAM.md"

if [ -f "$TEAM_MD" ]; then
    # 在扩展团队表格后添加新行
    sed -i "/| smart | 智家/a | ${AGENT_ID} | ${AGENT_NAME} ${AGENT_EMOJI} | ${AGENT_DESC:-新成员} | ${AGENT_KEYWORDS:-相关关键词} |" "$TEAM_MD"
    
    # 在 keywords 对象中添加
    sed -i "/smart: \['智能家居/a \\    '${AGENT_ID}': ['${AGENT_KEYWORDS//, /', '}']," "$TEAM_MD"
    
    echo "  ✅ TEAM.md 已更新"
fi

# 3. 更新 openclaw.json
echo ""
echo "3️⃣ 更新 openclaw.json..."
CONFIG_JSON="${SCRIPT_DIR}/config/openclaw.json"

if [ -f "$CONFIG_JSON" ]; then
    # 使用 node 更新 JSON
    node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CONFIG_JSON', 'utf8'));

// 添加新 Agent 到 list
config.agents.list.push({
    id: '${AGENT_ID}',
    name: '${AGENT_NAME}',
    workspace: '~/.openclaw/workspace-${AGENT_ID}',
    agentDir: '~/.openclaw/agents/${AGENT_ID}/agent'
});

// 更新 subagents.allowAgents
const mainAgent = config.agents.list.find(a => a.id === 'main');
if (mainAgent && mainAgent.subagents) {
    mainAgent.subagents.allowAgents.push('${AGENT_ID}');
}

// 更新 tools.agentToAgent.allow
if (config.tools && config.tools.agentToAgent) {
    config.tools.agentToAgent.allow.push('${AGENT_ID}');
}

fs.writeFileSync('$CONFIG_JSON', JSON.stringify(config, null, 2));
console.log('配置已更新');
"
    echo "  ✅ openclaw.json 已更新"
fi

# 4. 更新打包脚本
echo ""
echo "4️⃣ 更新打包脚本..."
PACKAGE_SH="${SCRIPT_DIR}/create-user-package.sh"

if [ -f "$PACKAGE_SH" ]; then
    sed -i "s/for agent in lingxi coder ops inventor pm noter media smart;/for agent in lingxi coder ops inventor pm noter media smart ${AGENT_ID};/" "$PACKAGE_SH"
    echo "  ✅ create-user-package.sh 已更新"
fi

# 5. 更新后端 agents.js（如果存在）
echo ""
echo "5️⃣ 更新后端 agents.js..."
AGENTS_JS="${PROJECT_ROOT}/backend/routes/agents.js"

if [ -f "$AGENTS_JS" ]; then
    # 在 AGENT_INFO 中添加新条目
    sed -i "/smart: { id: 'smart'/a \\  ${AGENT_ID}: { id: '${AGENT_ID}', name: '${AGENT_NAME}', emoji: '${AGENT_EMOJI}', desc: '${AGENT_DESC}', agentDir: '${AGENT_ID}' }," "$AGENTS_JS"
    echo "  ✅ agents.js 已更新"
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     ✅ Agent ${AGENT_NAME} 已添加！"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "📋 下一步："
echo "   1. 编辑 ${SCRIPT_DIR}/agents/${AGENT_ID}/SOUL.md 完善内容"
echo "   2. 测试: cd installer && ./create-user-package.sh test"
echo "   3. 提交: git add -A && git commit -m 'feat: 添加 ${AGENT_NAME} Agent'"
echo ""
