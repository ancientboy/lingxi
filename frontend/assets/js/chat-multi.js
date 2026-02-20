/**
 * 灵犀云多 Agent 聊天
 * 顶部导航切换 Agent
 */

// ==================== 配置 ====================

const API_BASE = window.location.origin;
let GATEWAY_URL = '';
let GATEWAY_TOKEN = '';
let SESSION_ID = '';

// 所有 Agent 配置
const ALL_AGENTS = {
  main: { id: 'main', name: '灵犀', emoji: '⚡', desc: '团队队长' },
  coder: { id: 'coder', name: '云溪', emoji: '💻', desc: '代码专家' },
  ops: { id: 'ops', name: '若曦', emoji: '📊', desc: '数据分析' },
  inventor: { id: 'inventor', name: '紫萱', emoji: '💡', desc: '创意设计' },
  pm: { id: 'pm', name: '梓萱', emoji: '🎯', desc: '产品专家' },
  noter: { id: 'noter', name: '晓琳', emoji: '📝', desc: '知识管理' },
  media: { id: 'media', name: '音韵', emoji: '🎧', desc: '多媒体' },
  smart: { id: 'smart', name: '智家', emoji: '🏠', desc: '智能家居' }
};

// 用户当前显示的 Agent 列表（默认只有灵犀）
let userAgents = ['main'];

// ==================== 状态 ====================

let ws = null;
let currentAgent = 'main';
let isConnected = false;
let messageId = 0;
let userInfo = null;
let serverInfo = null;

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
  // 绑定发送按钮
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  
  // 绑定输入框回车
  document.getElementById('messageInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // 点击其他地方关闭下拉
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.agent-switcher') && !e.target.closest('.agent-dropdown')) {
      document.getElementById('agentDropdown').classList.remove('show');
    }
    if (!e.target.closest('.user-avatar') && !e.target.closest('.user-menu')) {
      document.getElementById('userMenu').classList.remove('show');
    }
  });
  
  // 初始化
  await initUserAndServer();
  renderAgentDropdown();
  
  if (GATEWAY_URL) {
    connectWebSocket();
  }
});

// ==================== 下拉菜单 ====================

function toggleAgentDropdown() {
  document.getElementById('agentDropdown').classList.toggle('show');
  document.getElementById('userMenu').classList.remove('show');
}

function toggleUserMenu() {
  document.getElementById('userMenu').classList.toggle('show');
  document.getElementById('agentDropdown').classList.remove('show');
}

function goToSettings() {
  window.location.href = '/';
}

// ==================== 用户和服务器初始化 ====================

async function initUserAndServer() {
  const token = localStorage.getItem('lingxi_token');
  
  if (!token) {
    window.location.href = '/';
    return;
  }
  
  try {
    // 获取用户信息
    const userRes = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!userRes.ok) {
      localStorage.removeItem('lingxi_token');
      window.location.href = '/';
      return;
    }
    
    const userData = await userRes.json();
    userInfo = userData.user || userData;
    
    // 获取用户的团队配置（安全访问）
    if (userInfo && userInfo.agents && Array.isArray(userInfo.agents) && userInfo.agents.length > 0) {
      userAgents = userInfo.agents;
    }
    
    console.log('用户团队:', userAgents);
    
    // 获取服务器信息
    const serverRes = await fetch(`${API_BASE}/api/servers/${userInfo.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (serverRes.ok) {
      const serverData = await serverRes.json();
      serverInfo = serverData.server;
      
      if (serverInfo && serverInfo.status === 'running') {
        GATEWAY_URL = `ws://${serverInfo.ip}:${serverInfo.openclawPort}`;
        GATEWAY_TOKEN = serverInfo.openclawToken;
        SESSION_ID = serverInfo.openclawSession;
      } else {
        addSystemMessage('⚠️ 请先在首页点击"一键领取 AI 团队"');
      }
    }
    
  } catch (error) {
    console.error('初始化失败:', error);
    addSystemMessage('⚠️ ' + error.message);
  }
}

// ==================== Agent 下拉 ====================

function renderAgentDropdown() {
  const dropdown = document.getElementById('agentDropdown');
  
  // 只显示用户配置的 Agent
  const agents = userAgents.map(id => ALL_AGENTS[id]).filter(Boolean);
  
  if (agents.length === 0) {
    dropdown.innerHTML = '<div style="padding: 20px; text-align: center; color: rgba(255,255,255,0.5);">暂无团队成员</div>';
    return;
  }
  
  dropdown.innerHTML = agents.map(agent => `
    <div class="agent-dropdown-item ${agent.id === currentAgent ? 'active' : ''}" 
         onclick="switchAgent('${agent.id}')">
      <span class="emoji">${agent.emoji}</span>
      <div class="info">
        <h4>${agent.name}</h4>
        <p>${agent.desc}</p>
      </div>
    </div>
  `).join('');
  
  // 更新当前显示
  updateCurrentAgent();
}

