// 配置变量（从后端动态获取）
const API_BASE = window.location.origin;
let GATEWAY_WS = null;
let GATEWAY_TOKEN = null;
let GATEWAY_SESSION = null;
let SESSION_PREFIX = null;

let SESSION_KEY = null;  // 用户主会话（根据用户ID生成）
let currentSessionKey = null;  // 当前活动会话

const AGENT_INFO = {
  lingxi: { 
    emoji: '⚡', 
    name: '灵犀', 
    desc: '智能调度 · 日程管理',
    scene: '日程管理',
    skills: '任务规划、提醒、邮件'
  },
  coder: { 
    emoji: '💻', 
    name: '云溪', 
    desc: '全栈开发 · 编程专家',
    scene: '编程开发',
    skills: '代码、调试、架构、API'
  },
  ops: { 
    emoji: '📊', 
    name: '若曦', 
    desc: '增长运营 · 数据专家',
    scene: '数据分析',
    skills: '报表、增长、SEO、用户研究'
  },
  inventor: { 
    emoji: '💡', 
    name: '紫萱', 
    desc: '内容创意 · 文案总监',
    scene: '内容创作',
    skills: '文案、创意、社媒、营销'
  },
  pm: { 
    emoji: '🎯', 
    name: '梓萱', 
    desc: '产品设计 · 需求专家',
    scene: '产品设计',
    skills: '需求、原型、UX、商业模式'
  },
  noter: { 
    emoji: '📝', 
    name: '晓琳', 
    desc: '学习顾问 · 知识管理',
    scene: '知识管理',
    skills: '学习、翻译、笔记、搜索'
  },
  media: { 
    emoji: '🎨', 
    name: '音韵', 
    desc: '多媒体创作 · AI绘图',
    scene: '多媒体娱乐',
    skills: 'AI绘图、视频、音乐、剧本'
  },
  smart: { 
    emoji: '🏠', 
    name: '智家', 
    desc: '效率工具 · 自动化专家',
    scene: '智能工具',
    skills: '自动化、脚本、工具、效率'
  }
};

let user = null;
let ws = null;
let pendingMessage = null;
let currentRunId = null;
let isGenerating = false;

// 初始化
async function init() {
  console.log('🚀 初始化聊天页面...');
  
  const token = localStorage.getItem('lingxi_token');
  if (!token) {
    console.log('❌ 没有 token，跳转到首页');
    window.location.href = 'index.html';
    return;
  }
  
  user = JSON.parse(localStorage.getItem('lingxi_user') || '{}');
  console.log('👤 用户信息:', user);
  
  // 初始化用户专属会话
  if (!user.id) {
    console.error('❌ 用户 ID 不存在');
    alert('用户信息错误，请重新登录');
    window.location.href = 'index.html';
    return;
  }
  
  // 🔒 安全：从后端获取 Gateway 连接信息（不硬编码 token）
  try {
    console.log('📡 获取 Gateway 连接信息...');
    const res = await fetch(`${API_BASE}/api/gateway/connect-info`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      console.error('❌ 获取连接信息失败');
      alert('登录已过期，请重新登录');
      localStorage.removeItem('lingxi_token');
      window.location.href = 'index.html';
      return;
    }
    
    const gatewayInfo = await res.json();
    GATEWAY_WS = gatewayInfo.wsUrl;
    GATEWAY_TOKEN = gatewayInfo.token;
    GATEWAY_SESSION = gatewayInfo.session;
    SESSION_PREFIX = gatewayInfo.sessionPrefix;
    
    console.log('✅ Gateway 配置已获取');
    
  } catch (e) {
    console.error('❌ 获取 Gateway 配置失败:', e);
    alert('网络错误，请刷新页面');
    return;
  }
  
  // 使用用户ID生成主会话key
  SESSION_KEY = `${SESSION_PREFIX}:main`;
  currentSessionKey = SESSION_KEY;
  console.log('🔑 会话 Key:', currentSessionKey);
  
  renderTeamTags();
  connectWebSocket();
  
  document.getElementById('inputField').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  document.getElementById('inputField').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
  });
}

let requestId = 1;
let connectNonce = null;

