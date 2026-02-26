// 配置变量（从后端动态获取）
const API_BASE = window.location.origin;
let GATEWAY_WS = null;
let GATEWAY_TOKEN = null;  // JWT token，用于 WebSocket 代理认证
let OPENCLAW_TOKEN = null;  // OpenClaw token，用于 connect 消息
let GATEWAY_SESSION = null;
let SESSION_PREFIX = null;

let SESSION_KEY = null;  // 用户主会话（根据用户ID生成）
let currentSessionKey = null;  // 当前活动会话

const AGENT_INFO = {
  lingxi: { 
    icon: 'zap', 
    name: '灵犀', 
    desc: '智能调度 · 日程管理',
    scene: '日程管理',
    skills: '任务规划、提醒、邮件',
    agentId: 'main',  // OpenClaw 内部的 agent ID
    examples: [
      { text: '帮我安排明天的日程', desc: '日程规划' },
      { text: '提醒我下午3点开会', desc: '设置提醒' },
      { text: '帮我起草一封工作邮件', desc: '邮件撰写' },
      { text: '这个任务应该派给谁？', desc: '智能调度' }
    ]
  },
  coder: { 
    icon: 'code', 
    name: '云溪', 
    desc: '全栈开发 · 编程专家',
    scene: '编程开发',
    skills: '代码、调试、架构、API',
    agentId: 'coder',
    examples: [
      { text: '帮我写一个 Python 爬虫', desc: '代码生成' },
      { text: '这段代码有什么 bug？\n```python\nfor i in range(10)\n    print(i)\n```', desc: '代码审查' },
      { text: '设计一个用户登录 API', desc: 'API 设计' },
      { text: '优化这个 SQL 查询语句', desc: '性能优化' }
    ]
  },
  ops: { 
    icon: 'bar-chart-2', 
    name: '若曦', 
    desc: '增长运营 · 数据专家',
    scene: '数据分析',
    skills: '报表、增长、SEO、用户研究',
    agentId: 'ops',
    examples: [
      { text: '分析一下这周的用户增长数据', desc: '数据分析' },
      { text: '给我一个 SEO 优化方案', desc: 'SEO 优化' },
      { text: '如何提高用户留存率？', desc: '增长策略' },
      { text: '分析竞品的优劣势', desc: '竞品分析' }
    ]
  },
  inventor: { 
    icon: 'lightbulb', 
    name: '紫萱', 
    desc: '内容创意 · 文案总监',
    scene: '内容创作',
    skills: '文案、创意、社媒、营销',
    agentId: 'inventor',
    examples: [
      { text: '写一个产品宣传文案', desc: '文案创作' },
      { text: '给我的小红书账号想个选题', desc: '内容策划' },
      { text: '设计一个营销活动方案', desc: '活动策划' },
      { text: '头脑风暴：新产品的卖点', desc: '创意生成' }
    ]
  },
  pm: { 
    icon: 'target', 
    name: '梓萱', 
    desc: '产品设计 · 需求专家',
    scene: '产品设计',
    skills: '需求、原型、UX、商业模式',
    agentId: 'pm',
    examples: [
      { text: '帮我写一个产品需求文档', desc: '需求分析' },
      { text: '设计一个用户注册流程', desc: '流程设计' },
      { text: '这个功能如何设计更好？', desc: '产品建议' },
      { text: '分析一下商业模式可行性', desc: '商业分析' }
    ]
  },
  noter: { 
    icon: 'file-text', 
    name: '晓琳', 
    desc: '学习顾问 · 知识管理',
    scene: '知识管理',
    skills: '学习、翻译、笔记、搜索',
    agentId: 'noter',
    examples: [
      { text: '翻译这段话成英文', desc: '翻译服务' },
      { text: '帮我整理一下今天的会议笔记', desc: '笔记整理' },
      { text: '搜索一下 AI Agent 的最新进展', desc: '信息检索' },
      { text: '给我制定一个学习计划', desc: '学习规划' }
    ]
  },
  media: { 
    icon: 'palette', 
    name: '音韵', 
    desc: '多媒体创作 · AI绘图',
    scene: '多媒体娱乐',
    skills: 'AI绘图、视频、音乐、剧本',
    agentId: 'media',
    examples: [
      { text: '生成一张科幻风格的封面图', desc: 'AI 绘图' },
      { text: '写一个短视频脚本', desc: '剧本创作' },
      { text: '给我推荐一些 BGM', desc: '音乐推荐' },
      { text: '设计一张海报', desc: '设计建议' }
    ]
  },
  smart: { 
    icon: 'home', 
    name: '智家', 
    desc: '效率工具 · 自动化专家',
    scene: '智能工具',
    skills: '自动化、脚本、工具、效率',
    agentId: 'smart',
    examples: [
      { text: '写一个自动备份脚本', desc: '脚本编写' },
      { text: '如何批量重命名文件？', desc: '效率工具' },
      { text: '帮我设计一个自动化工作流', desc: '流程自动化' },
      { text: '推荐一些提高效率的工具', desc: '工具推荐' }
    ]
  }
};

