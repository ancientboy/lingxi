/**
 * Web 聊天 — Lume 模式（付费用户优先，不连 Gateway）
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

  void loadLumeSessions();

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
      if (typeof resolveInitialSession === 'function') {
        await resolveInitialSession();
      } else if (typeof loadChatHistory === 'function') {
        await loadChatHistory();
      }
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

function handleLumeEvent(msg) {
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
    const runId = p.runId || 'lume-stream';

    if (p.stream === 'assistant') {
      // Gateway 发送 data.text（全量累积）+ data.delta（本次增量）
      // 但工具调用后 data.text 会重置，所以前端自己用 delta 累积
      if (p.data?.delta) {
        // 增量模式：用 delta 拼接
        if (!_lumeStreamState[runId]) {
          _lumeStreamState[runId] = { fullText: '', lastTextLen: 0 };
        }
        const state = _lumeStreamState[runId];
        const incomingText = p.data.text || '';

        // 检测 text 是否重置（工具调用后会从头开始）
        if (incomingText.length < state.lastTextLen) {
          // text 重置了，把之前的累积保存
          state.fullText += '\n';
        }

        state.fullText += p.data.delta;
        state.lastTextLen = incomingText.length;

        let displayText = state.fullText;
        // Strip <think>...</think> tags
        displayText = displayText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        displayText = displayText.replace(/<think>[\s\S]*$/g, '').trim();

        if (displayText && typeof updateStreamingMessage === 'function') {
          updateStreamingMessage(displayText, runId);
        }
      } else if (p.data?.text) {
        // 没有 delta，直接用 text（兼容旧格式）
        let text = p.data.text;
        text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        text = text.replace(/<think>[\s\S]*$/g, '').trim();
        if (text && typeof updateStreamingMessage === 'function') {
          updateStreamingMessage(text, runId);
        }
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
    if (typeof removeTyping === 'function') removeTyping();
    // 优先用流式累积的文本（包含工具调用前后的完整内容）
    let text = '';
    if (_lumeStreamState[runId]?.fullText) {
      text = _lumeStreamState[runId].fullText;
      delete _lumeStreamState[runId];
    } else {
      text = p.message || p.text || '';
    }
    // Strip <think>...</think> tags from final content
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    // Also handle incomplete <think> tags
    text = text.replace(/<think>[\s\S]*$/g, '').trim();
    if (text && typeof finalizeStreamingMessage === 'function') {
      finalizeStreamingMessage(text, runId, p.modelInfo);
    } else if (text && typeof addMessage === 'function') {
      addMessage('assistant', text, '灵犀');
    }
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
    await LumeRpc.sendChat(text, currentSessionKey, ocAgentId);

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
    return false;
  }
}