// WebSocket 连接
function connectWebSocket() {
  const statusEl = document.getElementById('connectionStatus');
  statusEl.textContent = '连接中...';
  statusEl.className = 'status';
  
  try {
    ws = new WebSocket(`${GATEWAY_WS}/${GATEWAY_SESSION}/ws`);
    
    ws.onopen = () => {
      console.log('WebSocket 已连接，等待 750ms 后发送 connect...');
      statusEl.textContent = '认证中...';
      
      // OpenClaw 要求等待 750ms 后再发送 connect
      setTimeout(() => {
        sendConnect();
      }, 750);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (e) {
        console.error('解析消息失败:', e);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket 错误:', error);
      statusEl.textContent = '连接错误';
      statusEl.className = 'status error';
    };
    
    ws.onclose = () => {
      console.log('WebSocket 已断开');
      statusEl.textContent = '已断开，5秒后重连...';
      statusEl.className = 'status error';
      setTimeout(connectWebSocket, 5000);
    };
  } catch (e) {
    console.error('WebSocket 连接失败:', e);
    statusEl.textContent = '连接失败';
    statusEl.className = 'status error';
  }
}

// 发送 connect 请求
function sendConnect() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  
  const params = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'webchat',  // 必须是预定义值: webchat, cli, openclaw-control-ui 等
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
  
  // 禁用设备认证后不需要发送 device
  ws.send(JSON.stringify({
    type: 'req',
    id: `req_${requestId++}`,
    method: 'connect',
    params
  }));
}

// 处理 WebSocket 消息
function handleWebSocketMessage(data) {
  console.log('收到消息:', data);
  
  const statusEl = document.getElementById('connectionStatus');
  
  // 连接挑战 - 设备认证已禁用时不应该收到
  if (data.type === 'event' && data.event === 'connect.challenge') {
    console.log('收到挑战，但设备认证已禁用，这不应该发生');
    statusEl.textContent = '认证失败（需要重启Gateway）';
    statusEl.className = 'status error';
    return;
  }
  
  // 连接响应
  if (data.type === 'res' && data.ok && data.payload?.type === 'hello-ok') {
    statusEl.textContent = '已连接';
    statusEl.className = 'status connected';
    console.log('✅ 认证成功');
    // 加载会话列表和历史
    loadSessions();
    loadChatHistory();
    return;
  }
  
  // chat.send 响应 (开始运行)
  if (data.type === 'res' && data.payload?.status === 'started') {
    console.log('消息发送中，runId:', data.payload.runId);
    currentRunId = data.payload.runId;
    isGenerating = true;
    updateSendButton();
    return;
  }
  
  // 错误响应
  if (data.type === 'res' && !data.ok) {
    const errorMsg = data.error?.message || JSON.stringify(data.error) || '未知错误';
    console.error('❌ 请求失败:', errorMsg, data);
    
    // 如果是认证错误，特殊处理
    if (errorMsg.includes('auth') || errorMsg.includes('token') || errorMsg.includes('认证')) {
      statusEl.textContent = '认证失败';
      statusEl.className = 'status error';
    }
    
    removeTyping();
    isGenerating = false;
    currentRunId = null;
    updateSendButton();
    addMessage('assistant', '❌ ' + errorMsg, '系统');
    return;
  }
  
  // 聊天响应事件
  if (data.type === 'event' && data.event === 'chat') {
    const payload = data.payload || {};
    
    // 检查是否是当前会话
    if (payload.sessionKey && payload.sessionKey !== currentSessionKey) {
      console.log('⚠️ 跳过非当前会话消息:', payload.sessionKey);
      return;
    }
    
    const runId = payload.runId;
    
    // delta - 流式输出
    if (payload.state === 'delta') {
      const text = extractText(payload.message);
      if (text) {
        // 创建或更新流式消息
        updateStreamingMessage(text, runId);
      }
    }
    // final - 完成
    else if (payload.state === 'final') {
      const text = extractText(payload.message);
      removeTyping();
      
      // 如果 delta 阶段没有显示过内容，final 才显示
      if (text && !hasStreamingMessage(runId)) {
        addMessage('assistant', text, '灵犀');
      } else if (hasStreamingMessage(runId)) {
        // delta 已经显示过了，确保消息完整
        finalizeStreamingMessage(text, runId);
      }
      
      isGenerating = false;
      currentRunId = null;
      updateSendButton();
      console.log('✅ 消息完成');
    }
    // error
    else if (payload.state === 'error') {
      removeTyping();
      isGenerating = false;
      currentRunId = null;
      updateSendButton();
      addMessage('assistant', '❌ 错误: ' + (payload.errorMessage || '未知错误'), '灵犀');
    }
    // aborted
    else if (payload.state === 'aborted') {
      removeTyping();
      isGenerating = false;
      currentRunId = null;
      updateSendButton();
      console.log('⚠️ 消息已中止');
    }
  }
}