// 辅助函数：生成 Lucide 图标 HTML
function agentIcon(agent, size = 'sm') {
  const icon = agent.icon || 'bot';
  return `<i data-lucide="${icon}" class="icon icon-${size} icon-primary"></i>`;
}

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
  
  // 🔒 先从服务器获取最新用户信息并检查团队状态
  try {
    console.log('🔍 检查用户团队状态...');
    const meRes = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!meRes.ok) {
      console.log('❌ 获取用户信息失败，跳转首页');
      localStorage.removeItem('lingxi_token');
      window.location.href = 'index.html';
      return;
    }
    
    const userData = await meRes.json();
    user = userData;
    localStorage.setItem('lingxi_user', JSON.stringify(userData));
    
    console.log('👤 用户信息:', userData);
    
    // 🔒 检查是否有团队（agents 不为空）
    if (!userData.agents || userData.agents.length === 0) {
      console.log('⚠️ 用户没有团队，跳转首页领取');
      alert('请先在首页领取 AI 团队');
      window.location.href = 'index.html';
      return;
    }
    
    console.log('✅ 用户已有团队:', userData.agents);
    
  } catch (e) {
    console.error('❌ 检查团队失败:', e);
    window.location.href = 'index.html';
    return;
  }
  
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
      const errorData = await res.json().catch(() => ({}));
      console.error('❌ 获取连接信息失败:', errorData);
      
      // 检查是否是服务器正在创建中
      if (errorData.needServer && errorData.status === 'creating') {
        alert('服务器正在创建中，请稍候...\n\n将返回首页等待创建完成。');
        window.location.href = 'index.html';
        return;
      }
      
      // 检查是否是需要服务器的错误
      if (errorData.needServer) {
        alert('您还没有专属服务器，请先在首页领取团队');
        window.location.href = 'index.html';
        return;
      }
      
      // 检查是否是 token 过期
      if (errorData.error === '登录已过期' || errorData.error === '未登录') {
        alert('登录已过期，请重新登录');
        localStorage.removeItem('lingxi_token');
        window.location.href = 'index.html';
        return;
      }
      
      // 其他错误
      alert(errorData.error || '获取连接信息失败');
      window.location.href = 'index.html';
      return;
    }
    
    const gatewayInfo = await res.json();
    GATEWAY_WS = gatewayInfo.wsUrl;
    GATEWAY_TOKEN = gatewayInfo.token;  // JWT token，用于代理
    OPENCLAW_TOKEN = gatewayInfo.gatewayToken;  // OpenClaw token，用于 connect
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
  
  // 初始化 agent 下拉（放在最后，确保 user 已加载）
  initAgentDropdown();
  
  // 🎯 检查是否需要引导（放在初始化最后）
  await checkOnboarding();
}

let requestId = 1;
let connectNonce = null;

// WebSocket 连接
function connectWebSocket() {
  const statusEl = document.getElementById('connectionStatus');
  statusEl.className = 'status-dot';
  statusEl.className = 'status-dot';
  
  try {
    // 🔧 修复：通过后端 WebSocket 代理连接，解决 HTTPS 混合内容问题
    // 代理地址格式：wss://lumeword.com/api/ws?token=xxx
    const wsUrl = `${GATEWAY_WS}?token=${encodeURIComponent(GATEWAY_TOKEN)}`;
    console.log('🔌 连接 WebSocket 代理:', wsUrl.replace(/token=[^&]+/, 'token=***'));
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket 已连接，等待 750ms 后发送 connect...');
      
      
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
      statusEl.className = 'status-dot';  // 红色
    };
    
    ws.onclose = () => {
      console.log('WebSocket 已断开，5秒后重连...');
      statusEl.className = 'status-dot';  // 红色
      setTimeout(connectWebSocket, 5000);
    };
  } catch (e) {
    console.error('WebSocket 连接失败:', e);
    statusEl.className = 'status-dot';  // 红色
  }
}

