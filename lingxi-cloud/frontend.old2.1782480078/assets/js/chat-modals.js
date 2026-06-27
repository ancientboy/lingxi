/**
 * 灵犀云聊天 - 弹窗功能
 */

const API_BASE = window.location.origin;
let currentUserInfo = null;

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
  // 绑定发送按钮
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  
  // 绑定回车
  document.getElementById('messageInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // 点击外部关闭下拉
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.agent-switcher') && !e.target.closest('.agent-dropdown')) {
      document.getElementById('agentDropdown')?.classList.remove('show');
    }
    if (!e.target.closest('.user-info') && !e.target.closest('.dropdown-content')) {
      document.getElementById('userDropdown')?.classList.remove('show');
    }
  });
  
  // 初始化用户信息
  await initUser();
});

// ==================== 用户初始化 ====================

async function initUser() {
  const token = localStorage.getItem('lingxi_token');
  if (!token) {
    window.location.href = '/';
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      localStorage.removeItem('lingxi_token');
      window.location.href = '/';
      return;
    }
    
    const data = await res.json();
    currentUserInfo = data.user || data;
    
    // 更新用户名
    const nameEl = document.getElementById('navUserName');
    if (nameEl && currentUserInfo.nickname) {
      nameEl.textContent = currentUserInfo.nickname;
    }
    
    // 初始化 Agent 列表
    if (currentUserInfo.agents && currentUserInfo.agents.length > 0) {
      userAgents = currentUserInfo.agents;
    }
    
    renderAgentDropdown();
    
    // 获取服务器信息并连接
    await initServer();
    
  } catch (error) {
    console.error('初始化失败:', error);
  }
}

async function initServer() {
  const token = localStorage.getItem('lingxi_token');
  
  try {
    const res = await fetch(`${API_BASE}/api/servers/${currentUserInfo.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.ok) {
      const data = await res.json();
      serverInfo = data.server;
      
      if (serverInfo && serverInfo.status === 'running') {
        GATEWAY_URL = `ws://${serverInfo.ip}:${serverInfo.openclawPort}`;
        GATEWAY_TOKEN = serverInfo.openclawToken;
        SESSION_ID = serverInfo.openclawSession;
        connectWebSocket();
      } else {
        addSystemMessage('⚠️ 请先在首页"一键领取 AI 团队"');
      }
    }
  } catch (error) {
    console.error('获取服务器信息失败:', error);
  }
}

// ==================== 下拉菜单 ====================

function toggleAgentDropdown() {
  document.getElementById('agentDropdown').classList.toggle('show');
  document.getElementById('userDropdown')?.classList.remove('show');
}

function toggleUserDropdown() {
  document.getElementById('userDropdown').classList.toggle('show');
  document.getElementById('agentDropdown')?.classList.remove('show');
}

// ==================== 弹窗控制 ====================

function openModal(id) {
  document.getElementById(id).classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

// ==================== 团队管理 ====================

async function showMyTeam() {
  document.getElementById('userDropdown')?.classList.remove('show');
  
  // 刷新用户信息
  const token = localStorage.getItem('lingxi_token');
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (res.ok) {
    const data = await res.json();
    currentUserInfo = data.user || data;
    if (currentUserInfo.agents) {
      userAgents = currentUserInfo.agents;
    }
  }
  
  renderTeamList();
  renderAvailableAgents();
  openModal('teamModal');
}

function renderTeamList() {
  const list = document.getElementById('teamList');
  
  const agents = userAgents.map(id => ALL_AGENTS[id]).filter(Boolean);
  
  if (agents.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.5);padding:20px;">暂无团队成员</div>';
    return;
  }
  
  list.innerHTML = agents.map(agent => `
    <div class="team-item">
      <div class="team-item-info">
        <span style="font-size:24px;">${agent.emoji}</span>
        <div>
          <div style="font-weight:500;">${agent.name}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.5);">${agent.desc}</div>
        </div>
      </div>
      ${agent.id !== 'main' ? `<button class="remove-btn" onclick="removeAgent('${agent.id}')">移除</button>` : ''}
    </div>
  `).join('');
}

function renderAvailableAgents() {
  const list = document.getElementById('availableAgents');
  
  const available = Object.values(ALL_AGENTS).filter(a => !userAgents.includes(a.id));
  
  if (available.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.5);grid-column:span 2;">已添加全部成员</div>';
    return;
  }
  
  list.innerHTML = available.map(agent => `
    <button class="add-agent-btn" onclick="addAgent('${agent.id}')">
      ${agent.emoji} ${agent.name}
    </button>
  `).join('');
}