// 从消息对象中提取文本
function extractText(message) {
  if (!message) return null;
  if (typeof message === 'string') return message;
  if (message.text) return message.text;
  if (message.content) {
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');
    }
  }
  return null;
}

// 流式消息管理
let streamingMessages = {};  // runId -> {element, text}

// 更新或创建流式消息
function updateStreamingMessage(text, runId) {
  removeTyping();
  
  if (!streamingMessages[runId]) {
    // 创建新的流式消息
    const div = addMessage('assistant', text, '灵犀');
    streamingMessages[runId] = { element: div, text: text };
  } else {
    // 更新现有消息
    streamingMessages[runId].text = text;
    const bubble = streamingMessages[runId].element.querySelector('.bubble');
    if (bubble) {
      bubble.innerHTML = escapeHtml(text);
    }
  }
  
  // 滚动到底部
  const messages = document.getElementById('messages');
  messages.scrollTop = messages.scrollHeight;
}

// 检查是否有流式消息
function hasStreamingMessage(runId) {
  return !!streamingMessages[runId];
}

// 完成流式消息
function finalizeStreamingMessage(text, runId) {
  if (streamingMessages[runId] && text) {
    streamingMessages[runId].text = text;
    const bubble = streamingMessages[runId].element.querySelector('.bubble');
    if (bubble) {
      bubble.innerHTML = escapeHtml(text);
    }
  }
  // 清理
  delete streamingMessages[runId];
}

// 渲染团队标签
function renderTeamTags() {
  const agents = user?.agents || ['lingxi'];
  const tags = document.getElementById('teamTags');
  if (!tags) return;  // 元素不存在时跳过
  tags.innerHTML = agents.map(id => {
    const agent = AGENT_INFO[id] || { emoji: '🤖', name: id };
    return `<span class="team-tag">${agent.emoji} ${agent.name}</span>`;
  }).join('');
}

// 发送消息
function sendMessage() {
  console.log('🔔 sendMessage 被调用, currentSessionKey:', currentSessionKey);
  
  if (!currentSessionKey) {
    console.error('❌ currentSessionKey 为空');
    alert('会话未初始化，请刷新页面');
    return;
  }
  
  const input = document.getElementById('inputField');
  const text = input.value.trim();
  console.log('📝 输入文本:', text ? `"${text}"` : '(空)');
  
  if (!text) {
    console.log('⚠️ 文本为空，跳过发送');
    return;
  }
  
  // 隐藏欢迎界面（如果存在）
  const welcome = document.getElementById('welcome');
  if (welcome) {
    welcome.classList.add('hidden');
  }
  
  addMessage('user', text, user?.nickname || '我');
  input.value = '';
  input.style.height = 'auto';
  
  // 通过 WebSocket 发送
  console.log('🔌 WebSocket 状态:', ws ? ws.readyState : 'null', '(OPEN=1)');
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('✅ 通过 WebSocket 发送消息');
    addTyping();
    ws.send(JSON.stringify({
      type: 'req',
      id: `req_${requestId++}`,
      method: 'chat.send',
      params: {
        sessionKey: currentSessionKey,
        message: text,
        idempotencyKey: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        deliver: false
      }
    }));
  } else {
    // WebSocket 未连接，使用 HTTP 代理
    console.log('📡 WebSocket 未连接，使用 HTTP 代理');
    sendViaHTTP(text);
  }
}

// 处理发送/停止按钮点击
function handleSendClick() {
  console.log('🖱️ 发送按钮被点击, isGenerating:', isGenerating);
  if (isGenerating) {
    abortChat();
  } else {
    sendMessage();
  }
}

// 更新发送按钮状态
function updateSendButton() {
  const btn = document.getElementById('sendBtn');
  if (isGenerating) {
    btn.textContent = '■';
    btn.classList.add('stopping');
    btn.title = '停止生成';
  } else {
    btn.textContent = '➤';
    btn.classList.remove('stopping');
    btn.title = '发送';
  }
}