function updateCurrentAgent() {
  const agent = ALL_AGENTS[currentAgent] || ALL_AGENTS.main;
  document.getElementById('currentAgentEmoji').textContent = agent.emoji;
  document.getElementById('currentAgentName').textContent = agent.name;
}

function switchAgent(agentId) {
  if (agentId === currentAgent) {
    document.getElementById('agentDropdown').classList.remove('show');
    return;
  }
  
  currentAgent = agentId;
  updateCurrentAgent();
  renderAgentDropdown();
  
  addSystemMessage(`已切换到 ${ALL_AGENTS[agentId]?.emoji || ''} ${ALL_AGENTS[agentId]?.name || agentId}`);
  
  if (isConnected) {
    sendRequest('agent.switch', { agentId });
  }
}

// ==================== WebSocket ====================

function connectWebSocket() {
  if (!GATEWAY_URL) {
    updateStatus('disconnected', '未连接');
    return;
  }
  
  updateStatus('connecting', '连接中');
  
  const wsUrl = `${GATEWAY_URL}/${SESSION_ID}/ws?token=${GATEWAY_TOKEN}`;
  
  try {
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('✅ WebSocket 连接成功');
      isConnected = true;
      updateStatus('connected', '已连接');
      
      sendHandshake();
      sendRequest('chat.history', { limit: 20 });
    };
    
    ws.onmessage = (event) => {
      handleWebSocketMessage(JSON.parse(event.data));
    };
    
    ws.onclose = () => {
      isConnected = false;
      updateStatus('disconnected', '已断开');
      setTimeout(() => { if (GATEWAY_URL) connectWebSocket(); }, 5000);
    };
    
    ws.onerror = () => {
      isConnected = false;
      updateStatus('disconnected', '连接失败');
    };
    
  } catch (error) {
    updateStatus('disconnected', '连接失败');
  }
}

function sendHandshake() {
  sendRequest('handshake', {
    minProtocol: 3,
    maxProtocol: 3,
    client: { id: 'openclaw-control-ui', version: '1.0.0' },
    role: 'operator',
    scopes: ['operator.admin', 'operator.read', 'operator.write'],
    auth: { token: GATEWAY_TOKEN }
  });
}

function sendRequest(method, params = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ id: `req_${++messageId}`, method, params }));
}

// ==================== 消息处理 ====================

function handleWebSocketMessage(data) {
  if (data.type === 'response') {
    if (data.result && data.result.messages) {
      document.getElementById('messages').innerHTML = '';
      data.result.messages.forEach(msg => {
        if (msg.role === 'user') addUserMessage(msg.content);
        else if (msg.role === 'assistant') addAssistantMessage(msg.content);
      });
    }
  } else if (data.type === 'event') {
    if (data.event === 'chat.message' || data.event === 'chat.response') {
      hideTyping();
      if (data.params?.content) addAssistantMessage(data.params.content);
    } else if (data.event === 'chat.typing') {
      showTyping();
    }
  }
}

// ==================== 聊天功能 ====================

function sendMessage() {
  const input = document.getElementById('messageInput');
  const content = input.value.trim();
  
  if (!content) return;
  
  if (!isConnected) {
    addSystemMessage('⚠️ 未连接到服务器');
    return;
  }
  
  addUserMessage(content);
  input.value = '';
  sendRequest('chat.send', { content });
  showTyping();
}

function addUserMessage(content) {
  const messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message user';
  div.innerHTML = `<div class="message-avatar">👤</div><div class="message-content">${escapeHtml(content)}</div>`;
  messages.appendChild(div);
  scrollToBottom();
}

function addAssistantMessage(content) {
  hideTyping();
  const messages = document.getElementById('messages');
  const agent = ALL_AGENTS[currentAgent] || { emoji: '⚡' };
  
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `<div class="message-avatar">${agent.emoji}</div><div class="message-content">${formatMessage(content)}</div>`;
  messages.appendChild(div);
  scrollToBottom();
}

function addSystemMessage(content) {
  const messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `<div class="message-avatar">ℹ️</div><div class="message-content" style="color:rgba(255,255,255,0.6);font-size:13px;">${content}</div>`;
  messages.appendChild(div);
  scrollToBottom();
}

function showTyping() {
  hideTyping();
  const messages = document.getElementById('messages');
  const agent = ALL_AGENTS[currentAgent] || { emoji: '⚡' };
  
  const div = document.createElement('div');
  div.className = 'message assistant typing-indicator';
  div.innerHTML = `<div class="message-avatar">${agent.emoji}</div><div class="typing"><span></span><span></span><span></span></div>`;
  messages.appendChild(div);
  scrollToBottom();
}

function hideTyping() {
  document.querySelector('.typing-indicator')?.remove();
}

// ==================== 工具函数 ====================

function updateStatus(status, text) {
  document.getElementById('statusDot').className = 'status-dot ' + status;
  document.getElementById('statusText').textContent = text;
}

function scrollToBottom() {
  const messages = document.getElementById('messages');
  messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMessage(content) {
  return escapeHtml(content)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:4px;">$1</code>');
}

function logout() {
  localStorage.removeItem('lingxi_token');
  window.location.href = '/';
}