async function addAgent(agentId) {
  const token = localStorage.getItem('lingxi_token');
  const newAgents = [...userAgents, agentId];
  
  try {
    const res = await fetch(`${API_BASE}/api/agents/user/${currentUserInfo.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ agents: newAgents })
    });
    
    if (res.ok) {
      userAgents = newAgents;
      renderTeamList();
      renderAvailableAgents();
      renderAgentDropdown();
    }
  } catch (error) {
    console.error('添加失败:', error);
  }
}

async function removeAgent(agentId) {
  const token = localStorage.getItem('lingxi_token');
  const newAgents = userAgents.filter(a => a !== agentId);
  
  try {
    const res = await fetch(`${API_BASE}/api/agents/user/${currentUserInfo.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ agents: newAgents })
    });
    
    if (res.ok) {
      userAgents = newAgents;
      renderTeamList();
      renderAvailableAgents();
      renderAgentDropdown();
    }
  } catch (error) {
    console.error('移除失败:', error);
  }
}

// ==================== 会话列表 ====================

function showSessionList() {
  document.getElementById('userDropdown')?.classList.remove('show');
  openModal('sessionModal');
  // TODO: 加载历史会话
}

// ==================== 飞书配置 ====================

function showFeishuConfig() {
  document.getElementById('userDropdown')?.classList.remove('show');
  openModal('feishuModal');
  
  // 加载已有配置
  loadFeishuConfig();
}

async function loadFeishuConfig() {
  const token = localStorage.getItem('lingxi_token');
  try {
    const res = await fetch(`${API_BASE}/api/remote-config/feishu?userId=${currentUserInfo.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.appId) {
        document.getElementById('feishuAppId').value = data.appId;
      }
    }
  } catch (error) {
    console.log('加载飞书配置失败');
  }
}

async function saveFeishuConfig(e) {
  e.preventDefault();
  
  const token = localStorage.getItem('lingxi_token');
  const appId = document.getElementById('feishuAppId').value;
  const appSecret = document.getElementById('feishuAppSecret').value;
  
  try {
    const res = await fetch(`${API_BASE}/api/remote-config/feishu`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        userId: currentUserInfo.id,
        appId,
        appSecret
      })
    });
    
    if (res.ok) {
      alert('飞书配置已保存');
      closeModal('feishuModal');
    } else {
      const data = await res.json();
      alert(data.error || '保存失败');
    }
  } catch (error) {
    alert('保存失败: ' + error.message);
  }
}

// ==================== 企业微信配置 ====================

function showWecomConfig() {
  document.getElementById('userDropdown')?.classList.remove('show');
  openModal('wecomModal');
}

async function saveWecomConfig(e) {
  e.preventDefault();
  
  const token = localStorage.getItem('lingxi_token');
  const corpId = document.getElementById('wecomCorpId').value;
  const agentId = document.getElementById('wecomAgentId').value;
  const secret = document.getElementById('wecomSecret').value;
  
  try {
    const res = await fetch(`${API_BASE}/api/remote-config/wecom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        userId: currentUserInfo.id,
        corpId,
        agentId,
        secret
      })
    });
    
    if (res.ok) {
      alert('企业微信配置已保存');
      closeModal('wecomModal');
    } else {
      const data = await res.json();
      alert(data.error || '保存失败');
    }
  } catch (error) {
    alert('保存失败: ' + error.message);
  }
}

// ==================== 修改密码 ====================

function showPasswordChange() {
  document.getElementById('userDropdown')?.classList.remove('show');
  openModal('passwordModal');
}

async function changePassword(e) {
  e.preventDefault();
  
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  
  if (newPassword !== confirmPassword) {
    alert('两次密码不一致');
    return;
  }
  
  const token = localStorage.getItem('lingxi_token');
  
  try {
    const res = await fetch(`${API_BASE}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      alert('密码修改成功');
      closeModal('passwordModal');
      document.getElementById('passwordForm').reset();
    } else {
      alert(data.error || '修改失败');
    }
  } catch (error) {
    alert('修改失败: ' + error.message);
  }
}

// ==================== 设置 ====================

function showSettings() {
  document.getElementById('userDropdown')?.classList.remove('show');
  openModal('settingsModal');
}

// ==================== 快捷发送 ====================

function quickSend(text) {
  document.getElementById('messageInput').value = text;
  sendMessage();
}

// ==================== 退出登录 ====================

function logout() {
  localStorage.removeItem('lingxi_token');
  window.location.href = '/';
}