// 中止对话
function abortChat() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log('WebSocket 未连接');
    return;
  }
  
  if (!currentSessionKey) {
    console.log('currentSessionKey 未设置');
    return;
  }
  
  ws.send(JSON.stringify({
    type: 'req',
    id: `req_${requestId++}`,
    method: 'chat.abort',
    params: {
      sessionKey: currentSessionKey,
      runId: currentRunId
    }
  }));
  
  isGenerating = false;
  currentRunId = null;
  updateSendButton();
  removeTyping();
  console.log('✅ 已发送中止请求');
}

// 加载聊天历史
async function loadChatHistory() {
  console.log('📚 loadChatHistory 开始, currentSessionKey:', currentSessionKey);
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log('⚠️ WebSocket 未连接，无法加载历史');
    renderHistory([]);
    return;
  }
  
  if (!currentSessionKey) {
    console.log('⚠️ currentSessionKey 未设置，跳过加载历史');
    renderHistory([]);
    return;
  }
  
  console.log('📚 发送 chat.history 请求, sessionKey:', currentSessionKey);
  
  try {
    const res = await new Promise((resolve, reject) => {
      const id = `req_${requestId++}`;
      const timeout = setTimeout(() => {
        console.log('⏱️ chat.history 超时');
        reject(new Error('timeout'));
      }, 10000);
      
      const handler = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📚 收到 WebSocket 消息, id:', data.id, '期待:', id);
          if (data.id === id) {
            clearTimeout(timeout);
            ws.removeEventListener('message', handler);
            resolve(data);
          }
        } catch (e) {
          console.error('📚 解析消息失败:', e);
        }
      };
      
      ws.addEventListener('message', handler);
      
      const req = {
        type: 'req',
        id,
        method: 'chat.history',
        params: {
          sessionKey: currentSessionKey,
          limit: 100
        }
      };
      console.log('📚 发送请求:', JSON.stringify(req));
      ws.send(JSON.stringify(req));
    });
    
    console.log('📚 chat.history 完整响应:', JSON.stringify(res, null, 2));
    
    if (res.ok && res.payload?.messages) {
      console.log('✅ 加载了', res.payload.messages.length, '条历史消息');
      renderHistory(res.payload.messages);
    } else if (res.ok && res.payload?.transcript) {
      // 尝试 transcript 字段
      console.log('✅ 使用 transcript 字段, 长度:', res.payload.transcript.length);
      renderHistory(res.payload.transcript);
    } else {
      console.log('⚠️ 无历史消息, res.ok:', res.ok, 'payload:', res.payload);
      renderHistory([]);
    }
  } catch (e) {
    console.error('❌ 加载历史失败:', e);
    renderHistory([]);
  }
}

