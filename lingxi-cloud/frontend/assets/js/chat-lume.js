/**
 * Web 聊天 — Gateway WebSocket 优先，Lume 插件可选回退
 */
window.USE_LUME = false;

// 流式累积状态：runId -> { fullText, lastTextLen }
const _lumeStreamState = {};

async function tryConnectLume() {
  if (typeof LumeRpc === 'undefined') { console.warn('[Lume] LumeRpc 未定义'); return false; }
  try {
    console.log('[Lume] 🔌 尝试连接...');
    const ok = await LumeRpc.connect();
    console.log('[Lume] connect() 返回:', ok);
    if (ok) {
      window.USE_LUME = true;
      console.log('✅ [Lume] Web 聊天模式已启用');
      return true;
    }
    console.warn('[Lume] connect() 返回 false');
  } catch (e) {
    console.warn('[Lume] 连接失败，降级 Gateway:', e.message);
  }
  return false;
}

// 无条件注册事件监听
if (typeof LumeRpc !== 'undefined') {
  LumeRpc.onEvent((msg) => handleLumeEvent(msg));
}

function initLumeChatMode() {
  if (!window.USE_LUME || !LumeRpc.isConnected()) {
    console.warn('[Lume] 未连接，跳过 initLumeChatMode');
    return;
  }
  const statusEl = document.getElementById('connectionStatus');
  if (statusEl) {
    statusDot = statusEl.querySelector('.status-dot');
    if (statusDot) statusDot.className = 'status-dot connected';
  }

  // 首屏优先加载当前会话历史；侧边栏列表延后异步刷新，避免手机端进页面空等 sessions.list。
  if (typeof ensureCurrentSessionLoaded === 'function') {
    void ensureCurrentSessionLoaded('initLumeChatMode');
  } else if (typeof loadChatHistory === 'function') {
    void loadChatHistory();
  }
  setTimeout(() => { void loadLumeSessions(); }, 300);

  // health.subscribe 已改为按需，不再自动订阅（减少无用网络请求）
}


function normalizeLumeSession(s) {
  const title = s.title || s.derivedTitle || s.label || s.displayName || 'Untitled';
  const preview = s.lastMessagePreview || s.lastMessage || s.preview || '';
  let relativeTime = s.relativeTime || '';
  if (!relativeTime && s.updatedAt && typeof formatRelativeTime === 'function') {
    relativeTime = formatRelativeTime(s.updatedAt);
  }
  return Object.assign({}, s, {
    title,
    derivedTitle: s.derivedTitle || title,
    preview,
    lastMessage: preview || s.lastMessage,
    lastMessagePreview: s.lastMessagePreview || preview,
    relativeTime,
  });
}

async function loadLumeSessions() {
  try {
    if (typeof LumeRpc !== 'undefined' && !LumeRpc.isConnected()) {
      const ok = await LumeRpc.connect();
      if (!ok) {
        console.warn('[Lume] 未连接，无法加载会话列表');
        return;
      }
      window.USE_LUME = true;
    }
    const res = await LumeRpc.sendRequest('sessions.list', {
      limit: 50,
      includeLastMessage: true,
      includeDerivedTitles: true,
    }, 35000);
    if (res.ok && res.payload?.sessions) {
      window.sessions = res.payload.sessions.map(normalizeLumeSession);
      if (typeof renderSessionList === 'function') renderSessionList();
      try {
        if (typeof loadSessions === 'function') loadSessions();
      } catch (e) {
        console.warn('[Lume] loadSessions 失败（侧栏可能尚未加载）:', e);
      }
      // 列表刷新只更新侧边栏，不反向触发当前会话加载/切换。
    } else {
      console.warn('[Lume] sessions.list 无数据:', res);
    }
  } catch (e) {
    console.warn('[Lume] 加载会话列表失败:', e);
  }
}

/**
 * 只刷新会话列表，不触发 loadChatHistory（避免清空当前聊天消息）
 */
async function refreshSessionListOnly() {
  try {
    if (typeof LumeRpc !== 'undefined' && !LumeRpc.isConnected()) return;
    const res = await LumeRpc.sendRequest('sessions.list', {
      limit: 50,
      includeLastMessage: true,
      includeDerivedTitles: true,
    }, 35000);
    if (res.ok && res.payload?.sessions) {
      window.sessions = res.payload.sessions.map(normalizeLumeSession);
      if (typeof renderSessionList === 'function') renderSessionList();
      if (typeof loadSidebarSessions === 'function') loadSidebarSessions();
    }
  } catch (e) {
    console.warn('[Lume] refreshSessionListOnly 失败:', e);
  }
}

