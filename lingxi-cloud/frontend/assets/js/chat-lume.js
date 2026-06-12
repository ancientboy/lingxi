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
  const statusEl = document.getElementById('connectionStatus');
  if (statusEl) {
    statusDot = statusEl.querySelector('.status-dot');
    if (statusDot) statusDot.className = 'status-dot connected';
  }

  LumeRpc.onEvent((msg) => handleLumeEvent(msg));

  void loadLumeSessions();

  LumeRpc.sendRequest('health.subscribe', {}).catch(() => {});
}

async function loadLumeSessions() {
  try {
    const res = await LumeRpc.sendRequest('sessions.list', {
      limit: 50,
      includeLastMessage: true,
      includeDerivedTitles: true,
    });
    if (res.ok && res.payload?.sessions) {
      window.sessions = res.payload.sessions;
      if (typeof renderSessionList === 'function') renderSessionList();
      if (typeof loadSessions === 'function') loadSessions();
    }
  } catch (e) {
    console.warn('[Lume] 加载会话列表失败:', e);
  }
}

function handleLumeEvent(msg) {
  if (msg.event === 'health.status') {
    console.log('[Lume] health.status', msg.payload);
    return;
  }
  if (msg.event !== 'chat') return;
  const p = msg.payload || {};
  const state = p.state || 'final';
  if (state === 'start') {
    if (typeof addTyping === 'function') addTyping();
    return;
  }
  if (state === 'delta' && p.delta) {
    if (typeof appendStreamingText === 'function') appendStreamingText(p.delta);
    return;
  }
  if (state === 'final' || p.message) {
    if (typeof removeTyping === 'function') removeTyping();
    const text = p.message || p.text || '';
    if (text && typeof addMessage === 'function') {
      addMessage('assistant', text, '灵犀');
    }
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