// 发送 connect 请求
function sendConnect() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  
  const params = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'openclaw-control-ui',  // 使用 control-ui 获得完整 operator 权限
      version: '1.0.0',
      platform: 'web',
      mode: 'webchat'
    },
    role: 'operator',
    scopes: ['operator.admin', 'operator.read', 'operator.write'],
    auth: { token: OPENCLAW_TOKEN },  // 使用 OpenClaw token
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
    statusEl.className = 'status-dot';  // 红色
    return;
  }
  
  // 连接响应
  if (data.type === 'res' && data.ok && data.payload?.type === 'hello-ok') {
    statusEl.className = 'status-dot connected';  // 绿色
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
    
    // 如果是认证错误，显示红色状态
    if (errorMsg.includes('auth') || errorMsg.includes('token') || errorMsg.includes('认证')) {
      statusEl.className = 'status-dot';  // 红色
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
    
    // 检查是否是当前会话（宽松匹配，只检查后缀）
    if (payload.sessionKey && currentSessionKey) {
      const payloadSuffix = payload.sessionKey.split(':').pop();
      const currentSuffix = currentSessionKey.split(':').pop();
      if (payloadSuffix !== currentSuffix && payload.sessionKey !== currentSessionKey) {
        console.log('⚠️ 跳过非当前会话消息:', payload.sessionKey, '当前:', currentSessionKey);
        return;
      }
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
  if (typeof message === 'string') return cleanMessageText(message);
  if (message.text) return cleanMessageText(message.text);
  if (message.content) {
    if (typeof message.content === 'string') return cleanMessageText(message.content);
    if (Array.isArray(message.content)) {
      return message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');
    }
  }
  return null;
}

// 清理消息文本，过滤掉元数据等技术信息
function cleanMessageText(text) {
  if (!text || typeof text !== 'string') return text;
  
  // 过滤掉 Conversation info (untrusted metadata) 等技术信息
  let cleaned = text;
  
  // 移除 Conversation info 块
  cleaned = cleaned.replace(/Conversation info \(untrusted metadata\):[\s\S]*?```/g, '');
  
  // 移除 ```json ... ``` 块中只包含元数据的内容
  cleaned = cleaned.replace(/```json\s*\{[\s\S]*?"message_id"[\s\S]*?\}\s*```/g, '');
  
  // 移除 [message_id: ...] 行
  cleaned = cleaned.replace(/\[message_id:\s*[a-f0-9-]+\]/gi, '');
  
  // 移除多余空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  return cleaned.trim();
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
  const agents = user?.agents || [];
  if (agents.length === 0) {
    agents.push('lingxi');
  }
  
  const tags = document.getElementById('teamTags');
  if (!tags) return;
  
  tags.innerHTML = `
    <div class="team-avatars">
      ${agents.map(id => {
        const agent = AGENT_INFO[id] || { icon: 'bot', name: id };
        return `<span class="team-avatar" title="${agent.name}">${agentIcon(agent)}</span>`;
      }).join('')}
    </div>
  `;
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
    console.log('📦 sessionKey:', currentSessionKey);
    addTyping();
    
    const reqId = `req_${requestId++}`;
    const req = {
      type: 'req',
      id: reqId,
      method: 'chat.send',
      params: {
        sessionKey: currentSessionKey,
        message: text,
        idempotencyKey: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        deliver: false
      }
    };
    console.log('📤 发送请求:', reqId, 'sessionKey:', currentSessionKey);
    ws.send(JSON.stringify(req));
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
  
  // 如果没有消息，显示欢迎界面（带当前 Agent 的示例）
  if (!messages || messages.length === 0) {
    const agentInfo = AGENT_INFO[currentAgentId] || AGENT_INFO['lingxi'];
    const examplesHtml = (agentInfo?.examples || []).map(ex => `
      <div class="welcome-example" onclick="sendWelcomeExample('${ex.text.replace(/'/g, "\\'").replace(/\n/g, '\\n')}')">
        <span class="example-text">${ex.text}</span>
        <span class="example-tag">${ex.desc}</span>
      </div>
    `).join('');
    
    container.innerHTML = `
      <div class="welcome" id="welcome">
        <div class="welcome-icon">${agentIcon(agentInfo, 'lg')}</div>
        <div class="welcome-title">${agentInfo.name}</div>
        <div class="welcome-desc">${agentInfo.desc}</div>
        ${examplesHtml ? `
          <div class="welcome-examples">
            <div class="welcome-examples-title">试试这些</div>
            <div class="welcome-examples-list">${examplesHtml}</div>
          </div>
        ` : ''}
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
  
  // 强制滚动到底部（延迟确保DOM渲染完成）
  const scrollToBottom = () => {
    // 滚动消息容器
    container.scrollTop = container.scrollHeight;
    
    // 滚动整个页面（移动端更可靠）
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'instant'
    });
    
    // 额外：确保输入框可见
    const inputArea = document.querySelector('.input-area');
    if (inputArea) {
      inputArea.scrollIntoView({ behavior: 'instant', block: 'end' });
    }
    
    console.log('📜 已滚动到底部');
  };
  
  // 多次尝试滚动，确保生效
  setTimeout(scrollToBottom, 50);
  setTimeout(scrollToBottom, 200);
  setTimeout(scrollToBottom, 500);
}

// ===== 会话管理 =====

// 会话列表（挂载到 window，让 chat.html 可以访问）
window.sessions = [];

