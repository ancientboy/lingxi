#!/bin/bash

# 测试用 SSH 同步脚本（用于褚时服务器）
# 模拟 team.js 中的 syncAgentsToServer 函数

SERVER_IP="114.55.149.200"
SSH_PASS="Lingxi@2026!"

echo "=== 测试团队配置同步到褚时服务器 ==="
echo "服务器：$SERVER_IP"
echo ""

# 准备团队成员配置（包含自定义模型）
TEAM_MEMBERS='[
  {"id":"lingxi","name":"灵犀","model":"zhipu/glm-5"},
  {"id":"coder","name":"云溪","model":"alibaba-cloud/qwen3-coder-plus"},
  {"id":"ops","name":"若曦","model":"alibaba-cloud/qwen3.5-plus"},
  {"id":"inventor","name":"紫萱"},
  {"id":"pm","name":"梓萱"},
  {"id":"noter","name":"晓琳"},
  {"id":"media","name":"音韵"},
  {"id":"smart","name":"智家"}
]'

AGENT_INFO='{
  "lingxi": {"id":"main","name":"灵犀","agentDir":"~/.openclaw/agents/main/agent","workspace":"~/.openclaw/workspace"},
  "coder": {"id":"coder","name":"云溪","agentDir":"~/.openclaw/agents/coder/agent","workspace":"~/.openclaw/workspace-coder"},
  "ops": {"id":"ops","name":"若曦","agentDir":"~/.openclaw/agents/ops/agent","workspace":"~/.openclaw/workspace-ops"},
  "inventor": {"id":"inventor","name":"紫萱","agentDir":"~/.openclaw/agents/inventor/agent","workspace":"~/.openclaw/workspace-inventor"},
  "pm": {"id":"pm","name":"梓萱","agentDir":"~/.openclaw/agents/pm/agent","workspace":"~/.openclaw/workspace-pm"},
  "noter": {"id":"noter","name":"晓琳","agentDir":"~/.openclaw/agents/noter/agent","workspace":"~/.openclaw/workspace-noter"},
  "media": {"id":"media","name":"音韵","agentDir":"~/.openclaw/agents/media/agent","workspace":"~/.openclaw/workspace-media"},
  "smart": {"id":"smart","name":"智家","agentDir":"~/.openclaw/agents/smart/agent","workspace":"~/.openclaw/workspace-smart"}
}'

# SSH 命令
COMMANDS="set -e

echo '=== 开始同步团队配置 ==='

# 1. 备份原配置
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak.test

# 2. 更新 openclaw.json（合并策略）
node -e '
const fs = require(\"fs\");
const configPath = process.env.HOME + \"/.openclaw/openclaw.json\";
const config = JSON.parse(fs.readFileSync(configPath, \"utf8\"));

const oldAgents = config.agents || {};
const oldDefaults = oldAgents.defaults || { model: { primary: \"alibaba-cloud/qwen3.5-plus\" }, workspace: \"~/.openclaw/workspace\" };
const oldList = oldAgents.list || [];

const newTeamMembers = $TEAM_MEMBERS;
const agentInfo = $AGENT_INFO;

const oldAgentMap = {};
oldList.forEach(agent => { oldAgentMap[agent.id] = agent; });

const newAgentList = newTeamMembers.map(member => {
  const agentId = member.id;
  const isLingxi = agentId === \"lingxi\";
  const configId = isLingxi ? \"main\" : agentId;
  const info = agentInfo[agentId] || {};
  
  const existing = oldAgentMap[configId] || oldAgentMap[agentId];
  
  const mergedConfig = {
    id: configId,
    default: isLingxi ? true : (existing?.default || false),
    name: member.name || info.name || agentId,
    ...(existing?.model ? { model: existing.model } : {}),
    ...(member.model ? { model: member.model } : {}),
    workspace: existing?.workspace || member.workspace || info.workspace || \"~/.openclaw/workspace-\" + agentId,
    agentDir: existing?.agentDir || info.agentDir || \"~/.openclaw/agents/\" + configId + \"/agent\",
    ...(isLingxi || existing?.subagents ? {
      subagents: {
        allowAgents: newTeamMembers.map(m => m.id).filter(id => id !== \"lingxi\")
      }
    } : {})
  };
  
  if (existing) {
    console.log(\"✅ 保留已有配置：\" + configId + (member.model ? \" (模型：\" + member.model + \")\" : \"\"));
  } else {
    console.log(\"➕ 创建新配置：\" + configId);
  }
  
  return mergedConfig;
});

config.agents = { ...oldAgents, defaults: oldDefaults, list: newAgentList };
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log(\"✅ openclaw.json 已更新，共 \" + newAgentList.length + \" 个成员\");
'

# 3. 创建 SOUL.md 和工作区
for agent in coder ops inventor pm noter media smart; do
  AGENT_DIR=\"~/.openclaw/agents/\$agent/agent\"
  WORKSPACE=\"~/.openclaw/workspace-\$agent\"
  
  mkdir -p \"\$AGENT_DIR\"
  mkdir -p \"\$WORKSPACE\"
  
  if [ ! -f \"\$AGENT_DIR/SOUL.md\" ]; then
    echo \"创建 \$agent 的 SOUL.md\"
    echo \"# \$agent\" > \"\$AGENT_DIR/SOUL.md\"
  else
    echo \"✅ \$agent 的 SOUL.md 已存在\"
  fi
done

echo ''
echo '=== ✅ 团队配置同步完成 ==='
"

# 执行 SSH 命令
echo "执行 SSH 命令..."
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no root@$SERVER_IP "$COMMANDS"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ 同步成功！"
  echo ""
  echo "验证配置..."
  sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no root@$SERVER_IP "cat ~/.openclaw/openclaw.json | grep -A 3 '\"model\"' | head -20"
else
  echo ""
  echo "❌ 同步失败"
  exit 1
fi
