/**
 * Lume WebSocket RPC — Gateway 优先，Lume 插件可选回退
 * 云端经 WSS 代理（默认 Gateway 适配）；本机可直连 Gateway WS
 */
const LumeRpc = (function () {
  let ws = null;
  let connected = false;
  let connecting = false;
  let userId = null;
  let secret = null;
  let authHandledByProxy = false;
  /** @type {'lume' | 'gateway'} */
  let activeTransport = 'lume';
  const pending = new Map();
  const eventListeners = [];
  let reqSeq = 1;

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

  function getDesktopWsUrl() {
    return getDesktopOverride('lume_desktop_ws_url');
  }

  function getDesktopSecret() {
    return getDesktopOverride('lume_desktop_lume_secret');
  }

  function getDesktopUserId() {
    return getDesktopOverride('lume_desktop_user_id');
  }

  function getDesktopTransport() {
    return getDesktopOverride('lume_desktop_transport');
  }

  function getDesktopGatewayWsUrl() {
    return getDesktopOverride('lume_desktop_gateway_ws_url');
  }

  function getDesktopOpenclawToken() {
    return getDesktopOverride('lume_desktop_openclaw_token');
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

  function markConnected(payload, transport) {
    connected = true;
    connecting = false;
    if (transport) activeTransport = transport;
    if (payload?.userId) userId = payload.userId;
  }

  function normalizeGatewayChatEvent(msg) {
    if (msg.type !== 'event' || msg.event !== 'chat') return msg;
    const payload = msg.payload || {};
    if (!payload.state && payload.text) {
      return {
        ...msg,
        payload: { ...payload, message: payload.message || payload.text, state: 'delta' },
      };
    }
    return msg;
  }

  function openGatewayWebSocket(wsUrl, openclawToken) {
    return new Promise((resolve) => {
      ws = new WebSocket(wsUrl);
      const connectId = 'connect';
      let settled = false;
      let gwConnected = false;

      const fail = () => {
        if (settled) return;
        settled = true;
        connecting = false;
        connected = false;
        resolve(false);
      };

      const succeed = () => {
        if (settled) return;
        settled = true;
        markConnected({ userId }, 'gateway');
        resolve(true);
      };

      ws.onopen = () => {
        /* wait for connect.challenge */
      };

      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }

        if (!gwConnected && msg.type === 'event' && msg.event === 'connect.challenge') {
          const nonce = msg.payload?.nonce;
          if (!nonce) {
            fail();
            return;
          }
          ws.send(
            JSON.stringify({
              type: 'req',
              id: connectId,
              method: 'connect',
              params: {
                minProtocol: 4,
                maxProtocol: 4,
                client: {
                  id: 'openclaw-control-ui',
                  version: '1.0.0',
                  platform: 'web',
                  mode: 'webchat',
                },
                role: 'operator',
                scopes: ['operator.admin', 'operator.read', 'operator.write'],
                auth: { token: openclawToken },
                locale: 'zh-CN',
              },
            }),
          );
          return;
        }

        if (!gwConnected && msg.id === connectId && msg.type === 'res') {
          if (!msg.ok) {
            fail();
            return;
          }
          gwConnected = true;
          succeed();
          return;
        }

        if (msg.type === 'event') {
          emitEvent(normalizeGatewayChatEvent(msg));
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
      };

      setTimeout(fail, 12000);
    });
  }

  async function connect() {
    if (connected) return true;
    if (connecting) {
      await new Promise((r) => setTimeout(r, 500));
      return connected;
    }
    const token = getToken();
    if (!token) return false;

    const desktopMode = getDesktopConnectionMode();
    const desktopWs = getDesktopWsUrl();
    const desktopSecret = getDesktopSecret();
    const desktopUserId = getDesktopUserId();
    const desktopTransport = getDesktopTransport();
    const gatewayWs = getDesktopGatewayWsUrl();
    const openclawToken = getDesktopOpenclawToken();

    if (desktopMode === 'local') {
      userId = desktopUserId || userId;

      // 本机优先 Gateway 直连
      if (gatewayWs && openclawToken) {
        connecting = true;
        authHandledByProxy = false;
        const gwOk = await openGatewayWebSocket(gatewayWs, openclawToken);
        if (gwOk) return true;
        connecting = false;
        connected = false;
      }

      if (desktopWs) {
        secret = desktopSecret || null;
        authHandledByProxy = false;
        connecting = true;
        const lumeOk = await openLumeWebSocket(desktopWs);
        if (lumeOk) return true;
        connecting = false;
        connected = false;
      }

      try {
        localStorage.setItem('lume_desktop_connection_mode', 'cloud');
        localStorage.removeItem('lume_desktop_ws_url');
        localStorage.removeItem('lume_desktop_transport');
      } catch (_) {}
    }

    connecting = true;
    try {
      const res = await fetch(getApiBase() + '/api/lume/connect-info', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const json = await res.json();
      const info = json.data || {};
      console.warn("[LumeRpc] connect-info:", JSON.stringify(info).substring(0,300)); if (!info.wsUrl && info.mode !== 'lume') {
        connecting = false;
        return false;
      }
      userId = info.userId || desktopUserId || userId;
      secret = info.secret || desktopSecret || null;
      authHandledByProxy = info.authHandled === true;
      activeTransport = info.transport === 'lume' ? 'lume' : 'lume';
      const wsUrl = info.wsUrl;
      if (!wsUrl) {
        connecting = false;
        return false;
      }
      return await openLumeWebSocket(wsUrl);
    } catch (e) {
      connecting = false;
      return false;
    }
  }

  function openLumeWebSocket(wsUrl) {
    return new Promise((resolve) => {
      ws = new WebSocket(wsUrl);
      const authId = 'auth-' + Date.now();
      let settled = false;

      const succeed = (payload) => {
        if (settled) return;
        settled = true;
        markConnected(payload || { userId }, 'lume');
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
      pending.set(id, { timer, resolve, reject });

      if (activeTransport === 'gateway') {
        ws.send(JSON.stringify({ type: 'req', id, method, params: params || {} }));
      } else {
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      }
    });
  }

  async function gatewayCall(method, params, timeoutMs) {
    if (!connected) {
      const ok = await connect();
      if (!ok) throw new Error('Lume 未连接');
    }
    if (activeTransport === 'gateway') {
      const msg = await sendRequest(method, params || {}, timeoutMs);
      return msg.payload;
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
    const params = {
      message,
      sessionKey,
      agentId: agentId || 'main',
      idempotencyKey: 'lume-' + Date.now(),
    };
    if (activeTransport === 'gateway') {
      await sendRequest('chat.send', params, 20000);
      return;
    }
    await sendRequest('chat.send', params, 20000);
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
    activeTransport = 'lume';
  }

  return {
    connect,
    disconnect,
    isConnected: () => connected,
    getTransport: () => activeTransport,
    gatewayCall,
    pluginCall,
    sendChat,
    sendRequest,
    onEvent,
  };
})();

/** Agent 团队管理 — 经 Gateway RPC */
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
