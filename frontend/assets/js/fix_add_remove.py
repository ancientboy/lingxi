#!/usr/bin/env python3
import re

filename = 'chat.js'

with open(filename, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 修复 addAgent 函数
old_add_agent = '''async function addAgent(agentId) {
  if (!user) return;

  const myAgents = user.agents || ['lingxi'];
  if (myAgents.includes(agentId)) return;

  myAgents.push(agentId);
  user.agents = myAgents;

  // 保存到服务器
  try {
    const res = await fetch(`${API_BASE}/api/agents/user/${user.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      },
      body: JSON.stringify({ agents: myAgents })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      localStorage.setItem('lingxi_user', JSON.stringify(user));
      renderMyTeam();
      renderAvailableAgents();
      renderTeamTags();
      initAgentDropdown();  // ✅ 刷新顶部 agent 下拉列表
      console.log('✅ 成员添加成功:', agentId);
    } else {
      // 回滚
      user.agents = user.agents.filter(id => id !== agentId);
      alert('添加失败：' + (data.error || '未知错误'));
    }
  } catch (e) {
    // 回滚
    user.agents = user.agents.filter(id => id !== agentId);
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
      renderAvailableAgents();
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
print('✅ addAgent 已修复')

# 2. 修复 removeAgent 函数
old_remove_agent_pattern = r'async function removeAgent\(agentId\) \{[^}]+\{[^}]+\{[^}]+user\.agents = user\.agents\.filter\(id => id !== agentId\);[^}]+\}'

# 找到 removeAgent 函数的位置
remove_agent_start = content.find('async function removeAgent(agentId)')
if remove_agent_start == -1:
    print('❌ 未找到 removeAgent 函数')
    exit(1)

# 找到函数结束位置
brace_count = 0
in_function = False
end_pos = remove_agent_start

for i, char in enumerate(content[remove_agent_start:], remove_agent_start):
    if char == '{':
        brace_count += 1
        in_function = True
    elif char == '}':
        brace_count -= 1
        if in_function and brace_count == 0:
            end_pos = i + 1
            break

old_remove_agent = content[remove_agent_start:end_pos]

new_remove_agent = '''async function removeAgent(agentId) {
  if (!user || !user?.team?.members) return;

  // 不允许删除默认成员（灵犀）
  const member = user.team.members.find(m => m.id === agentId);
  if (!member) {
    alert('成员不存在');
    return;
  }
  
  if (member.isDefault) {
    alert('不能删除默认成员');
    return;
  }

  if (!confirm(`确定要移除 ${member.name} 吗？`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/team/${user.id}/members/${agentId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      }
    });

    const data = await res.json();

    if (res.ok && data.success) {
      // 更新本地 user 对象
      user.team = data.team;
      user.agents = data.team.members.map(m => m.id);
      localStorage.setItem('lingxi_user', JSON.stringify(user));
      
      renderMyTeam();
      renderAvailableAgents();
      renderTeamTags();
      initAgentDropdown();
      console.log('✅ 成员移除成功:', agentId);
    } else {
      alert('移除失败：' + (data.error || '未知错误'));
    }
  } catch (e) {
    console.error('移除成员失败:', e);
    alert('网络错误：' + e.message);
  }
}'''

content = content[:remove_agent_start] + new_remove_agent + content[end_pos:]
print('✅ removeAgent 已修复')

with open(filename, 'w', encoding='utf-8') as f:
    f.write(content)

print('\\n✅ 所有修复完成！')