/**
 * 增量更新单个 session（来自 sessions.updated 事件）
 * 避免全量拉取会话列表，只更新对应 session 并置顶
 */
function incrementalUpdateSession(payload) {
  if (!payload) return;
  const sessionKey = payload.sessionKey;
  if (!sessionKey) return;

  const timestamp = payload.timestamp || Date.now();
  const preview = payload.lastMessagePreview;

  if (!window.sessions || !Array.isArray(window.sessions)) {
    refreshSessionListOnly();
    return;
  }

  const index = window.sessions.findIndex((s) => s.key === sessionKey);
  if (index >= 0) {
    // 找到 → 局部更新 + 置顶
    window.sessions[index].timestamp = timestamp;
    window.sessions[index].updatedAt = timestamp;
    if (typeof formatRelativeTime === 'function') {
      window.sessions[index].relativeTime = formatRelativeTime(timestamp);
    }
    if (preview) {
      window.sessions[index].lastMessagePreview = preview;
      window.sessions[index].preview = preview;
      window.sessions[index].lastMessage = preview;
    }
    // 移到数组顶部（最近活跃）
    const [updated] = window.sessions.splice(index, 1);
    window.sessions.unshift(updated);

    // 重新渲染
    if (typeof renderSessionList === 'function') renderSessionList();
    if (typeof loadSidebarSessions === 'function') loadSidebarSessions();
  } else {
    // 不在本地列表中 → fallback 全量拉取会话列表
    // 但不清空当前聊天消息（只刷新侧栏列表）
    console.log('[Lume] session 不在本地列表，刷新会话列表（不清空消息）');
    refreshSessionListOnly();
  }
}

function _syncEventSessionKey(payload) {
  // 只同步真正聊天事件的 sessionKey。
  // sessions.updated / sessions.list 等事件也会带 key，不能用来改写当前会话。
  const key = payload?.sessionKey;
  if (key && typeof syncCurrentSessionKey === 'function') {
    syncCurrentSessionKey(key);
  }
}

function _finishLumeGeneration(runId, text, modelInfo) {
  if (typeof removeTyping === 'function') removeTyping();
  if (typeof isGenerating !== 'undefined') isGenerating = false;
  if (typeof currentRunId !== 'undefined') currentRunId = null;
  if (typeof updateSendButton === 'function') updateSendButton();
  if (text && typeof finalizeStreamingMessage === 'function') {
    finalizeStreamingMessage(text, runId, modelInfo);
  } else if (text && typeof addMessage === 'function') {
    addMessage('assistant', text, '灵犀');
  }
  if (typeof refreshSessionListOnly === 'function') refreshSessionListOnly();
}