// 渲染历史消息
function renderHistory(messages) {
  const container = document.getElementById('messages');
  
  // 如果没有消息，显示欢迎界面
  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div class="welcome" id="welcome">
        <div class="welcome-emoji">⚡</div>
        <div class="welcome-title">继续对话</div>
        <div class="welcome-desc">发送消息继续这个会话</div>
      </div>
    `;
    return;
  }
  
  // 清空容器
  container.innerHTML = '';
  
  // 渲染历史消息
  for (const msg of messages) {
    const role = msg.role || 'user';
    const content = extractText(msg);
    if (!content) continue;
    
    const name = role === 'user' ? (user?.nickname || '我') : '灵犀';
    addMessage(role, content, name);
  }
  
  console.log('✅ 渲染了', messages.length, '条历史消息');
  
  // 自动滚动到底部
  setTimeout(() => {
    container.scrollTop = container.scrollHeight;
    console.log('📜 已滚动到最新消息');
  }, 100);
}

// ===== 会话管理 =====

let sessions = [];

// 加载会话列表
async function loadSessions() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log('⚠️ WebSocket 未连接，无法加载会话列表');
    return;
  }
  
  console.log('📋 加载会话列表...');
  
  try {
    const res = await new Promise((resolve, reject) => {
      const id = `req_${requestId++}`;
      const timeout = setTimeout(() => reject(new Error('timeout')), 10000);
      
      const handler = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.id === id) {
            clearTimeout(timeout);
            ws.removeEventListener('message', handler);
            resolve(data);
          }
        } catch (e) {}
      };
      
      ws.addEventListener('message', handler);
      
      ws.send(JSON.stringify({
        type: 'req',
        id,
        method: 'sessions.list',
        params: {}
      }));
    });
    
    console.log('📋 sessions.list 响应:', res);
    
    if (res.ok && res.payload?.sessions) {
      sessions = res.payload.sessions;
      console.log('✅ 加载了', sessions.length, '个会话:', sessions.map(s => s.key));
      renderSessionList();
    } else {
      console.log('⚠️ 无会话数据');
      sessions = [];
      renderSessionList();
    }
  } catch (e) {
    console.error('❌ 加载会话列表失败:', e);
    sessions = [];
    renderSessionList();
  }
}

// 渲染会话列表
function renderSessionList() {
  const container = document.getElementById('sessionList');
  
  console.log('📋 渲染会话列表, 总会话数:', sessions.length);
  console.log('📋 当前会话:', currentSessionKey);
  
  // 添加"新会话"按钮
  let html = `
    <div class="session-item" onclick="createNewSession()">
      <div class="session-avatar">➕</div>
      <div class="session-info">
        <div class="session-name">新会话</div>
        <div class="session-preview">开始新的对话</div>
      </div>
    </div>
  `;
  
  // 显示所有会话（不过滤，因为用户可能使用不同的 key 前缀）
  for (const session of sessions) {
    const isActive = session.key === currentSessionKey;
    // 解析显示名称：main -> 灵犀（主会话），其他取最后一段
    let displayName = session.label || session.displayName || session.key;
    if (session.key === 'main') {
      displayName = '灵犀（主会话）';
    } else if (session.key.includes(':')) {
      displayName = session.key.split(':').pop();
    }
    
    const preview = session.lastMessage || session.preview || '暂无消息';
    const time = session.updatedAt ? new Date(session.updatedAt).toLocaleString('zh-CN', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : '';
    
    console.log('📋 会话:', session.key, 'displayName:', displayName, 'isActive:', isActive);
    
    html += `
      <div class="session-item ${isActive ? 'active' : ''}" onclick="switchSession('${session.key}')">
        <div class="session-avatar">${isActive ? '⚡' : '💬'}</div>
        <div class="session-info">
          <div class="session-name">${escapeHtml(displayName)}</div>
          <div class="session-preview">${time ? time + ' · ' : ''}${escapeHtml(preview.substring(0, 30))}${preview.length > 30 ? '...' : ''}</div>
        </div>
        <button class="session-delete" onclick="event.stopPropagation(); deleteSession('${session.key}')">×</button>
      </div>
    `;
  }
  
  // 如果没有会话，显示提示
  if (sessions.length === 0) {
    html += `
      <div style="text-align:center;padding:20px;color:rgba(255,255,255,0.5);font-size:13px;">
        暂无历史会话<br>点击"新会话"开始
      </div>
    `;
  }
  
  container.innerHTML = html;
}

// 创建新会话
async function createNewSession() {
  closeSessionModal();
  
  // 生成新的会话 key（使用从后端获取的 session prefix）
  const newSessionKey = `${SESSION_PREFIX}:chat_${Date.now()}`;
  currentSessionKey = newSessionKey;
  console.log('🆕 创建新会话:', currentSessionKey);
  
  // 清空聊天，显示欢迎界面
  const container = document.getElementById('messages');
  container.innerHTML = `
    <div class="welcome" id="welcome">
      <div class="welcome-emoji">⚡</div>
      <div class="welcome-title">新对话</div>
      <div class="welcome-desc">发送消息开始对话</div>
    </div>
  `;
  
  // 会话会在第一次发送消息时自动创建
  console.log('✅ 新会话已准备就绪，等待发送第一条消息');
}

// 切换会话
async function switchSession(sessionKey) {
  if (sessionKey === currentSessionKey) {
    closeSessionModal();
    return;
  }
  
  closeSessionModal();
  currentSessionKey = sessionKey;
  console.log('🔄 切换到会话:', sessionKey);
  
  // 清空当前消息，重建欢迎界面
  const container = document.getElementById('messages');
  container.innerHTML = `
    <div class="welcome" id="welcome">
      <div class="welcome-emoji">⚡</div>
      <div class="welcome-title">加载中...</div>
      <div class="welcome-desc">正在获取聊天历史</div>
    </div>
  `;
  
  // 加载该会话的历史
  try {
    await loadChatHistory();
  } catch (e) {
    console.error('加载历史失败:', e);
  }
  
  // 重新渲染会话列表以更新选中状态
  renderSessionList();
  
  console.log('✅ 会话切换完成, currentSessionKey:', currentSessionKey);
}

// 删除会话
async function deleteSession(sessionKey) {
  if (!confirm('确定删除这个会话吗？')) return;
  if (sessionKey === currentSessionKey) {
    alert('无法删除当前会话');
    return;
  }
  
  // TODO: 调用 API 删除会话
  sessions = sessions.filter(s => s.key !== sessionKey);
  renderSessionList();
  console.log('✅ 删除会话:', sessionKey);
}

// HTTP 代理备用方案
async function sendViaHTTP(text) {
  const loadingId = addTyping();
  try {
    const res = await fetch(`${API_BASE}/api/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        userId: user?.id || 'web-user'
      })
    });
    
    removeTyping();
    
    if (res.ok) {
      const data = await res.json();
      addMessage('assistant', data.response || '收到~', '灵犀');
    } else {
      addMessage('assistant', '网络出了点问题，稍后再试~', '灵犀');
    }
  } catch (e) {
    removeTyping();
    addMessage('assistant', '连接失败，请检查网络~', '灵犀');
  }
}

