#!/usr/bin/env python3
"""
前端团队显示修复脚本
修复 4 个函数以正确使用 user.team.members
"""

import re
import sys
from datetime import datetime

def fix_chat_js():
    filename = 'chat.js'
    backup = f'chat.js.backup.{datetime.now().strftime("%Y%m%d_%H%M%S")}'
    
    print(f'📝 创建备份：{backup}')
    with open(filename, 'r', encoding='utf-8') as f:
        original = f.read()
    
    with open(backup, 'w', encoding='utf-8') as f:
        f.write(original)
    
    content = original
    
    # 1. 修复 renderMyTeam
    print('  🔧 修复 renderMyTeam...')
    old_render_my_team = re.search(
        r'function renderMyTeam\(\) \{.*?if \(window\.lucide\) lucide\.createIcons\(\);.*?\}',
        content,
        re.DOTALL
    )
    
    if old_render_my_team:
        new_render_my_team = '''function renderMyTeam() {
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
  
  // 如果用户没有团队，显示提示
  if (!user?.team?.members || user.team.members.length === 0) {
    container.innerHTML += `
      <div style="text-align:center;padding:16px;color:#6b7280;font-size:13px;margin-top:12px;border-top:1px solid #e5e7eb;">
        💡 你还没有领取完整团队<br>邀请好友获得积分后即可领取
      </div>
    `;
  }
  
  // 重新渲染图标
  if (window.lucide) lucide.createIcons();
}'''
        
        content = content[:old_render_my_team.start()] + new_render_my_team + content[old_render_my_team.end():]
        print('    ✅ renderMyTeam 已修复')
    else:
        print('    ⚠️  未找到 renderMyTeam 函数')
    
    # 2. 修复 renderAvailableAgents
    print('  🔧 修复 renderAvailableAgents...')
    content = re.sub(
        r"const myAgents = user\?\.agents \|\| \['lingxi'\];",
        "const myAgents = user?.team?.members ? user.team.members.map(m => m.id) : (user?.agents || ['lingxi']);",
        content
    )
    print('    ✅ renderAvailableAgents 已修复')
    
    # 3. 修复 renderAgentDropdown
    print('  🔧 修复 renderAgentDropdown...')
    old_agents_line = "const agents = userAgentList.map(id => ALL_AGENTS[id]).filter(Boolean);"
    new_agents_code = '''let agents = [];
  if (user?.team?.members && user.team.members.length > 0) {
    agents = user.team.members.map(m => ({
      id: m.id,
      name: m.name,
      icon: m.icon,
      desc: m.desc
    }));
  } else {
    agents = userAgentList.map(id => {
      return ALL_AGENTS[id] || AGENT_INFO[id] || { id, name: id, icon: 'bot', desc: 'AI 助手' };
    });
  }'''
    
    content = content.replace(old_agents_line, new_agents_code)
    print('    ✅ renderAgentDropdown 已修复')
    
    # 4. 修复 initAgentDropdown
    print('  🔧 修复 initAgentDropdown...')
    old_init = '''if (user?.agents && user.agents.length > 0) {
    userAgentList = user.agents;
    // 设置当前 agent 为用户的第一个（或 lingxi）
    currentAgentId = userAgentList.includes('lingxi') ? 'lingxi' : userAgentList[0];'''
    
    new_init = '''if (user?.team?.members && user.team.members.length > 0) {
    userAgentList = user.team.members.map(m => m.id);
    currentAgentId = userAgentList.includes('lingxi') ? 'lingxi' : userAgentList[0];
    
    const currentMember = user.team.members.find(m => m.id === currentAgentId);
    const agent = currentMember || ALL_AGENTS[currentAgentId] || AGENT_INFO[currentAgentId];
    if (agent) {
      const iconEl = document.getElementById('currentAgentIcon');
      if (iconEl) {
        iconEl.setAttribute('data-lucide', agent.icon || 'bot');
        if (window.lucide) lucide.createIcons();
      }
    }
  } else if (user?.agents && user.agents.length > 0) {
    userAgentList = user.agents;
    currentAgentId = userAgentList.includes('lingxi') ? 'lingxi' : userAgentList[0];'''
    
    content = content.replace(old_init, new_init)
    print('    ✅ initAgentDropdown 已修复')
    
    # 保存修复后的文件
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f'\n✅ 修复完成！')
    print(f'📦 备份文件：{backup}')
    
    return True

if __name__ == '__main__':
    if fix_chat_js():
        print('\n🔄 下一步：更新 chat.html 中的版本号')
        print(f'   运行：sed -i "s/chat.js?v=[0-9]*/chat.js?v={int(datetime.now().timestamp())}/" ../chat.html')
        sys.exit(0)
    else:
        sys.exit(1)
