/**
 * 灵犀云多 Agent 聊天
 * 支持 Web 端直接切换不同 Agent 对话
 * 移动端友好，支持侧边栏收缩
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

// 用户当前显示的 Agent 列表
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
  
  // 获取用户信息和服务器信息
  await initUserAndServer();
  
  // 渲染 Agent 列表
  renderAgentList();
  
  // 连接 WebSocket
  if (GATEWAY_URL) {
    connectWebSocket();
  }
});

// ==================== 侧边栏 ====================

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
}

// ==================== 用户和服务器初始化 ====================

async function initUserAndServer() {
  const token = localStorage.getItem('lingxi_token');
  
  console.log('初始化用户和服务器...');
  
  if (!token) {
    console.log('未登录，跳转到首页');
    window.location.href = '/';
    return;
  }
  
  try {
    // 获取用户信息（包含 agents 配置）
    const userRes = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!userRes.ok) {
      localStorage.removeItem('lingxi_token');
      window.location.href = '/';
      return;
    }
    
    const userData = await userRes.json();
    userInfo = userData.user;
    console.log('用户信息:', userInfo);
    
    // 获取用户的团队配置
    if (userInfo.agents && userInfo.agents.length > 0) {
      userAgents = userInfo.agents;
      console.log('用户团队配置:', userAgents);
    }
    
    // 获取服务器信息
    const serverRes = await fetch(`${API_BASE}/api/servers/${userInfo.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (serverRes.ok) {
      const serverData = await serverRes.json();
      serverInfo = serverData.server;
      console.log('服务器信息:', serverInfo);
      
      if (serverInfo && serverInfo.status === 'running') {
        GATEWAY_URL = `ws://${serverInfo.ip}:${serverInfo.openclawPort}`;
        GATEWAY_TOKEN = serverInfo.openclawToken;
        SESSION_ID = serverInfo.openclawSession;
        console.log('Gateway URL:', GATEWAY_URL);
      } else {
        addSystemMessage('⚠️ 你的 AI 团队服务器未启动，请先在首页"一键领取"');
      }
    }
    
  } catch (error) {
    console.error('获取用户/服务器信息失败:', error);
    addSystemMessage('⚠️ 网络错误: ' + error.message);
  }
}

// ==================== Agent 列表 ====================

function renderAgentList() {
  const list = document.getElementById('agentList');
  
  // 只显示用户配置的 Agent
  const agents = userAgents.map(id => ALL_AGENTS[id]).filter(Boolean);
  
  if (agents.length === 0) {
    list.innerHTML = '<div style="padding: 20px; text-align: center; color: rgba(255,255,255,0.5);">暂无团队成员</div>';
    return;
  }
  
  list.innerHTML = agents.map(agent => `
    <div class="agent-item ${agent.id === currentAgent ? 'active' : ''}" 
         onclick="switchAgent('${agent.id}')">
      <div class="agent-emoji">${agent.emoji}</div>
      <div class="agent-info">
        <h3>${agent.name}</h3>
        <p>${agent.desc}</p>
      </div>
    </div>
  `).join('');
  
  // 更新头部
  const currentAgentInfo = ALL_AGENTS[currentAgent];
  if (currentAgentInfo) {
    updateChatHeader(currentAgentInfo);
  }
}

function switchAgent(agentId) {
  if (agentId === currentAgent) return;
  
  currentAgent = agentId;
  const agent = ALL_AGENTS[agentId];
  
  // 更新 UI
  renderAgentList();
  updateChatHeader(agent);
  
  // 添加切换提示
  addSystemMessage(`已切换到 ${agent.emoji} ${agent.name}`);
  
  // 移动端自动收起侧边栏
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.add('collapsed');
  }
  
  // 发送切换通知到 Gateway
  if (isConnected) {
    sendRequest('agent.switch', { agentId });
  }
}

function updateChatHeader(agent) {
  const header = document.getElementById('chatHeader');
  header.innerHTML = `
    <span class="emoji">${agent.emoji}</span>
    <div>
      <h2>${agent.name}</h2>
      <p>${agent.desc}</p>
    </div>
  `;
}

// ==================== WebSocket ====================

function connectWebSocket() {
  if (!GATEWAY_URL) {
    updateStatus('disconnected', '请先领取 AI 团队');
    addSystemMessage('⚠️ 请先在首页点击"一键领取 AI 团队"');
    return;
  }
  
  updateStatus('connecting', '连接中...');
  
  const wsUrl = `${GATEWAY_URL}/${SESSION_ID}/ws?token=${GATEWAY_TOKEN}`;
  console.log('WebSocket URL:', wsUrl);
  
  try {
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('✅ WebSocket 连接成功');
      isConnected = true;
      updateStatus('connected', '已连接');
      
      sendHandshake();
      sendRequest('chat.history', { limit: 30 });
    };
    
    ws.onmessage = (event) => {
      handleWebSocketMessage(JSON.parse(event.data));
    };
    
    ws.onclose = (event) => {
      console.log('WebSocket 关闭:', event.code);
      isConnected = false;
      updateStatus('disconnected', '已断开');
      
      if (event.code !== 1000) {
        addSystemMessage('⚠️ 连接已断开，正在重连...');
      }
      
      setTimeout(() => {
        if (GATEWAY_URL) connectWebSocket();
      }, 5000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket 错误:', error);
      isConnected = false;
      updateStatus('disconnected', '连接失败');
      addSystemMessage('⚠️ 连接服务器失败');
    };
    
  } catch (error) {
    console.error('WebSocket 连接失败:', error);
    updateStatus('disconnected', '连接失败');
  }
}

function sendHandshake() {
  sendRequest('handshake', {
    minProtocol: 3,
    maxProtocol: 3,
    client: { id: 'openclaw-control-ui', version: '1.0.0', platform: 'web', mode: 'webchat' },
    role: 'operator',
    scopes: ['operator.admin', 'operator.read', 'operator.write'],
    auth: { token: GATEWAY_TOKEN },
    locale: 'zh-CN'
  });
}

function sendRequest(method, params = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('WebSocket 未连接');
    return;
  }
  
  const id = `req_${++messageId}`;
  ws.send(JSON.stringify({ id, method, params }));
  return id;
}

// ==================== 消息处理 ====================

function handleWebSocketMessage(data) {
  if (data.type === 'response') {
    handleResponse(data);
  } else if (data.type === 'event') {
    handleEvent(data);
  }
}

function handleResponse(data) {
  const { result, error } = data;
  
  if (error) {
    console.error('请求错误:', error);
    return;
  }
  
  if (result && result.messages) {
    document.getElementById('messages').innerHTML = '';
    result.messages.forEach(msg => {
      if (msg.role === 'user') addUserMessage(msg.content);
      else if (msg.role === 'assistant') addAssistantMessage(msg.content);
    });
  }
}

function handleEvent(data) {
  const { event, params } = data;
  
  if (event === 'chat.message' || event === 'chat.response') {
    hideTyping();
    if (params.content) addAssistantMessage(params.content);
  } else if (event === 'chat.typing' || event === 'chat.pending') {
    showTyping();
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
  div.innerHTML = `
    <div class="message-avatar">👤</div>
    <div class="message-content">${escapeHtml(content)}</div>
  `;
  messages.appendChild(div);
  scrollToBottom();
}

function addAssistantMessage(content) {
  hideTyping();
  const messages = document.getElementById('messages');
  const agent = ALL_AGENTS[currentAgent] || { emoji: '⚡' };
  
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="message-avatar">${agent.emoji}</div>
    <div class="message-content">${formatMessage(content)}</div>
  `;
  messages.appendChild(div);
  scrollToBottom();
}

function addSystemMessage(content) {
  const messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="message-avatar">ℹ️</div>
    <div class="message-content" style="color: rgba(255,255,255,0.6); font-size: 13px;">${content}</div>
  `;
  messages.appendChild(div);
  scrollToBottom();
}

function showTyping() {
  hideTyping();
  const messages = document.getElementById('messages');
  const agent = ALL_AGENTS[currentAgent] || { emoji: '⚡' };
  
  const div = document.createElement('div');
  div.className = 'message assistant typing-indicator';
  div.innerHTML = `
    <div class="message-avatar">${agent.emoji}</div>
    <div class="typing"><span></span><span></span><span></span></div>
  `;
  messages.appendChild(div);
  scrollToBottom();
}

function hideTyping() {
  document.querySelector('.typing-indicator')?.remove();
}

// ==================== 工具函数 ====================

function updateStatus(status, text) {
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot ' + status;
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