// 本地已删除的会话 key 列表（持久化到 localStorage）
const DELETED_SESSIONS_KEY = 'lingxi_deleted_sessions';
function getDeletedSessions() {
  try {
    return JSON.parse(localStorage.getItem(DELETED_SESSIONS_KEY) || '[]');
  } catch {
    return [];
  }
}
function addDeletedSession(key) {
  const deleted = getDeletedSessions();
  if (!deleted.includes(key)) {
    deleted.push(key);
    localStorage.setItem(DELETED_SESSIONS_KEY, JSON.stringify(deleted));
    console.log('📝 记录已删除会话:', key);
  }
}
function isSessionDeleted(key) {
  return getDeletedSessions().includes(key);
}

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
      // 过滤掉本地已删除的会话
      const deletedSessions = getDeletedSessions();
      let allSessions = res.payload.sessions.filter(s => !deletedSessions.includes(s.key));
      
      // 过滤掉系统会话（心跳、健康检查等）
      const systemPatterns = ['heartbeat', 'health', 'ping', 'pong', '_system', '_internal'];
      allSessions = allSessions.filter(s => {
        const key = s.key.toLowerCase();
        return !systemPatterns.some(p => key.includes(p));
      });
      
      // 按更新时间排序（最新的在前）
      allSessions.sort((a, b) => {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return timeB - timeA;
      });
      
      // 限制最多显示 50 个会话
      const maxSessions = 50;
      if (allSessions.length > maxSessions) {
        console.log('📋 会话数量超过', maxSessions, '，只显示最近的', maxSessions, '个');
        allSessions = allSessions.slice(0, maxSessions);
      }
      
      window.sessions = allSessions;
      console.log('✅ 加载了', allSessions.length, '个会话（原始:', res.payload.sessions.length, '）');
      renderSessionList();
      // 更新侧边栏会话列表
      console.log('🔍 检查 loadSidebarSessions:', typeof loadSidebarSessions);
      if (typeof loadSidebarSessions === 'function') {
        console.log('📞 调用 loadSidebarSessions()');
        loadSidebarSessions();
      } else {
        console.log('⚠️ loadSidebarSessions 不是函数，尝试 window.loadSidebarSessions');
        if (typeof window.loadSidebarSessions === 'function') {
          window.loadSidebarSessions();
        }
      }
    } else {
      console.log('⚠️ 无会话数据');
      window.sessions = [];
      renderSessionList();
      if (typeof loadSidebarSessions === 'function') {
        loadSidebarSessions();
      }
    }
  } catch (e) {
    console.error('❌ 加载会话列表失败:', e);
    window.sessions = [];
    renderSessionList();
    if (typeof loadSidebarSessions === 'function') {
      loadSidebarSessions();
    }
  }
}