// 快捷发送
function quickSend(text) {
  document.getElementById('inputField').value = text;
  sendMessage();
}

// 添加消息
function addMessage(role, content, name) {
  const messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = `message ${role}`;
  
  const emoji = role === 'user' ? '👤' : '⚡';
  
  div.innerHTML = `
    <div class="avatar">${emoji}</div>
    <div class="bubble">${escapeHtml(content)}</div>
  `;
  
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  
  return div;
}

// 添加打字动画
function addTyping() {
  const messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.id = 'typing-indicator';
  div.innerHTML = `
    <div class="avatar">⚡</div>
    <div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>
  `;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div.id;
}

// 移除打字动画
function removeTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

// 清空聊天
function clearChat() {
  const messages = document.getElementById('messages');
  messages.innerHTML = '';
  document.getElementById('welcome').classList.remove('hidden');
}

// 切换下拉菜单
function toggleDropdown() {
  const dropdown = document.getElementById('userDropdown');
  dropdown.classList.toggle('show');
}

// 点击其他地方关闭下拉菜单
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    document.getElementById('userDropdown')?.classList.remove('show');
  }
});

// 显示设置
function showSettings() {
  alert('设置功能开发中...');
}

// 显示关于
function showAbout() {
  alert('灵犀云 v1.0\n\n你的 AI 团队，一键拥有');
}

// 退出登录
function logout() {
  if (confirm('确定要退出登录吗？')) {
    localStorage.removeItem('lingxi_token');
    localStorage.removeItem('lingxi_user');
    window.location.href = 'index.html';
  }
}

// ===== 团队管理 =====

// 显示我的团队
function showMyTeam() {
  document.getElementById('userDropdown').classList.remove('show');
  renderMyTeam();
  renderAvailableAgents();
  document.getElementById('teamModal').classList.add('show');
}

// 关闭团队弹窗
function closeTeamModal() {
  document.getElementById('teamModal').classList.remove('show');
}

