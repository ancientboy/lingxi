#!/bin/bash

# 前端团队显示修复脚本
# 修复 renderMyTeam, renderAvailableAgents, renderAgentDropdown, initAgentDropdown 函数

FILE="chat.js"
BACKUP="chat.js.backup.$(date +%s)"

echo "📝 创建备份..."
cp "$FILE" "$BACKUP"

echo "🔧 应用修复..."

# 1. 修复 renderMyTeam 函数
echo "  - 修复 renderMyTeam..."
python3 << 'PYTHON'
import re

with open('chat.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 找到 renderMyTeam 函数并替换
old_func = r'function renderMyTeam\(\) \{[^}]+\}[^}]+\}[^}]+\}[^}]+\}\s+if \(!user\?\.agents'

new_func = '''function renderMyTeam() {
  // 优先使用 user.team.members（包含完整信息），回退到 user.agents
  let myAgents = [];
  let agentDetails = {};
  
  if (user?.team?.members && user.team.members.length > 0) {
    myAgents = user.team.members.map(m => m.id);
    agentDetails = Object.fromEntries(user.team.members.map(m => [m.id, m]));
  } else if (user?.agents && user.agents.length > 0) {
    myAgents = user.agents;
  } else {
    myAgents = ['lingxi'];
  }
  
  const container = document.getElementById('myTeamList');
  if (!container) return;

  container.innerHTML = myAgents.map(agentId => {
    const agent = agentDetails[agentId] || AGENT_INFO[agentId] || { icon: 'bot', name: agentId, desc: 'AI 助手' };
    const isRequired = agentId === 'lingxi' || agent.isDefault;

    return `
      <div class="team-member">
        <div class="team-member-info">
          <div class="team-member-avatar">
            <i data-lucide="${agent.icon || 'bot'}" class="icon icon-lg icon-primary"></i>
          </div>
          <div>
            <div class="team-member-name">${agent.name || agentId}</div>
            <div class="team-member-role">${agent.desc || agent.role || 'AI 助手'}</div>
          </div>
        </div>
        ${isRequired ?
          '<span class="team-badge">队长</span>' :
          `<button class="remove-btn" onclick="removeAgent('${agentId}')">移除</button>`
        }
      </div>
    `;
  }).join('');
  
  if (!user?.team?.members || user.team.members.length === 0) {'''

content = re.sub(r'function renderMyTeam\(\) \{[^}]+\{[^}]+\{[^}]+\{[^}]+\{[^}]+if \(!user\?\.agents', 
                 new_func, content, flags=re.DOTALL)

with open('chat.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('    ✅ renderMyTeam 已修复')
PYTHON

# 2. 修复 renderAvailableAgents
echo "  - 修复 renderAvailableAgents..."
sed -i 's/const myAgents = user?.agents || \['\''lingxi'\''\];/const myAgents = user?.team?.members ? user.team.members.map(m => m.id) : (user?.agents || ['\''lingxi'\'']);/' chat.js

# 3. 修复 renderAgentDropdown
echo "  - 修复 renderAgentDropdown..."
sed -i 's/const agents = userAgentList\.map(id => ALL_AGENTS\[id\])\.filter(Boolean);/let agents = [];\n  if (user?.team?.members \&\& user.team.members.length > 0) {\n    agents = user.team.members.map(m => ({ id: m.id, name: m.name, icon: m.icon, desc: m.desc }));\n  } else {\n    agents = userAgentList.map(id => ALL_AGENTS[id] || AGENT_INFO[id] || { id, name: id, icon: '\''bot'\'', desc: '\''AI 助手'\'' });\n  }/' chat.js

# 4. 修复 initAgentDropdown
echo "  - 修复 initAgentDropdown..."
sed -i "s/if (user?.agents && user.agents.length > 0) {/if (user?.team?.members \&\& user.team.members.length > 0) {\n    userAgentList = user.team.members.map(m => m.id);\n    currentAgentId = userAgentList.includes('lingxi') ? 'lingxi' : userAgentList[0];\n  } else if (user?.agents \&\& user.agents.length > 0) {/" chat.js

echo ""
echo "✅ 修复完成！"
echo "📦 备份文件：$BACKUP"
echo ""
echo "🔄 请更新 chat.html 中的版本号强制刷新："
echo "   sed -i \"s/chat.js?v=[0-9]*/chat.js?v=$(date +%s)/\" ../chat.html"