function handleLumeEvent(msg) {
  if (msg.event === 'conn.state') {
    var connState = (msg.payload && msg.payload.state) || 'disconnected';
    var statusEl = document.getElementById('connectionStatus');
    var dot = statusEl ? statusEl.querySelector('.status-dot') : null;
    if (dot) {
      if (connState === 'connected') dot.className = 'status-dot connected';
      else if (connState === 'connecting' || connState === 'reconnecting') dot.className = 'status-dot connecting';
      else dot.className = 'status-dot disconnected';
    }
    if (statusEl) {
      var label = statusEl.querySelector('.status-text');
      if (label) {
        label.textContent = connState === 'connected' ? '已连接' : (connState === 'reconnecting' ? '重连中' : (connState === 'connecting' ? '连接中' : '已断开'));
      }
    }
    return;
  }
  if (msg.event === 'device.switched') {
    console.log('[Lume] device.switched → 重新加载会话与历史');
    localStorage.removeItem('currentSessionKey');
    window.sessions = [];
    void loadLumeSessions();
    return;
  }
  if (msg.event === 'health.status') {
    console.log('[Lume] health.status', msg.payload);
    return;
  }
  if (msg.event === 'sessions.updated') {
    console.log('[Lume] sessions.updated → 增量更新会话');
    incrementalUpdateSession(msg.payload);
    return;
  }
  // agent 事件：OpenClaw Gateway 流式响应
  if (msg.event === 'agent') {
    const p = msg.payload || msg;
    const runId = p.runId || p.messageId || 'lume-stream';
    _syncEventSessionKey(p);

    if (p.stream === 'assistant') {
      if (p.data?.delta) {
        if (!_lumeStreamState[runId]) {
          _lumeStreamState[runId] = { fullText: '', lastTextLen: 0 };
        }
        const state = _lumeStreamState[runId];
        const incomingText = p.data.text || '';
        if (incomingText.length < state.lastTextLen) state.fullText += '\n';
        state.fullText += p.data.delta;
        state.lastTextLen = incomingText.length;

        let displayText = state.fullText;
        displayText = displayText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        displayText = displayText.replace(/<think>[\s\S]*$/g, '').trim();
        if (displayText && typeof updateStreamingMessage === 'function') {
          updateStreamingMessage(displayText, runId);
        }
      } else if (p.data?.text) {
        let text = p.data.text;
        text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        text = text.replace(/<think>[\s\S]*$/g, '').trim();
        if (text && typeof updateStreamingMessage === 'function') {
          updateStreamingMessage(text, runId);
        }
      }

      const done = p.data?.done === true || p.done === true || p.state === 'final' || p.state === 'completed' || p.status === 'completed';
      if (done) {
        let text = _lumeStreamState[runId]?.fullText || p.data?.text || p.text || '';
        delete _lumeStreamState[runId];
        text = String(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        text = text.replace(/<think>[\s\S]*$/g, '').trim();
        _finishLumeGeneration(runId, text, p.modelInfo || p.data?.modelInfo);
      }
    }
    return;
  }
  if (msg.event !== 'chat') return;
  const p = msg.payload || {};
  const state = p.state || 'final';
  if (state === 'start') {
    if (typeof addTyping === 'function') addTyping();
    return;
  }
  const runId = p.runId || p.messageId || 'lume-stream';
  console.log('[Lume] chat event state:', state, 'runId:', runId);
  if (state === 'delta' || state === 'block') {
    let text = p.message || p.text || p.delta || '';
    // Strip <think>...</think> tags from streaming content
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    // Also handle incomplete <think> tags
    text = text.replace(/<think>[\s\S]*$/g, '').trim();
    console.log('[Lume] chat delta text:', text.substring(0, 50));
    if (text && typeof updateStreamingMessage === 'function') {
      updateStreamingMessage(text, runId);
    }
    return;
  }
  if (state === 'final') {
    _syncEventSessionKey(p);
    let text = '';
    if (_lumeStreamState[runId]?.fullText) {
      text = _lumeStreamState[runId].fullText;
      delete _lumeStreamState[runId];
    } else {
      text = p.message || p.text || '';
    }
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    text = text.replace(/<think>[\s\S]*$/g, '').trim();
    _finishLumeGeneration(runId, text, p.modelInfo);
    return;
  }
}

async function sendMessageViaLume(text) {
  if (!window.USE_LUME || !LumeRpc.isConnected()) return false;
  try {
    if (typeof addTyping === 'function') addTyping();
    // 将前端 agent key 转换为 OpenClaw 认识的 agentId
    const agentKey = window.currentAgentId || 'lingxi';
    const ocAgentId = (typeof AGENT_INFO !== 'undefined' && AGENT_INFO[agentKey]?.agentId) || agentKey;
    if (typeof syncCurrentSessionKey === 'function') syncCurrentSessionKey(currentSessionKey);
    currentRunId = 'lume-stream-' + Date.now();
    isGenerating = true;
    if (typeof updateSendButton === 'function') updateSendButton();
    const sendResult = await LumeRpc.sendChat(text, currentSessionKey, ocAgentId);
    if (sendResult?.sessionKey && typeof syncCurrentSessionKey === 'function') {
      syncCurrentSessionKey(sendResult.sessionKey);
    } else if (typeof syncCurrentSessionKey === 'function') {
      syncCurrentSessionKey(currentSessionKey);
    }
    if (sendResult?.done || sendResult?.state === 'final' || sendResult?.state === 'completed') {
      const resultText = sendResult.text || sendResult.message || '';
      if (resultText) _finishLumeGeneration(currentRunId || 'lume-stream', resultText, sendResult.modelInfo);
      else _finishLumeGeneration(currentRunId || 'lume-stream', '', sendResult.modelInfo);
    }

    if (window.sessions && currentSessionKey) {
      const currentSession = window.sessions.find((s) => s.key === currentSessionKey);
      if (
        currentSession &&
        (!currentSession.label ||
          currentSession.label === '灵犀' ||
          currentSession.label.includes('agent:'))
      ) {
        const newLabel = text.substring(0, 50);
        LumeRpc.sendRequest('sessions.update', {
          key: currentSessionKey,
          sessionKey: currentSessionKey,
          label: newLabel,
        }).catch(() => {});
        currentSession.label = newLabel;
      }
    }
    return true;
  } catch (e) {
    console.error('[Lume] 发送失败:', e);
    if (typeof removeTyping === 'function') removeTyping();
    if (typeof isGenerating !== 'undefined') isGenerating = false;
    if (typeof currentRunId !== 'undefined') currentRunId = null;
    if (typeof updateSendButton === 'function') updateSendButton();
    return false;
  }
}