// 渲染我的团队
function renderMyTeam() {
  const myAgents = user?.agents || ['lingxi'];
  const container = document.getElementById('myTeamList');
  if (!container) return;  // 元素不存在时跳过
  
  if (myAgents.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5);">还没有添加团队成员</p>';
    return;
  }
  
  container.innerHTML = myAgents.map(agentId => {
    const agent = AGENT_INFO[agentId] || { emoji: '🤖', name: agentId, desc: 'AI 助手', scene: '通用', skills: '' };
    const isRequired = agentId === 'lingxi';
    return `
      <div class="team-member" style="flex-direction:column;align-items:flex-start;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
          <div class="team-member-info">
            <div class="team-member-avatar">${agent.emoji}</div>
            <div>
              <div class="team-member-name">${agent.name}</div>
              <div class="team-member-role">${agent.desc}</div>
            </div>
          </div>
          ${isRequired ? 
            '<span style="color:#4ade80;font-size:12px;background:rgba(74,222,128,0.1);padding:4px 8px;border-radius:4px;">队长</span>' : 
            `<button class="remove-btn" onclick="removeAgent('${agentId}')">移除</button>`
          }
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-left:52px;">
          <span style="font-size:11px;color:rgba(255,255,255,0.5);background:rgba(255,255,255,0.05);padding:3px 8px;border-radius:4px;">
            🎯 ${agent.scene || '通用'}
          </span>
          <span style="font-size:11px;color:rgba(255,255,255,0.4);background:rgba(255,255,255,0.05);padding:3px 8px;border-radius:4px;">
            🔧 ${agent.skills || '多技能'}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

// 渲染可添加的成员
function renderAvailableAgents() {
  const myAgents = user?.agents || ['lingxi'];
  const container = document.getElementById('availableAgents');
  if (!container) return;  // 元素不存在时跳过
  
  const available = Object.keys(AGENT_INFO).filter(id => !myAgents.includes(id));
  
  if (available.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:13px;">已添加全部成员</p>';
    return;
  }
  
  container.innerHTML = available.map(agentId => {
    const agent = AGENT_INFO[agentId];
    return `
      <div class="agent-chip" onclick="addAgent('${agentId}')" title="${agent.scene} · ${agent.skills}">
        <span>${agent.emoji}</span>
        <span>${agent.name}</span>
        <span style="font-size:10px;color:rgba(255,255,255,0.4);margin-left:4px;">${agent.scene}</span>
      </div>
    `;
  }).join('');
}

// 添加成员
async function addAgent(agentId) {
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
      console.log('✅ 成员添加成功:', agentId);
    } else {
      // 回滚
      user.agents = user.agents.filter(id => id !== agentId);
      alert('添加失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    // 回滚
    user.agents = user.agents.filter(id => id !== agentId);
    alert('网络错误：' + e.message);
  }
}

// 移除成员
async function removeAgent(agentId) {
  if (!user) return;
  if (agentId === 'lingxi') return; // 队长不能移除
  
  const myAgents = user.agents || ['lingxi'];
  const newAgents = myAgents.filter(id => id !== agentId);
  
  if (newAgents.length === 0) {
    alert('至少保留一个团队成员');
    return;
  }
  
  const oldAgents = [...user.agents];
  user.agents = newAgents;
  
  // 保存到服务器
  try {
    const res = await fetch(`${API_BASE}/api/agents/user/${user.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      },
      body: JSON.stringify({ agents: newAgents })
    });
    
    const data = await res.json();
    
    if (res.ok && data.success) {
      localStorage.setItem('lingxi_user', JSON.stringify(user));
      renderMyTeam();
      renderAvailableAgents();
      renderTeamTags();
      console.log('✅ 成员移除成功:', agentId);
    } else {
      // 回滚
      user.agents = oldAgents;
      alert('移除失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    // 回滚
    user.agents = oldAgents;
    alert('网络错误：' + e.message);
  }
}

// ===== 会话列表 =====

function showSessionList() {
  document.getElementById('sessionModal').classList.add('show');
}

function closeSessionModal() {
  document.getElementById('sessionModal').classList.remove('show');
}

// ===== 飞书配置 =====

function showFeishuConfig() {
  document.getElementById('userDropdown').classList.remove('show');
  
  if (!user || !user.id) {
    alert('请先登录');
    return;
  }
  
  loadFeishuStatus();
  document.getElementById('feishuModal').classList.add('show');
}

function closeFeishuModal() {
  document.getElementById('feishuModal').classList.remove('show');
}

async function loadFeishuStatus() {
  const statusEl = document.getElementById('feishuStatus');
  statusEl.innerHTML = '<span style="color:rgba(255,255,255,0.5)">加载中...</span>';
  
  try {
    const res = await fetch(`${API_BASE}/api/feishu/status/${user.id}`);
    const data = await res.json();
    
    if (data.configured) {
      statusEl.innerHTML = `<span style="color:#4ade80">✅ 已配置 (${data.botName})</span>`;
      document.getElementById('feishuWebhook').style.display = 'block';
      document.getElementById('feishuWebhookUrl').value = data.webhookUrl;
    } else {
      statusEl.innerHTML = '<span style="color:rgba(255,255,255,0.5)">未配置</span>';
      document.getElementById('feishuWebhook').style.display = 'none';
    }
  } catch (e) {
    statusEl.innerHTML = '<span style="color:#f87171">加载失败</span>';
  }
}

