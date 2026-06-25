/**
 * Lume WebSocket RPC — 本机优先 / 云端代理 / 记住连接偏好
 */
const LumeRpc = (function () {
  let ws = null;
  let connected = false;
  let connecting = false;
  let userId = null;
  let secret = null;
  let authHandledByProxy = false;
  let connectionTarget = null;
  let routingCache = null;
  const pending = new Map();
  const eventListeners = [];
  let reqSeq = 1;

  const PREF_KEY = 'lume_connection_preference';

  function getToken() {
    return localStorage.getItem('lingxi_token');
  }

  function getDesktopOverride(key) {
    const v = localStorage.getItem(key);
    return v && String(v).trim() ? String(v).trim() : null;
  }

  function getDesktopConnectionMode() {
    return getDesktopOverride('lume_desktop_connection_mode');
  }

  function getWebPreference() {
    const v = localStorage.getItem(PREF_KEY);
    return v && ['auto', 'local', 'cloud'].includes(v) ? v : null;
  }

  function getConnectionPreference() {
    return getDesktopConnectionMode() || getWebPreference();
  }

  function getDesktopWsUrl() {
    return getDesktopOverride('lume_desktop_ws_url');
  }

  function getDesktopSecret() {
    return getDesktopOverride('lume_desktop_lume_secret');
  }

  function getDesktopUserId() {
    return getDesktopOverride('lume_desktop_user_id');
  }

  function getApiBase() {
    try {
      const u = JSON.parse(localStorage.getItem('lingxi_user') || '{}');
      if (u.serverUrl) return String(u.serverUrl).replace(/\/$/, '');
    } catch {
      /* ignore */
    }
    return window.location.origin;
  }

  function emitEvent(msg) {
    for (const fn of eventListeners) {
      try {
        fn(msg);
      } catch (_) {}
    }
  }

  function markConnected(payload, target) {
    connected = true;
    connecting = false;
    connectionTarget = target || connectionTarget;
    if (payload?.userId) userId = payload.userId;
  }

  async function fetchConnectInfo() {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch(getApiBase() + '/api/lume/connect-info', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const json = await res.json();
      routingCache = json.data || null;
      return routingCache;
    } catch (e) {
      console.warn('[LumeRpc] connect-info failed', e);
      return null;
    }
  }

  async function tryConnectLocal(routing) {
    const desktopWs = getDesktopWsUrl();
    const localWs =
      desktopWs || routing?.localWsUrl || 'ws://127.0.0.1:18790';
    userId = getDesktopUserId() || routing?.userId || userId;
    secret = getDesktopSecret() || routing?.localSecret || secret;
    authHandledByProxy = false;
    connecting = true;
    const ok = await openWebSocket(localWs);
    if (ok) {
      connectionTarget = 'local';
      return true;
    }
    connecting = false;
    connected = false;
    return false;
  }

  async function tryConnectCloud(routing) {
    const cloudUrl = routing?.cloudWsUrl || routing?.wsUrl;
    if (routing?.mode !== 'lume' || !cloudUrl) return false;

    userId = routing.userId || getDesktopUserId() || userId;
    secret = routing.secret || getDesktopSecret() || null;
    authHandledByProxy = routing.authHandled === true;
    connecting = true;
    const ok = await openWebSocket(cloudUrl);
    if (ok) {
      connectionTarget = 'cloud';
      return true;
    }
    connecting = false;
    connected = false;
    return false;
  }

  async function connect() {
    if (connected) return true;
    if (connecting) {
      await new Promise((r) => setTimeout(r, 500));
      return connected;
    }
    const token = getToken();
    if (!token) return false;

    const routing = routingCache || (await fetchConnectInfo());
    if (!routing) {
      connecting = false;
      return false;
    }

    let pref = getConnectionPreference();
    if (!pref) {
      pref = routing.defaultConnectionMode || 'auto';
      try {
        localStorage.setItem(PREF_KEY, pref);
      } catch (_) {}
    }

    if (pref === 'local') {
      if (await tryConnectLocal(routing)) return true;
      return false;
    }

    if (pref === 'cloud') {
      return await tryConnectCloud(routing);
    }

    // auto：本机可用则本机，否则云端（已绑定 ECS 的老用户）
    if (await tryConnectLocal(routing)) return true;
    if (routing.cloudServerRunning || routing.mode === 'lume') {
      return await tryConnectCloud(routing);
    }
    return false;
  }

  async function reconnect() {
    disconnect();
    routingCache = null;
    return connect();
  }

  function openWebSocket(wsUrl) {
    return new Promise((resolve) => {
      ws = new WebSocket(wsUrl);
      const authId = 'auth-' + Date.now();
      let settled = false;

      const succeed = (payload) => {
        if (settled) return;
        settled = true;
        markConnected(payload || { userId });
        if (
          typeof LumeConnection !== 'undefined' &&
          LumeConnection.afterConnect
        ) {
          LumeConnection.afterConnect(connectionTarget);
        }
        resolve(true);
      };

      const fail = () => {
        if (settled) return;
        settled = true;
        connecting = false;
        connected = false;
        resolve(false);
      };

      ws.onopen = () => {
        if (!authHandledByProxy && secret) {
          ws.send(
            JSON.stringify({
              id: authId,
              method: 'auth',
              params: { token: secret, userId },
            }),
          );
        }
      };

      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }

        if (msg.type === 'event') {
          emitEvent(msg);
          return;
        }

        if (
          authHandledByProxy &&
          !connected &&
          msg.type === 'res' &&
          msg.ok &&
          msg.payload?.userId
        ) {
          succeed(msg.payload);
          return;
        }

        if (msg.id === authId) {
          if (msg.ok) succeed(msg.payload);
          else fail();
          return;
        }

        if (msg.type === 'res' && msg.id && pending.has(msg.id)) {
          const entry = pending.get(msg.id);
          pending.delete(msg.id);
          clearTimeout(entry.timer);
          if (msg.ok) entry.resolve(msg);
          else entry.reject(new Error(msg.error?.message || msg.error || 'RPC failed'));
        }
      };

      ws.onerror = fail;
      ws.onclose = () => {
        connected = false;
        connecting = false;
        connectionTarget = null;
      };

      setTimeout(fail, 12000);
    });
  }

  function sendRequest(method, params, timeoutMs) {
    const timeout = timeoutMs || 15000;
    if (!connected) throw new Error('Lume 未连接');
    const id = 'rpc-' + reqSeq++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('RPC timeout'));
      }, timeout);
      pending.set(id, {
        timer,
        resolve,
        reject,
      });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  async function gatewayCall(method, params, timeoutMs) {
    if (!connected) {
      const ok = await connect();
      if (!ok) throw new Error('Lume 未连接');
    }
    const msg = await sendRequest(
      'gateway.call',
      { method, params: params || {} },
      timeoutMs,
    );
    return msg.payload;
  }

  async function pluginCall(method, params, timeoutMs) {
    if (!connected) {
      const ok = await connect();
      if (!ok) throw new Error('Lume 未连接');
    }
    const msg = await sendRequest(method, params || {}, timeoutMs);
    return msg.payload;
  }

  async function sendChat(message, sessionKey, agentId) {
    if (!connected) {
      const ok = await connect();
      if (!ok) throw new Error('Lume 未连接');
    }
    await sendRequest(
      'chat.send',
      {
        message,
        sessionKey,
        agentId: agentId || 'lingxi',
      },
      20000,
    );
  }

  function onEvent(fn) {
    eventListeners.push(fn);
  }

  function disconnect() {
    if (ws) {
      try {
        ws.close();
      } catch (_) {}
    }
    ws = null;
    connected = false;
    connecting = false;
    authHandledByProxy = false;
    connectionTarget = null;
  }

  function getConnectionTarget() {
    return connectionTarget;
  }

  return {
    connect,
    reconnect,
    disconnect,
    isConnected: () => connected,
    getConnectionTarget,
    gatewayCall,
    pluginCall,
    sendChat,
    sendRequest,
    onEvent,
  };
})();

