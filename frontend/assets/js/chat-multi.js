/**
 * 灵犀云多 Agent 聊天
 * 支持 Web 端直接切换不同 Agent 对话
 */

// ==================== 配置 ====================

const API_BASE = window.location.origin;
let GATEWAY_URL = '';
let GATEWAY_TOKEN = '';
let SESSION_ID = '';

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
let userInfo = null;
let serverInfo = null;

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
  // 获取用户信息和服务器信息
  await initUserAndServer();
  
  // 渲染 Agent 列表
  renderAgentList();
  
  // 连接 WebSocket
  if (GATEWAY_URL) {
    connectWebSocket();
  } else {
    updateStatus('disconnected', '请先领取 AI 团队');
  }
});

// ==================== 用户和服务器初始化 ====================

async function initUserAndServer() {
  // 从 URL 参数获取
  const urlParams = new URLSearchParams(window.location.search);
  
  // 从 localStorage 获取 token
  const token = localStorage.getItem('lingxi_token');
  
  console.log('初始化用户和服务器...');
  
  if (!token) {
    console.log('未登录，跳转到首页');
    // 未登录，跳转到首页
    window.location.href = '/';
    return;
  }
  
  try {
    // 获取用户信息
    const userRes = await fetch(`${API_BASE}/api/auth/verify`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!userRes.ok) {
      console.log('Token 无效，跳转到首页');
      localStorage.removeItem('lingxi_token');
      window.location.href = '/';
      return;
    }
    
    const userData = await userRes.json();
    userInfo = userData.user;
    console.log('用户信息:', userInfo);
    
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
        console.log('服务器未运行:', serverInfo?.status);
        addSystemMessage('⚠️ 你的 AI 团队服务器未启动，请先在首页"一键领取"');
      }
    } else {
      console.log('获取服务器信息失败');
      addSystemMessage('⚠️ 获取服务器信息失败，请先"一键领取 AI 团队"');
    }
    
  } catch (error) {
    console.error('获取用户/服务器信息失败:', error);
    addSystemMessage('⚠️ 网络错误: ' + error.message);
  }
}

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
  if (!GATEWAY_URL) {
    updateStatus('disconnected', '请先领取 AI 团队');
    addSystemMessage('⚠️ 请先在首页点击"一键领取 AI 团队"');
    return;
  }
  
  updateStatus('connecting', `连接中 ${serverInfo?.ip || ''}...`);
  
  const wsUrl = `${GATEWAY_URL}/${SESSION_ID}/ws?token=${GATEWAY_TOKEN}`;
  console.log('WebSocket URL:', wsUrl);
  
  try {
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('✅ WebSocket 连接成功');
      isConnected = true;
      updateStatus('connected', `已连接 ${serverInfo?.ip || ''}`);
      
      // 发送握手
      sendHandshake();
      
      // 加载聊天历史
      sendRequest('chat.history', { limit: 50 });
    };
    
    ws.onmessage = (event) => {
      handleWebSocketMessage(JSON.parse(event.data));
    };
    
    ws.onclose = (event) => {
      console.log('WebSocket 关闭:', event.code, event.reason);
      isConnected = false;
      updateStatus('disconnected', '连接已断开');
      
      if (event.code === 1006) {
        addSystemMessage('⚠️ 连接被拒绝，请检查 Token 是否正确');
      }
      
      // 自动重连
      setTimeout(() => {
        if (GATEWAY_URL) {
          console.log('尝试重新连接...');
          connectWebSocket();
        }
      }, 5000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket 错误:', error);
      isConnected = false;
      updateStatus('disconnected', '连接失败');
      addSystemMessage('⚠️ 连接服务器失败，请检查服务器是否运行');
    };
    
  } catch (error) {
    console.error('WebSocket 连接失败:', error);
    isConnected = false;
    updateStatus('disconnected', '连接失败');
    addSystemMessage('⚠️ 连接失败: ' + error.message);
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
    const messages = document.getElementById('messages');
    // 清空现有消息
    messages.innerHTML = '';
    
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
  
  if (event === 'chat.message' || event === 'chat.response') {
    hideTyping();
    if (params.role === 'assistant' || params.content) {
      addAssistantMessage(params.content || params.text);
    }
  } else if (event === 'chat.typing' || event === 'chat.pending') {
    showTyping();
  }
}

// ==================== 聊天功能 ====================

function sendMessage() {
  const input = document.getElementById('messageInput');
  const content = input.value.trim();
  
  if (!content) {
    console.log('消息为空');
    return;
  }
  
  if (!isConnected) {
    console.error('WebSocket 未连接');
    addSystemMessage('⚠️ 未连接到服务器，请检查网络或稍后重试');
    return;
  }
  
  // 显示用户消息
  addUserMessage(content);
  input.value = '';
  
  // 发送到 Gateway
  console.log('发送消息:', content);
  sendRequest('chat.send', {
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

// ==================== 退出登录 ====================

function logout() {
  localStorage.removeItem('lingxi_token');
  window.location.href = '/';
}
