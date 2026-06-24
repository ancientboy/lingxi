/**
 * Web 聊天 — Lume 模式（付费用户优先，不连 Gateway）
 */
window.USE_LUME = false;

async function tryConnectLume() {
  if (typeof LumeRpc === 'undefined') return false;
  try {
    const ok = await LumeRpc.connect();
    if (ok) {
      window.USE_LUME = true;
      console.log('✅ [Lume] Web 聊天模式已启用');
      return true;
    }
  } catch (e) {
    console.warn('[Lume] 连接失败，降级 Gateway:', e);
  }
  return false;
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

  LumeRpc.onEvent((msg) => handleLumeEvent(msg));

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
    });
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
    loadLumeSessions();
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
    // 不在本地列表中 → fallback 全量拉取
    console.log('[Lume] session 不在本地列表，fallback 全量刷新');
    loadLumeSessions();
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
  if (msg.event !== 'chat') return;
  const p = msg.payload || {};
  const state = p.state || 'final';
  if (state === 'start') {
    if (typeof addTyping === 'function') addTyping();
    return;
  }
  const runId = p.runId || p.messageId || 'lume-stream';
  if (state === 'delta' || state === 'block') {
    const text = p.message || p.text || p.delta || '';
    if (text && typeof updateStreamingMessage === 'function') {
      updateStreamingMessage(text, runId);
    }
    return;
  }
  if (state === 'final') {
    if (typeof removeTyping === 'function') removeTyping();
    const text = p.message || p.text || '';
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
    await LumeRpc.sendChat(text, currentSessionKey, window.currentAgentId || 'lingxi');

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