async function saveFeishuConfig(e) {
  e.preventDefault();
  
  const appId = document.getElementById('feishuAppId').value.trim();
  const appSecret = document.getElementById('feishuAppSecret').value.trim();
  
  if (!appId || !appSecret) {
    alert('请填写完整信息');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/api/feishu/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, appId, appSecret })
    });
    
    const data = await res.json();
    
    if (data.success) {
      alert('飞书配置成功！\n\n请在飞书开放平台配置事件订阅：\n' + data.config.webhookUrl);
      loadFeishuStatus();
    } else {
      alert('配置失败: ' + (data.error || data.detail || '未知错误'));
    }
  } catch (e) {
    alert('网络错误: ' + e.message);
  }
}

function copyFeishuWebhook() {
  const input = document.getElementById('feishuWebhookUrl');
  input.select();
  document.execCommand('copy');
  alert('已复制到剪贴板');
}

// ===== 企业微信配置 =====

function showWecomConfig() {
  document.getElementById('userDropdown').classList.remove('show');
  
  if (!user || !user.id) {
    alert('请先登录');
    return;
  }
  
  loadWecomStatus();
  document.getElementById('wecomModal').classList.add('show');
}

function closeWecomModal() {
  document.getElementById('wecomModal').classList.remove('show');
}

async function loadWecomStatus() {
  const statusEl = document.getElementById('wecomStatus');
  statusEl.innerHTML = '<span style="color:rgba(255,255,255,0.5)">加载中...</span>';
  
  try {
    const res = await fetch(`${API_BASE}/api/wecom/status/${user.id}`);
    const data = await res.json();
    
    if (data.configured) {
      statusEl.innerHTML = `<span style="color:#4ade80">✅ 已配置</span>`;
      document.getElementById('wecomWebhook').style.display = 'block';
      document.getElementById('wecomWebhookUrl').value = data.webhookUrl;
    } else {
      statusEl.innerHTML = '<span style="color:rgba(255,255,255,0.5)">未配置</span>';
      document.getElementById('wecomWebhook').style.display = 'none';
    }
  } catch (e) {
    statusEl.innerHTML = '<span style="color:#f87171">加载失败</span>';
  }
}

async function saveWecomConfig(e) {
  e.preventDefault();
  
  const corpId = document.getElementById('wecomCorpId').value.trim();
  const agentId = document.getElementById('wecomAgentId').value.trim();
  const agentSecret = document.getElementById('wecomAgentSecret').value.trim();
  
  if (!corpId || !agentId || !agentSecret) {
    alert('请填写完整信息');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/api/wecom/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, corpId, agentId, agentSecret })
    });
    
    const data = await res.json();
    
    if (data.success) {
      alert('企业微信配置成功！');
      loadWecomStatus();
    } else {
      alert('配置失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    alert('网络错误: ' + e.message);
  }
}

function copyWecomWebhook() {
  const input = document.getElementById('wecomWebhookUrl');
  input.select();
  document.execCommand('copy');
  alert('已复制到剪贴板');
}

// ===== 修改密码 =====

function showPasswordChange() {
  document.getElementById('userDropdown').classList.remove('show');
  document.getElementById('passwordForm').reset();
  document.getElementById('passwordModal').classList.add('show');
}

function closePasswordModal() {
  document.getElementById('passwordModal').classList.remove('show');
}

async function changePassword(e) {
  e.preventDefault();
  
  const currentPwd = document.getElementById('currentPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confirmPwd = document.getElementById('confirmPassword').value;
  
  if (newPwd !== confirmPwd) {
    alert('两次输入的新密码不一致');
    return;
  }
  
  if (newPwd.length < 6) {
    alert('新密码至少6位');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/api/auth/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      },
      body: JSON.stringify({ 
        currentPassword: currentPwd,
        password: newPwd 
      })
    });
    
    const data = await res.json();
    
    if (data.success) {
      alert('密码修改成功！');
      closePasswordModal();
    } else {
      alert('修改失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    alert('网络错误: ' + e.message);
  }
}

// 更新导航栏用户名
function updateNavUserName() {
  const nameEl = document.getElementById('navUserName');
  if (nameEl && user?.nickname) {
    nameEl.textContent = user.nickname;
  }
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

// 启动
try {
  init();
  updateNavUserName();
  console.log('✅ 页面初始化完成');
} catch (e) {
  console.error('❌ 页面初始化失败:', e);
  alert('页面初始化失败: ' + e.message);
}
