#!/usr/bin/env python3
import re

filename = 'chat.js'

with open(filename, 'r', encoding='utf-8') as f:
    content = f.read()

# 找到并替换整个 initAgentDropdown 函数
old_pattern = r'function initAgentDropdown\(\) \{.*?renderAgentDropdown\(\);\n\}'

new_function = '''function initAgentDropdown() {
  console.log('🎯 initAgentDropdown 调用，user:', user);
  
  // 优先使用 user.team.members
  if (user?.team?.members && user.team.members.length > 0) {
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
    currentAgentId = userAgentList.includes('lingxi') ? 'lingxi' : userAgentList[0];
    
    const agent = ALL_AGENTS[currentAgentId] || AGENT_INFO[currentAgentId];
    if (agent) {
      const iconEl = document.getElementById('currentAgentIcon');
      if (iconEl) {
        iconEl.setAttribute('data-lucide', agent.icon || 'bot');
        if (window.lucide) lucide.createIcons();
      }
    }
  }
  
  console.log('🎯 userAgentList:', userAgentList);
  renderAgentDropdown();
}'''

content = re.sub(old_pattern, new_function, content, flags=re.DOTALL)

with open(filename, 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ initAgentDropdown 已修复')
