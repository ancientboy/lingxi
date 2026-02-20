/**
 * 灵犀云多 Agent 聊天
 * 支持 Web 端直接切换不同 Agent 对话
 */

// ==================== 配置 ====================

// 从 URL 获取配置
const urlParams = new URLSearchParams(window.location.search);
const GATEWAY_URL = urlParams.get('server') || 'ws://localhost:18789';
const GATEWAY_TOKEN = urlParams.get('token') || '';
const SESSION_ID = urlParams.get('session') || 'default';

// Agent 配置
const AGENTS = [
  { id: 'main', name: '灵犀', emoji: '⚡', desc: '团队队长，智能调度' },
  { id: 'coder', name: '云溪', emoji: '💻', desc: '代码专家，架构设计' },
  { id: 'ops', name: '若曦', emoji: '📊', desc: '运营专家，数据分析' },
  { id: 'inventor', name: '紫萱', emoji: '💡', desc: '创意天才，产品设计' },
  { id: 'pm', name: '梓萱', emoji: '🎯', desc: '产品专家，需求分析' },
  { id: 'noter', name: '晓琳', emoji: '📝', desc: '知识管理，笔记整理' },
  { id: 'media', name: '音韵', emoji: '🎧', desc: '多媒体，内容创作' },
  { id: 'smart', name: '智家', emoji: '🏠', desc: '智能家居，设备控制' }
];

// ==================== 状态 ====================

let ws = null;
let currentAgent = 'main';
let isConnected = false;
let messageId = 0;

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', () => {
  renderAgentList();
  connectWebSocket();
});

// ==================== Agent 列表 ====================

function renderAgentList() {
  const list = document.getElementById('agentList');
  list.innerHTML = AGENTS.map(agent => `
    <div class="agent-item ${agent.id === currentAgent ? 'active' : ''}" 
         onclick="switchAgent('${agent.id}')">
      <div class="agent-emoji">${agent.emoji}</div>
      <div class="agent-info">
        <h3>${agent.name}</h3>
        <p>${agent.desc}</p>
      </div>
    </div>
  `).join('');
}

function switchAgent(agentId) {
  if (agentId === currentAgent) return;
  
  currentAgent = agentId;
  const agent = AGENTS.find(a => a.id === agentId);
  
  // 更新 UI
  renderAgentList();
  updateChatHeader(agent);
  
  // 清空消息（可选：保留历史）
  // document.getElementById('messages').innerHTML = '';
  
  // 添加切换提示
  addSystemMessage(`已切换到 ${agent.emoji} ${agent.name}`);
  
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
  updateStatus('connecting', '连接中...');
  
  const wsUrl = `${GATEWAY_URL}/${SESSION_ID}/ws?token=${GATEWAY_TOKEN}`;
  
  try {
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket 连接成功');
      isConnected = true;
      updateStatus('connected', '已连接');
      
      // 发送握手
      sendHandshake();
    };
    
    ws.onmessage = (event) => {
      handleWebSocketMessage(JSON.parse(event.data));
    };
    
    ws.onclose = (event) => {
      console.log('WebSocket 关闭:', event.code, event.reason);
      isConnected = false;
      updateStatus('disconnected', '连接已断开');
      
      // 自动重连
      setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket 错误:', error);
      updateStatus('disconnected', '连接失败');
    };
    
  } catch (error) {
    console.error('WebSocket 连接失败:', error);
    updateStatus('disconnected', '连接失败');
  }
}

function sendHandshake() {
  const params = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'openclaw-control-ui',
      version: '1.0.0',
      platform: 'web',
      mode: 'webchat'
    },
    role: 'operator',
    scopes: ['operator.admin', 'operator.read', 'operator.write'],
    auth: { token: GATEWAY_TOKEN },
    locale: 'zh-CN',
    userAgent: navigator.userAgent
  };
  
  sendRequest('handshake', params);
}

function sendRequest(method, params = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('WebSocket 未连接');
    return;
  }
  
  const id = `req_${++messageId}`;
  const message = { id, method, params };
  
  ws.send(JSON.stringify(message));
  return id;
}

// ==================== 消息处理 ====================

function handleWebSocketMessage(data) {
  console.log('收到消息:', data);
  
  if (data.type === 'response') {
    handleResponse(data);
  } else if (data.type === 'event') {
    handleEvent(data);
  }
}

function handleResponse(data) {
  const { id, result, error } = data;
  
  if (error) {
    console.error('请求错误:', error);
    addSystemMessage(`错误: ${error.message || error}`);
    return;
  }
  
  // 处理聊天历史
  if (result && result.messages) {
    result.messages.forEach(msg => {
      if (msg.role === 'user') {
        addUserMessage(msg.content);
      } else if (msg.role === 'assistant') {
        addAssistantMessage(msg.content);
      }
    });
  }
}

function handleEvent(data) {
  const { event, params } = data;
  
  if (event === 'chat.message') {
    if (params.role === 'assistant') {
      addAssistantMessage(params.content);
    }
  } else if (event === 'chat.typing') {
    showTyping();
  }
}

// ==================== 聊天功能 ====================

function sendMessage() {
  const input = document.getElementById('messageInput');
  const content = input.value.trim();
  
  if (!content || !isConnected) return;
  
  // 显示用户消息
  addUserMessage(content);
  input.value = '';
  
  // 发送到 Gateway
  sendRequest('chat.send', {
    agentId: currentAgent,
    content: content
  });
  
  // 显示输入中状态
  showTyping();
}

function handleKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function addUserMessage(content) {
  const messages = document.getElementById('messages');
  const agent = AGENTS.find(a => a.id === 'main');
  
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
  const agent = AGENTS.find(a => a.id === currentAgent);
  
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
    <div class="message-content" style="color: rgba(255,255,255,0.7); font-size: 13px;">${content}</div>
  `;
  
  messages.appendChild(div);
  scrollToBottom();
}

function showTyping() {
  const messages = document.getElementById('messages');
  
  // 移除旧的 typing
  hideTyping();
  
  const agent = AGENTS.find(a => a.id === currentAgent);
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
  const typing = document.querySelector('.typing-indicator');
  if (typing) typing.remove();
}

// ==================== 工具函数 ====================

function updateStatus(status, text) {
  const dot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  
  dot.className = 'status-dot';
  if (status === 'connecting') dot.classList.add('connecting');
  if (status === 'disconnected') dot.classList.add('disconnected');
  
  statusText.textContent = text;
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
  // 简单的 Markdown 处理
  return escapeHtml(content)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">$1</code>');
}

// ==================== Agent 间通信 ====================

// 方式1：派发任务 (sessions_spawn)
function spawnTask(agentId, task) {
  return sendRequest('tool.call', {
    tool: 'sessions_spawn',
    args: {
      agentId: agentId,
      task: task,
      timeoutSeconds: 300
    }
  });
}

// 方式2：发送消息 (sessions_send)
function sendMessageToSession(sessionId, text) {
  return sendRequest('tool.call', {
    tool: 'sessions_send',
    args: {
      sessionId: sessionId,
      text: text
    }
  });
}

// 获取会话列表
function listSessions(agentId) {
  return sendRequest('tool.call', {
    tool: 'sessions_list',
    args: { agentId: agentId }
  });
}