// 渲染会话列表
function renderSessionList() {
  const container = document.getElementById('sessionList');
  
  // 如果 sessionList 容器不存在（新布局使用侧边栏），跳过
  if (!container) {
    console.log('📋 sessionList 容器不存在，跳过 renderSessionList');
    return;
  }
  
  console.log('📋 渲染会话列表, 总会话数:', window.sessions.length);
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
  
  // 显示所有会话
  for (const session of window.sessions) {
    const isActive = session.key === currentSessionKey;
    // 解析显示名称
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
  if (window.sessions.length === 0) {
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
    return;
  }
  
  currentSessionKey = sessionKey;
  console.log('🔄 切换到会话:', sessionKey);
  
  // 从 sessionKey 解析 agent（格式：agent:{agentId}:{namespace}:{sessionId}）
  const parts = sessionKey.split(':');
  if (parts.length >= 2 && parts[0] === 'agent') {
    const agentId = parts[1];
    // 更新当前 agent
    if (AGENT_INFO[agentId] && currentAgentId !== agentId) {
      currentAgentId = agentId;
      console.log('🔄 同时切换 agent:', agentId);
      
      // 更新导航栏图标
      const iconEl = document.getElementById('currentAgentIcon');
      if (iconEl) {
        iconEl.setAttribute('data-lucide', AGENT_INFO[agentId].icon || 'bot');
        if (window.lucide) lucide.createIcons();
      }
    }
  }
  
  // 清空当前消息，显示加载状态
  const container = document.getElementById('messages');
  container.innerHTML = `
    <div class="welcome" id="welcome">
      <div class="welcome-icon">
        <i data-lucide="loader-2" class="icon-lg" style="animation: spin 1s linear infinite;"></i>
      </div>
      <div class="welcome-title">加载中...</div>
      <div class="welcome-desc">正在获取聊天历史</div>
    </div>
  `;
  
  // 重新渲染 Lucide 图标
  if (window.lucide) lucide.createIcons();
  
  // 加载该会话的历史
  try {
    await loadChatHistory();
  } catch (e) {
    console.error('加载历史失败:', e);
  }
  
  // 重新渲染会话列表以更新选中状态
  renderSessionList();
  
  // 更新侧边栏选中状态
  if (typeof loadSidebarSessions === 'function') {
    loadSidebarSessions();
  }
  
  console.log('✅ 会话切换完成, currentSessionKey:', currentSessionKey);
}

// 删除会话
async function deleteSession(sessionKey) {
  if (sessionKey === currentSessionKey) {
    alert('无法删除当前会话');
    return;
  }
  
  if (!confirm('确定删除这个会话吗？')) return;
  
  console.log('🗑️ 开始删除会话:', sessionKey);
  
  try {
    // 调用 WebSocket API 删除会话
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('📡 WebSocket 已连接，发送删除请求...');
      
      const res = await new Promise((resolve, reject) => {
        const id = `req_${requestId++}`;
        const timeout = setTimeout(() => {
          console.log('⏱️ 删除请求超时');
          reject(new Error('timeout'));
        }, 10000);
        
        const handler = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('📥 收到响应:', data.id, '期待:', id);
            if (data.id === id) {
              clearTimeout(timeout);
              ws.removeEventListener('message', handler);
              resolve(data);
            }
          } catch (e) {}
        };
        
        ws.addEventListener('message', handler);
        
        const deleteReq = {
          type: 'req',
          id,
          method: 'sessions.delete',
          params: { key: sessionKey }
        };
        console.log('📤 发送删除请求:', deleteReq);
        ws.send(JSON.stringify(deleteReq));
      });
      
      console.log('📋 sessions.delete 响应:', res);
      
      if (res.ok) {
        // 记录到本地已删除列表（防止刷新后重新出现）
        addDeletedSession(sessionKey);
        
        // 从本地列表中移除
        window.sessions = window.sessions.filter(s => s.key !== sessionKey);
        renderSessionList();
        console.log('✅ 删除会话成功:', sessionKey);
        
        // 刷新侧边栏
        if (typeof loadSidebarSessions === 'function') {
          loadSidebarSessions();
        }
      } else {
        const errorMsg = res.error?.message || JSON.stringify(res.error) || '未知错误';
        console.error('❌ 删除失败:', errorMsg);
        alert('删除失败: ' + errorMsg);
      }
    } else {
      console.log('⚠️ WebSocket 未连接，只删除本地');
      // WebSocket 未连接，只删除本地
      addDeletedSession(sessionKey);
      window.sessions = window.sessions.filter(s => s.key !== sessionKey);
      renderSessionList();
      
      // 刷新侧边栏
      if (typeof loadSidebarSessions === 'function') {
        loadSidebarSessions();
      }
    }
  } catch (e) {
    console.error('❌ 删除会话异常:', e);
    // 失败时也删除本地
    addDeletedSession(sessionKey);
    window.sessions = window.sessions.filter(s => s.key !== sessionKey);
    renderSessionList();
    
    // 刷新侧边栏
    if (typeof loadSidebarSessions === 'function') {
      loadSidebarSessions();
    }
  }
}

// 带刷新的删除函数（供侧边栏调用）
window.deleteSessionWithRefresh = async function(sessionKey) {
  await deleteSession(sessionKey);
  // 刷新侧边栏
  if (typeof loadSidebarSessions === 'function') {
    loadSidebarSessions();
  }
};

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
  
  // 获取当前 Agent 的头像
  const currentAgent = AGENT_INFO[currentAgentId] || { icon: 'zap', name: '灵犀' };
  const avatarHtml = role === 'user' 
    ? '<div class="avatar user-avatar"><i data-lucide="user" class="icon-sm"></i></div>'
    : `<div class="avatar">${agentIcon(currentAgent, 'sm')}</div>`;
  
  div.innerHTML = `
    ${avatarHtml}
    <div class="bubble">${escapeHtml(content)}</div>
  `;
  
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  
  // 重新渲染 Lucide 图标
  if (window.lucide) lucide.createIcons();
  
  return div;
}