/** Agent 团队管理 — 经 Lume gateway.call */
const LumeAgents = (function () {
  function mapAgentRow(a) {
    return {
      id: a.id,
      name: a.identity?.name || a.name || a.id,
      emoji: a.identity?.emoji || '🤖',
      workspace: a.workspace,
      model: a.model,
      isDefault: a.default === true,
    };
  }

  async function fetchList() {
    const payload = await LumeRpc.gatewayCall('config.get', {}, 12000);
    const list = payload?.config?.agents?.list || [];
    if (!Array.isArray(list) || list.length === 0) return [];
    const ids = new Set();
    const rows = [];
    list.forEach((a) => {
      if (!a?.id || ids.has(a.id)) return;
      ids.add(a.id);
      rows.push(mapAgentRow(a));
    });
    const main = list.find((a) => a.id === 'main' || a.default);
    const allowed = main?.subagents?.allowAgents || [];
    allowed.forEach((id) => {
      if (!id || ids.has(id)) return;
      ids.add(id);
      const existing = list.find((a) => a.id === id);
      rows.push(existing ? mapAgentRow(existing) : mapAgentRow({ id, name: id }));
    });
    return rows;
  }

  async function addAgent(agentId, name, emoji) {
    const payload = await LumeRpc.gatewayCall('config.get', {}, 12000);
    const baseHash = payload?.hash;
    const config = payload?.config || {};
    const agentsList = config.agents?.list || [];
    const defaultWorkspace = config.agents?.defaults?.workspace || '~/.openclaw/workspace';

    if (agentsList.some((a) => a.id === agentId)) {
      throw new Error('Agent "' + agentId + '" 已存在');
    }

    const agentWorkspace = defaultWorkspace + '-' + agentId;
    const newAgent = {
      id: agentId,
      workspace: agentWorkspace,
      identity: { name: name || agentId, emoji: emoji || '🤖' },
    };

    const newList = agentsList.concat([newAgent]);
    const mainAgent = newList.find((a) => a.id === 'main' || a.default);
    if (mainAgent) {
      if (!mainAgent.subagents) mainAgent.subagents = {};
      if (!mainAgent.subagents.allowAgents) mainAgent.subagents.allowAgents = [];
      if (!mainAgent.subagents.allowAgents.includes(agentId)) {
        mainAgent.subagents.allowAgents.push(agentId);
      }
    }

    await LumeRpc.gatewayCall(
      'config.patch',
      {
        raw: JSON.stringify({ agents: { list: newList } }),
        baseHash,
        note: '灵犀云添加 Agent: ' + (name || agentId),
      },
      20000,
    );
    return newAgent;
  }

  async function removeAgent(agentId) {
    if (agentId === 'main') throw new Error('不能删除主 Agent');

    const payload = await LumeRpc.gatewayCall('config.get', {}, 12000);
    const baseHash = payload?.hash;
    const agentsList = payload?.config?.agents?.list || [];
    const updatedList = agentsList.filter((a) => a.id !== agentId);
    if (updatedList.length === agentsList.length) {
      throw new Error('Agent "' + agentId + '" 不存在');
    }

    const mainAgent = updatedList.find((a) => a.id === 'main' || a.default);
    if (mainAgent?.subagents?.allowAgents) {
      mainAgent.subagents.allowAgents = mainAgent.subagents.allowAgents.filter((id) => id !== agentId);
      const mainIdx = updatedList.findIndex((a) => a.id === 'main' || a.default);
      if (mainIdx >= 0) updatedList[mainIdx] = mainAgent;
    }

    await LumeRpc.gatewayCall(
      'config.patch',
      {
        raw: JSON.stringify({ agents: { list: updatedList } }),
        baseHash,
        note: '灵犀云移除 Agent: ' + agentId,
      },
      20000,
    );

    try {
      await LumeRpc.gatewayCall('agents.delete', { agentId }, 8000);
    } catch (_) {}
  }

  return { fetchList, addAgent, removeAgent };
})();
