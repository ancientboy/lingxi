#!/usr/bin/env python3

filename = 'chat.js'

with open(filename, 'r', encoding='utf-8') as f:
    content = f.read()

old_add_agent = '''async function addAgent(agentId) {
  if (!user) return;

  // 检查是否已存在
  const currentMembers = user?.team?.members || [];
  if (currentMembers.some(m => m.id === agentId)) {
    console.log('成员已存在:', agentId);
    return;
  }

  // 从 AGENT_INFO 获取成员信息
  const agentInfo = AGENT_INFO[agentId] || { id: agentId, name: agentId, icon: 'bot', desc: 'AI 助手' };
  
  const newMember = {
    id: agentId,
    name: agentInfo.name,
    icon: agentInfo.icon,
    role: agentInfo.desc,
    desc: agentInfo.desc,
    triggers: [agentId]
  };

  try {
    const res = await fetch(`${API_BASE}/api/team/${user.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      },
      body: JSON.stringify(newMember)
    });

    const data = await res.json();

    if (res.ok && data.success) {
      // 更新本地 user 对象
      user.team = data.team;
      user.agents = data.team.members.map(m => m.id);
      localStorage.setItem('lingxi_user', JSON.stringify(user));
      
      renderMyTeam();
      await renderAvailableAgents();
      renderTeamTags();
      initAgentDropdown();
      console.log('✅ 成员添加成功:', agentId);
    } else {
      alert('添加失败：' + (data.error || '未知错误'));
    }
  } catch (e) {
    console.error('添加成员失败:', e);
    alert('网络错误：' + e.message);
  }
}'''

new_add_agent = '''async function addAgent(agentId) {
  if (!user) return;

  // 检查是否已存在
  const currentMembers = user?.team?.members || [];
  if (currentMembers.some(m => m.id === agentId)) {
    console.log('成员已存在:', agentId);
    return;
  }

  // 优先从当前团队模板获取成员信息，其次从 AGENT_INFO 获取
  let memberInfo = null;
  
  // 1. 从当前团队模板中查找
  if (user?.team?.templateId) {
    try {
      const res = await fetch(`${API_BASE}/api/team/templates/${user.team.templateId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.template) {
          memberInfo = data.template.members.find(m => m.id === agentId);
        }
      }
    } catch (e) {
      console.error('获取模板信息失败:', e);
    }
  }
  
  // 2. 如果模板中没有，从 AGENT_INFO 获取
  if (!memberInfo) {
    memberInfo = AGENT_INFO[agentId];
  }
  
  // 3. 如果都没有，使用默认值
  if (!memberInfo) {
    memberInfo = { id: agentId, name: agentId, icon: 'bot', desc: 'AI 助手' };
  }
  
  const newMember = {
    id: agentId,
    name: memberInfo.name,
    icon: memberInfo.icon,
    role: memberInfo.desc || memberInfo.role,
    desc: memberInfo.desc || memberInfo.role,
    triggers: memberInfo.triggers || [agentId]
  };

  try {
    const res = await fetch(`${API_BASE}/api/team/${user.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      },
      body: JSON.stringify(newMember)
    });

    const data = await res.json();

    if (res.ok && data.success) {
      // 更新本地 user 对象
      user.team = data.team;
      user.agents = data.team.members.map(m => m.id);
      localStorage.setItem('lingxi_user', JSON.stringify(user));
      
      renderMyTeam();
      await renderAvailableAgents();
      renderTeamTags();
      initAgentDropdown();
      console.log('✅ 成员添加成功:', agentId);
    } else {
      alert('添加失败：' + (data.error || '未知错误'));
    }
  } catch (e) {
    console.error('添加成员失败:', e);
    alert('网络错误：' + e.message);
  }
}'''

content = content.replace(old_add_agent, new_add_agent)

with open(filename, 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ addAgent 已修复：优先从模板获取成员信息')
PYEOF

python3 /tmp/fix_add_agent_info.py