// 添加打字动画
function addTyping() {
  const messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.id = 'typing-indicator';
  
  // 获取当前 Agent 的头像
  const currentAgent = AGENT_INFO[currentAgentId] || { icon: 'zap' };
  
  div.innerHTML = `
    <div class="avatar">${agentIcon(currentAgent, 'sm')}</div>
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
  if (dropdown) dropdown.classList.toggle('show');
}

// 点击其他地方关闭下拉菜单
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown') && !e.target.closest('.sidebar-footer')) {
    document.getElementById('userDropdown')?.classList.remove('show');
    document.getElementById('sidebarUserMenu')?.classList.remove('show');
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
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
  const userMenu = document.getElementById('sidebarUserMenu');
  if (userMenu) userMenu.classList.remove('show');
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
  let myAgents = user?.agents || [];
  if (myAgents.length === 0) {
    myAgents = ['lingxi'];
  }
  const container = document.getElementById('myTeamList');
  if (!container) return;
  
  container.innerHTML = myAgents.map(agentId => {
    const agent = AGENT_INFO[agentId] || { icon: 'bot', name: agentId, desc: 'AI 助手', scene: '通用', skills: '' };
    const isRequired = agentId === 'lingxi';
    
    return `
      <div class="team-member">
        <div class="team-member-info">
          <div class="team-member-avatar">${agentIcon(agent)}</div>
          <div>
            <div class="team-member-name">${agent.name}</div>
            <div class="team-member-role">${agent.desc}</div>
          </div>
        </div>
        ${isRequired ? 
          '<span class="team-badge">队长</span>' : 
          `<button class="remove-btn" onclick="removeAgent('${agentId}')">移除</button>`
        }
      </div>
    `;
  }).join('');
  
  // 如果用户没有团队，显示提示
  if (!user?.agents || user.agents.length === 0) {
    container.innerHTML += `
      <div style="text-align:center;padding:16px;color:rgba(255,255,255,0.5);font-size:13px;margin-top:12px;border-top:1px solid rgba(255,255,255,0.1);">
        💡 你还没有领取完整团队<br>邀请好友获得积分后即可领取
      </div>
    `;
  }
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
        ${agentIcon(agent, 'sm')}
        <span>${agent.name}</span>
        <span style="font-size:10px;color:#6e6e80;margin-left:4px;">${agent.scene}</span>
      </div>
    `;
  }).join('');
  
  // 重新渲染 Lucide 图标
  if (window.lucide) lucide.createIcons();
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
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
  const userMenu = document.getElementById('sidebarUserMenu');
  if (userMenu) userMenu.classList.remove('show');
  
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
    const res = await fetch(`${API_BASE}/api/remote-config/status/${user.id}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}` }
    });
    const data = await res.json();
    
    if (data.config?.feishu?.configured) {
      statusEl.innerHTML = `<span style="color:#4ade80">✅ 已配置</span>`;
      document.getElementById('feishuWebhook').style.display = 'block';
      document.getElementById('feishuWebhookUrl').value = data.config.feishu.webhookUrl || '';
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
    const res = await fetch(`${API_BASE}/api/remote-config/feishu`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      },
      body: JSON.stringify({ userId: user.id, appId, appSecret })
    });
    
    const data = await res.json();
    
    if (data.success) {
      const webhookInfo = data.webhook ? `\n\n请在飞书开放平台配置事件订阅：\n${data.webhook.eventUrl}` : '';
      alert('飞书配置成功！' + webhookInfo);
      loadFeishuStatus();
      closeFeishuModal();
    } else {
      alert('配置失败: ' + (data.error || '未知错误'));
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
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
  const userMenu = document.getElementById('sidebarUserMenu');
  if (userMenu) userMenu.classList.remove('show');
  
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
    const res = await fetch(`${API_BASE}/api/remote-config/status/${user.id}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}` }
    });
    const data = await res.json();
    
    if (data.config?.wecom?.configured) {
      statusEl.innerHTML = `<span style="color:#4ade80">✅ 已配置</span>`;
      document.getElementById('wecomWebhook').style.display = 'block';
      document.getElementById('wecomWebhookUrl').value = data.config.wecom.callbackUrl || '';
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
  const token = document.getElementById('wecomToken')?.value.trim() || '';
  const encodingAesKey = document.getElementById('wecomEncodingAesKey')?.value.trim() || '';
  
  if (!corpId || !agentId || !agentSecret) {
    alert('请填写完整信息');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/api/remote-config/wecom`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      },
      body: JSON.stringify({ 
        userId: user.id, 
        corpId, 
        agentId, 
        secret: agentSecret,
        token,
        encodingAesKey
      })
    });
    
    const data = await res.json();
    
    if (data.success) {
      const callbackInfo = data.webhook ? `\n\n请配置回调地址：\n${data.webhook.callbackUrl}` : '';
      alert('企业微信配置成功！' + callbackInfo);
      loadWecomStatus();
      closeWecomModal();
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
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
  const userMenu = document.getElementById('sidebarUserMenu');
  if (userMenu) userMenu.classList.remove('show');
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

// 更新导航栏用户名（显示首字母）
function updateNavUserName() {
  const nameEl = document.getElementById('navUserInitial');
  if (nameEl && user?.nickname) {
    nameEl.textContent = user.nickname.charAt(0).toUpperCase();
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

// ==================== Agent 切换功能 ====================

// 直接复用 AGENT_INFO，确保 key 一致（lingxi, coder, ops 等）
const ALL_AGENTS = Object.fromEntries(
  Object.keys(AGENT_INFO).map(id => {
    const info = AGENT_INFO[id];
    return [id, { id, name: info.name, icon: info.icon, desc: info.scene }];
  })
);

let currentAgentId = 'lingxi';
let userAgentList = ['lingxi'];

// ==================== 引导系统 ====================

let selectedJobType = null;
let recommendationData = null;

// 检查并启动引导
async function checkOnboarding() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}` }
    });
    
    if (!res.ok) return false;
    
    const userData = await res.json();
    
    // 更新全局 user 对象
    user = { ...user, ...userData };
    
    // 检查是否完成引导
    if (userData.onboardingCompleted !== true) {
      console.log('🎯 用户未完成引导，启动引导流程');
      startOnboarding();
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('检查引导状态失败:', e);
    return true; // 出错时跳过引导
  }
}

