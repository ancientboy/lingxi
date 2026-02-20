/**
 * 灵犀云多 Agent 聊天 - 核心功能
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

let userAgents = ['main'];
let currentUserInfo = null;
let serverInfo = null;

// ==================== 状态 ====================

let ws = null;
let currentAgent = 'main';
let isConnected = false;
let messageId = 0;

// ==================== Agent 下拉 ====================

function renderAgentDropdown() {
  const dropdown = document.getElementById('agentDropdown');
  if (!dropdown) return;
  
  const agents = userAgents.map(id => ALL_AGENTS[id]).filter(Boolean);
  
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
  
  updateCurrentAgent();
}

function updateCurrentAgent() {
  const agent = ALL_AGENTS[currentAgent] || ALL_AGENTS.main;
  const emojiEl = document.getElementById('currentAgentEmoji');
  const nameEl = document.getElementById('currentAgentName');
  if (emojiEl) emojiEl.textContent = agent.emoji;
  if (nameEl) nameEl.textContent = agent.name;
}

function switchAgent(agentId) {
  if (agentId === currentAgent) {
    document.getElementById('agentDropdown')?.classList.remove('show');
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
  const dot = document.getElementById('statusDot');
  const textEl = document.getElementById('statusText');
  if (dot) dot.className = 'status-dot ' + status;
  if (textEl) textEl.textContent = text;
}

function scrollToBottom() {
  const messages = document.getElementById('messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
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