// 启动引导
async function startOnboarding() {
  // 加载职业类型
  await loadJobTypes();
  
  // 显示引导弹窗
  document.getElementById('onboardingModal').style.display = 'flex';
  
  // 重置到第一步
  goToOnboardingStep(1);
}

// 加载职业类型
async function loadJobTypes() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/onboarding/job-types`);
    const data = await res.json();
    
    const grid = document.getElementById('jobTypeGrid');
    grid.innerHTML = data.jobTypes.map(job => `
      <div class="job-type-item" onclick="selectJobType('${job.id}')" data-job="${job.id}">
        ${job.label}
      </div>
    `).join('');
  } catch (e) {
    console.error('加载职业类型失败:', e);
  }
}

// 选择职业类型
async function selectJobType(jobId) {
  // 更新选中状态
  document.querySelectorAll('.job-type-item').forEach(el => {
    el.classList.remove('selected');
  });
  document.querySelector(`[data-job="${jobId}"]`)?.classList.add('selected');
  
  selectedJobType = jobId;
  
  // 获取推荐
  try {
    const res = await fetch(`${API_BASE}/api/auth/onboarding/recommendation/${jobId}`);
    recommendationData = await res.json();
    
    // 延迟跳转，让用户看到选中效果
    setTimeout(() => goToOnboardingStep(3), 300);
  } catch (e) {
    console.error('获取推荐失败:', e);
  }
}

// 切换引导步骤
function goToOnboardingStep(step) {
  // 隐藏所有步骤
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`onboardingStep${i}`).style.display = 'none';
  }
  
  // 显示当前步骤
  document.getElementById(`onboardingStep${step}`).style.display = 'block';
  
  // 如果是步骤3，渲染推荐
  if (step === 3 && recommendationData) {
    renderRecommendation();
  }
}

// 渲染推荐配置
function renderRecommendation() {
  const rec = recommendationData.recommendation;
  const hint = document.getElementById('recommendationHint');
  const agentsContainer = document.getElementById('recommendationAgents');
  
  hint.textContent = `${rec.label}的推荐配置`;
  
  agentsContainer.innerHTML = rec.agents.map(agentId => {
    const agent = AGENT_INFO[agentId];
    return `
      <div class="recommendation-agent">
        <div class="emoji">${agentIcon(agent)}</div>
        <div class="info">
          <div class="name">${agent.name}</div>
          <div class="desc">${agent.desc}</div>
        </div>
      </div>
    `;
  }).join('');
  
  // 添加灵犀（始终存在）
  const lingxiAgent = AGENT_INFO['lingxi'];
  agentsContainer.innerHTML = `
    <div class="recommendation-agent">
      <div class="emoji">${agentIcon(lingxiAgent)}</div>
      <div class="info">
        <div class="name">灵犀</div>
        <div class="desc">队长 · 智能调度</div>
      </div>
    </div>
  ` + agentsContainer.innerHTML;
}

// 应用推荐配置
async function applyRecommendation() {
  const btn = document.getElementById('applyRecommendationBtn');
  btn.disabled = true;
  btn.textContent = '配置中...';
  
  try {
    const agents = ['lingxi', ...recommendationData.recommendation.agents];
    
    const res = await fetch(`${API_BASE}/api/auth/onboarding/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('lingxi_token')}`
      },
      body: JSON.stringify({
        jobType: selectedJobType,
        agents: agents
      })
    });
    
    const data = await res.json();
    
    if (data.success) {
      // 更新本地用户信息
      user = { ...user, ...data.user };
      localStorage.setItem('lingxi_user', JSON.stringify(user));
      
      // 渲染团队预览
      renderTeamPreview(agents);
      
      // 跳转到完成步骤
      goToOnboardingStep(4);
    } else {
      alert('配置失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    alert('网络错误: ' + e.message);
  }
  
  btn.disabled = false;
  btn.textContent = '应用配置';
}

// 渲染团队预览
function renderTeamPreview(agents) {
  const preview = document.getElementById('teamPreview');
  preview.innerHTML = agents.map(agentId => {
    const agent = AGENT_INFO[agentId];
    return `<div class="team-preview-avatar">${agentIcon(agent)}</div>`;
  }).join('');
  
  // 重新渲染 Lucide 图标
  if (window.lucide) lucide.createIcons();
}

// 开始对话（完成引导后）
function startChat() {
  // 关闭引导弹窗
  document.getElementById('onboardingModal').style.display = 'none';
  
  // 更新界面
  renderTeamTags();
  initAgentDropdown();
  
  console.log('✅ 引导完成，开始对话');
}

function toggleAgentDropdown() {
  const dropdown = document.getElementById('agentDropdown');
  dropdown.classList.toggle('show');
  
  // 点击其他地方关闭
  if (dropdown.classList.contains('show')) {
    setTimeout(() => {
      document.addEventListener('click', closeAgentDropdownOnClickOutside);
    }, 0);
  }
}

function closeAgentDropdownOnClickOutside(e) {
  if (!e.target.closest('.agent-switcher')) {
    document.getElementById('agentDropdown')?.classList.remove('show');
    document.removeEventListener('click', closeAgentDropdownOnClickOutside);
  }
}

function renderAgentDropdown() {
  const dropdown = document.getElementById('agentDropdown');
  if (!dropdown) return;
  
  const agents = userAgentList.map(id => ALL_AGENTS[id]).filter(Boolean);
  
  if (agents.length === 0) {
    dropdown.innerHTML = '<div style="padding: 20px; text-align: center; color: #6e6e80;">暂无团队成员</div>';
    return;
  }
  
  dropdown.innerHTML = agents.map(agent => `
    <div class="agent-dropdown-item ${agent.id === currentAgentId ? 'active' : ''}" 
         onclick="switchAgent('${agent.id}')">
      <span class="emoji">${agentIcon(agent)}</span>
      <div class="info">
        <h4>${agent.name}</h4>
        <p>${agent.desc}</p>
      </div>
    </div>
  `).join('');
  
  // 重新渲染 Lucide 图标
  if (window.lucide) lucide.createIcons();
}

function switchAgent(agentId) {
  if (agentId === currentAgentId) return;
  
  currentAgentId = agentId;
  
  // 从完整的 AGENT_INFO 获取信息
  const agent = AGENT_INFO[agentId];
  if (!agent) {
    console.error('找不到 Agent:', agentId);
    return;
  }
  
  // 更新导航栏图标
  const iconEl = document.getElementById('currentAgentIcon');
  if (iconEl) {
    iconEl.setAttribute('data-lucide', agent.icon || 'bot');
    if (window.lucide) lucide.createIcons();
  }
  
  // 关闭下拉
  document.getElementById('agentDropdown')?.classList.remove('show');
  
  // 更新列表
  renderAgentDropdown();
  
  // 🎯 每个 agent 有独立的会话，直接对话
  const targetAgentId = agent.agentId || agentId;
  currentSessionKey = `agent:${targetAgentId}:main`;
  
  console.log('🔄 切换到 agent:', agentId, 'agentId:', targetAgentId, '会话:', currentSessionKey);
  
  // 更新欢迎界面 - 显示当前 Agent 的示例
  updateWelcomeForAgent(agentId);
}

// 更新欢迎界面为指定 Agent
function updateWelcomeForAgent(agentId) {
  const agentInfo = AGENT_INFO[agentId];
  if (!agentInfo) return;
  
  const container = document.getElementById('messages');
  container.innerHTML = '';
  
  const examplesHtml = (agentInfo.examples || []).map(ex => `
    <div class="welcome-example" onclick="sendWelcomeExample('${ex.text.replace(/'/g, "\\'").replace(/\n/g, '\\n')}')">
      <span class="example-text">${ex.text}</span>
      <span class="example-tag">${ex.desc}</span>
    </div>
  `).join('');
  
  container.innerHTML = `
    <div class="welcome" id="welcome">
      <div class="welcome-icon">${agentIcon(agentInfo, 'lg')}</div>
      <div class="welcome-title">${agentInfo.name}</div>
      <div class="welcome-desc">${agentInfo.desc}</div>
      ${examplesHtml ? `
        <div class="welcome-examples">
          <div class="welcome-examples-title">试试这些</div>
          <div class="welcome-examples-list">${examplesHtml}</div>
        </div>
      ` : ''}
    </div>
  `;
  
  // 重新渲染 Lucide 图标
  if (window.lucide) lucide.createIcons();
}

// 从欢迎界面发送示例
function sendWelcomeExample(text) {
  // 隐藏欢迎界面
  const welcome = document.getElementById('welcome');
  if (welcome) {
    welcome.classList.add('hidden');
  }
  
  // 填入并发送
  const input = document.getElementById('inputField');
  input.value = text;
  sendMessage();
}

// 初始化时渲染 agent 下拉
function initAgentDropdown() {
  console.log('🎯 initAgentDropdown 调用, user:', user);
  // 使用已加载的 user 变量
  if (user?.agents && user.agents.length > 0) {
    userAgentList = user.agents;
    // 设置当前 agent 为用户的第一个（或 lingxi）
    currentAgentId = userAgentList.includes('lingxi') ? 'lingxi' : userAgentList[0];
    
    // 更新显示
    const agent = ALL_AGENTS[currentAgentId];
    if (agent) {
      const iconEl = document.getElementById('currentAgentIcon');
      if (iconEl) {
        iconEl.setAttribute('data-lucide', agent.icon || 'bot');
        if (window.lucide) lucide.createIcons();
      }
    }
  }
  console.log('🎯 userAgentList:', userAgentList, 'ALL_AGENTS:', Object.keys(ALL_AGENTS));
  renderAgentDropdown();
}
