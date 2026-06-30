/**
 * Lume WebSocket RPC — Gateway 优先，Lume 插件可选回退
 * 云端经 WSS 代理（默认 Gateway 适配）；本机可直连 Gateway WS
 *
 * === 连接管理增强 ===
 * - 状态机: disconnected → connecting → connected → reconnecting → disconnected
 * - 心跳 watchdog: 周期 ping，超时触发重连
 * - 指数退避重连: base 1s, factor 2, max 30s, jitter
 * - 请求队列: 离线时排队，恢复后 flush
 */
const LumeRpc = (function () {
  var ws = null;
  var connected = false;
  var connecting = false;
  var userId = null;
  var secret = null;
  var authHandledByProxy = false;
  /** @type {'lume' | 'gateway'} */
  var activeTransport = 'lume';
  var pending = new Map();
  var eventListeners = [];
  var reqSeq = 1;

  // ── 连接状态机 ──
  var connState = 'disconnected'; // disconnected | connecting | connected | reconnecting

  // ── 心跳 watchdog ──
  var heartbeatInterval = 25000;  // 25s 发送 ping
  var heartbeatTimeout = 10000;   // 10s 内需收到 pong 或任意消息
  var heartbeatTimer = null;
  var heartbeatWatchdog = null;

  // ── 指数退避重连 ──
  var reconnectEnabled = false;
  var reconnectBaseDelay = 1000;   // 1s
  var reconnectMaxDelay = 30000;   // 30s
  var reconnectFactor = 2;
  var reconnectJitter = 500;       // ±500ms
  var reconnectAttempt = 0;
  var reconnectTimer = null;
  var lastWsUrl = null;
  var lastGatewayWsUrl = null;
  var lastOpenclawToken = null;

  // ── 离线请求队列 ──
  var offlineQueue = [];
  var offlineQueueMax = 100;

  function getConnectionState() {
    return connState;
  }

  function setConnState(newState) {
    var prev = connState;
    connState = newState;
    if (prev !== newState) {
      emitEvent({ type: 'event', event: 'conn.state', payload: { state: newState, prev: prev } });
    }
  }

  function getToken() {
    return localStorage.getItem('lingxi_token');
  }

  function getDesktopOverride(key) {
    var v = localStorage.getItem(key);
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
      var u = JSON.parse(localStorage.getItem('lingxi_user') || '{}');
      if (u.serverUrl) return String(u.serverUrl).replace(/\/$/, '');
    } catch (_) {}
    return window.location.origin;
  }

  function emitEvent(msg) {
    for (var i = 0; i < eventListeners.length; i++) {
      try {
        eventListeners[i](msg);
      } catch (_) {}
    }
  }

  function markConnected(payload, transport) {
    connected = true;
    connecting = false;
    reconnectAttempt = 0;
    if (transport) activeTransport = transport;
    if (payload && payload.userId) userId = payload.userId;
    setConnState('connected');
    startHeartbeat();
    flushOfflineQueue();
  }

  function normalizeGatewayChatEvent(msg) {
    if (msg.type !== 'event' || msg.event !== 'chat') return msg;
    var payload = msg.payload || {};
    if (!payload.state && payload.text) {
      return Object.assign({}, msg, {
        payload: Object.assign({}, payload, { message: payload.message || payload.text, state: 'delta' }),
      });
    }
    return msg;
  }

  // ── 心跳 watchdog ──
  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(function () {
      if (ws && ws.readyState === WebSocket.OPEN && connected) {
        try {
          if (activeTransport === 'gateway') {
            ws.send(JSON.stringify({ type: 'ping' }));
          } else {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        } catch (_) {}
      }
    }, heartbeatInterval);

    // watchdog: 如果 heartbeatTimeout 内没有收到任何消息，认为连接已死
    resetHeartbeatWatchdog();
  }

  function resetHeartbeatWatchdog() {
    if (heartbeatWatchdog) {
      clearTimeout(heartbeatWatchdog);
    }
    heartbeatWatchdog = setTimeout(function () {
      if (connected) {
        console.warn('[LumeRpc] heartbeat watchdog timeout, forcing reconnect');
        forceReconnect();
      }
    }, heartbeatInterval + heartbeatTimeout);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (heartbeatWatchdog) {
      clearTimeout(heartbeatWatchdog);
      heartbeatWatchdog = null;
    }
  }

  // ── 指数退避重连 ──
  function computeReconnectDelay() {
    var delay = reconnectBaseDelay * Math.pow(reconnectFactor, reconnectAttempt);
    if (delay > reconnectMaxDelay) delay = reconnectMaxDelay;
    // jitter ±reconnectJitter
    delay += (Math.random() * 2 - 1) * reconnectJitter;
    return Math.max(500, Math.round(delay));
  }

  function scheduleReconnect() {
    if (!reconnectEnabled) return;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    var delay = computeReconnectDelay();
    reconnectAttempt++;
    console.warn('[LumeRpc] scheduleReconnect: attempt=' + reconnectAttempt + ' delay=' + delay + 'ms');
    setConnState('reconnecting');
    reconnectTimer = setTimeout(function () {
      asyncReconnect();
    }, delay);
  }

  async function asyncReconnect() {
    if (connected || connecting) return;

    // 优先尝试已知的 Gateway WS
    if (lastGatewayWsUrl && lastOpenclawToken) {
      connecting = true;
      var gwOk = await openGatewayWebSocket(lastGatewayWsUrl, lastOpenclawToken);
      if (gwOk) return;
      connecting = false;
      connected = false;
    }

    // 再尝试 Lume WS
    if (lastWsUrl) {
      connecting = true;
      var lumeOk = await openLumeWebSocket(lastWsUrl);
      if (lumeOk) return;
      connecting = false;
      connected = false;
    }

    // 都失败，继续退避
    scheduleReconnect();
  }

  function forceReconnect() {
    stopHeartbeat();
    if (ws) {
      try { ws.close(); } catch (_) {}
      ws = null;
    }
    connected = false;
    connecting = false;
    // 不重置 reconnectAttempt，继续退避
    scheduleReconnect();
  }

  // ── 离线请求队列 ──
  function enqueueOffline(method, params, timeoutMs) {
    if (offlineQueue.length >= offlineQueueMax) {
      // 丢弃最旧请求
      offlineQueue.shift();
    }
    return new Promise(function (resolve, reject) {
      offlineQueue.push({ method: method, params: params, timeoutMs: timeoutMs, resolve: resolve, reject: reject });
    });
  }

  function flushOfflineQueue() {
    if (!connected || offlineQueue.length === 0) return;
    var queue = offlineQueue.slice();
    offlineQueue = [];
    for (var i = 0; i < queue.length; i++) {
      (function (item) {
        sendRequestPromise(item.method, item.params, item.timeoutMs)
          .then(item.resolve)
          .catch(item.reject);
      })(queue[i]);
    }
  }

  // ── ws 消息统一处理 ──
  function handleWsMessage(msg) {
    // 任何消息都重置 watchdog
    if (connected) resetHeartbeatWatchdog();

    // pong
    if (msg.type === 'pong' || msg.type === 'event' && msg.event === 'pong') {
      return;
    }

    if (msg.type === 'event') {
      emitEvent(normalizeGatewayChatEvent(msg));
      return;
    }

    if (msg.type === 'res' && msg.id && pending.has(msg.id)) {
      var entry = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.ok) entry.resolve(msg);
      else entry.reject(new Error((msg.error && (msg.error.message || msg.error)) || 'RPC failed'));
    }
  }

  // ── ws 统一关闭处理 ──
  function handleWsClose() {
    connected = false;
    connecting = false;
    stopHeartbeat();
    setConnState('disconnected');
    // reject 所有 pending
    pending.forEach(function (entry, id) {
      clearTimeout(entry.timer);
      entry.reject(new Error('connection closed'));
    });
    pending.clear();
    // 触发重连
    scheduleReconnect();
  }

  function openGatewayWebSocket(wsUrl, openclawToken) {
    return new Promise(function (resolve) {
      ws = new WebSocket(wsUrl);
      var connectId = 'connect';
      var settled = false;
      var gwConnected = false;

      lastGatewayWsUrl = wsUrl;
      lastOpenclawToken = openclawToken;

      function fail() {
        if (settled) return;
        settled = true;
        connecting = false;
        connected = false;
        resolve(false);
      }

      function succeed() {
        if (settled) return;
        settled = true;
        markConnected({ userId: userId }, 'gateway');
        resolve(true);
      }

      ws.onopen = function () {
        /* wait for connect.challenge */
      };

      ws.onmessage = function (ev) {
        var msg;
        try {
          msg = JSON.parse(ev.data);
        } catch (_) {
          return;
        }

        if (!gwConnected && msg.type === 'event' && msg.event === 'connect.challenge') {
          var nonce = msg.payload && msg.payload.nonce;
          if (!nonce) {
            fail();
            return;
          }
          ws.send(JSON.stringify({
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
          }));
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

        handleWsMessage(msg);
      };

      ws.onerror = function () {
        // error 不直接 fail, 等 onclose
      };

      ws.onclose = function () {
        if (!settled) {
          fail();
        } else {
          handleWsClose();
        }
      };

      setTimeout(fail, 12000);
    });
  }

  async function connect() {
    if (connected) return true;
    if (connecting) {
      // 等待连接完成
      var waited = 0;
      while (connecting && waited < 12000) {
        await new Promise(function (r) { setTimeout(r, 500); });
        waited += 500;
      }
      return connected;
    }

    var token = getToken();
    if (!token) return false;

    var desktopMode = getDesktopConnectionMode();
    var desktopWs = getDesktopWsUrl();
    var desktopSecret = getDesktopSecret();
    var desktopUserId = getDesktopUserId();
    var desktopTransport = getDesktopTransport();
    var gatewayWs = getDesktopGatewayWsUrl();
    var openclawToken = getDesktopOpenclawToken();

    if (desktopMode === 'local') {
      userId = desktopUserId || userId;

      // 本机优先 Gateway 直连
      if (gatewayWs && openclawToken) {
        connecting = true;
        setConnState('connecting');
        authHandledByProxy = false;
        var gwOk = await openGatewayWebSocket(gatewayWs, openclawToken);
        if (gwOk) {
          reconnectEnabled = true;
          return true;
        }
        connecting = false;
        connected = false;
      }

      if (desktopWs) {
        secret = desktopSecret || null;
        authHandledByProxy = false;
        connecting = true;
        setConnState('connecting');
        var lumeOk = await openLumeWebSocket(desktopWs);
        if (lumeOk) {
          reconnectEnabled = true;
          return true;
        }
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
    setConnState('connecting');
    try {
      var res = await fetch(getApiBase() + '/api/lume/connect-info', {
        headers: { Authorization: 'Bearer ' + token },
      });
      var json = await res.json();
      var info = json.data || {};
      console.warn('[LumeRpc] connect-info:', JSON.stringify(info).substring(0, 300));
      if (!info.wsUrl && info.mode !== 'lume') {
        connecting = false;
        setConnState('disconnected');
        return false;
      }
      userId = info.userId || desktopUserId || userId;
      secret = info.secret || desktopSecret || null;
      authHandledByProxy = info.authHandled === true;
      activeTransport = info.transport === 'gateway' ? 'gateway' : 'lume';
      var wsUrl = info.wsUrl;
      if (!wsUrl) {
        connecting = false;
        setConnState('disconnected');
        return false;
      }
      var result = await openLumeWebSocket(wsUrl);
      if (result) reconnectEnabled = true;
      return result;
    } catch (e) {
      connecting = false;
      setConnState('disconnected');
      return false;
    }
  }

  function openLumeWebSocket(wsUrl) {
    return new Promise(function (resolve) {
      ws = new WebSocket(wsUrl);
      var authId = 'auth-' + Date.now();
      var settled = false;

      lastWsUrl = wsUrl;

      function succeed(payload) {
        if (settled) return;
        settled = true;
        markConnected(payload || { userId: userId }, 'lume');
        resolve(true);
      }

      function fail() {
        if (settled) return;
        settled = true;
        connecting = false;
        connected = false;
        setConnState('disconnected');
        resolve(false);
      }

      ws.onopen = function () {
        if (!authHandledByProxy && secret) {
          ws.send(JSON.stringify({
            id: authId,
            method: 'auth',
            params: { token: secret, userId: userId },
          }));
        }
      };

      ws.onmessage = function (ev) {
        var msg;
        try {
          msg = JSON.parse(ev.data);
        } catch (_) {
          return;
        }

        if (
          authHandledByProxy &&
          !connected &&
          msg.type === 'res' &&
          msg.ok &&
          msg.payload && msg.payload.userId
        ) {
          succeed(msg.payload);
          return;
        }

        if (msg.id === authId) {
          if (msg.ok) succeed(msg.payload);
          else fail();
          return;
        }

        handleWsMessage(msg);
      };

      ws.onerror = function () {
        // error 不直接 fail, 等 onclose
      };

      ws.onclose = function () {
        if (!settled) {
          fail();
        } else {
          handleWsClose();
        }
      };

      setTimeout(fail, 12000);
    });
  }

  // ── 请求发送（核心） ──
  function sendRequestPromise(method, params, timeoutMs) {
    var timeout = timeoutMs || 15000;

    // 离线排队
    if (!connected) {
      // 尝试静默连接
      connect().then(function (ok) {
        if (!ok) {
          // 排队的请求会被 flushOfflineQueue 处理或超时
        }
      });
      return enqueueOffline(method, params, timeout);
    }

    var id = 'rpc-' + reqSeq++;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        pending.delete(id);
        reject(new Error('RPC timeout'));
      }, timeout);
      pending.set(id, { timer: timer, resolve: resolve, reject: reject });

      try {
        if (activeTransport === 'gateway') {
          ws.send(JSON.stringify({ type: 'req', id: id, method: method, params: params || {} }));
        } else {
          ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
        }
      } catch (err) {
        pending.delete(id);
        clearTimeout(timer);
        // 入队重试
        enqueueOffline(method, params, timeout).then(resolve).catch(reject);
      }
    });
  }

  // 兼容旧 API: 同步 throw 版本
  function sendRequest(method, params, timeoutMs) {
    if (!connected) throw new Error('Lume 未连接');
    return sendRequestPromise(method, params, timeoutMs);
  }

  async function gatewayCall(method, params, timeoutMs) {
    if (!connected) {
      var ok = await connect();
      if (!ok) throw new Error('Lume 未连接');
    }
    if (activeTransport === 'gateway') {
      var msg = await sendRequestPromise(method, params || {}, timeoutMs);
      return msg.payload;
    }
    var msg2 = await sendRequestPromise(
      'gateway.call',
      { method: method, params: params || {} },
      timeoutMs,
    );
    return msg2.payload;
  }

  async function pluginCall(method, params, timeoutMs) {
    if (!connected) {
      var ok = await connect();
      if (!ok) throw new Error('Lume 未连接');
    }
    var msg = await sendRequestPromise(method, params || {}, timeoutMs);
    return msg.payload;
  }

  async function sendChat(message, sessionKey, agentId) {
    if (!connected) {
      var ok = await connect();
      if (!ok) throw new Error('Lume 未连接');
    }
    var params = {
      message: message,
      sessionKey: sessionKey,
      agentId: agentId || 'main',
      idempotencyKey: 'lume-' + Date.now(),
    };
    var res = await sendRequestPromise('chat.send', params, 10 * 60 * 1000);
    return res && res.payload || res;
  }

  function sendMessage(targetSessionKey, content, agentId) {
    var params = {
      sessionKey: targetSessionKey,
      message: content,
      idempotencyKey: 'msg-' + Date.now(),
    };
    if (agentId) params.agentId = agentId;

    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[LumeRpc] sendMessage: not connected, queueing chat.send');
      connect().catch(function () {});
      enqueueOffline('chat.send', params, 10 * 60 * 1000).catch(function (e) {
        console.error('[LumeRpc] queued sendMessage failed:', e);
      });
      return true;
    }

    try {
      if (activeTransport === 'gateway') {
        ws.send(JSON.stringify({ type: 'req', id: 'rpc-' + reqSeq++, method: 'chat.send', params: params }));
      } else {
        ws.send(JSON.stringify({ id: 'rpc-' + reqSeq++, method: 'chat.send', params: params }));
      }
      return true;
    } catch (e) {
      console.error('[LumeRpc] sendMessage error:', e);
      enqueueOffline('chat.send', params, 10 * 60 * 1000).catch(function () {});
      return true;
    }
  }

  function onEvent(fn) {
    eventListeners.push(fn);
  }

  function offEvent(fn) {
    var idx = eventListeners.indexOf(fn);
    if (idx >= 0) eventListeners.splice(idx, 1);
  }

  function disconnect() {
    reconnectEnabled = false;
    stopHeartbeat();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
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
    reconnectAttempt = 0;
    offlineQueue = [];
    // reject pending
    pending.forEach(function (entry) {
      clearTimeout(entry.timer);
      entry.reject(new Error('disconnected'));
    });
    pending.clear();
    setConnState('disconnected');
  }

  return {
    connect: connect,
    disconnect: disconnect,
    isConnected: function () { return connected; },
    getConnectionState: getConnectionState,
    getTransport: function () { return activeTransport; },
    gatewayCall: gatewayCall,
    pluginCall: pluginCall,
    sendChat: sendChat,
    sendMessage: sendMessage,
    sendRequest: sendRequest,
    onEvent: onEvent,
    offEvent: offEvent,
    forceReconnect: forceReconnect,
  };
})();

/** Agent 团队管理 — 经 Gateway RPC */
var LumeAgents = (function () {
  function mapAgentRow(a) {
    return {
      id: a.id,
      name: (a.identity && a.identity.name) || a.name || a.id,
      emoji: (a.identity && a.identity.emoji) || '\u00a0',
      workspace: a.workspace,
      model: a.model,
      isDefault: a.default === true,
    };
  }

  async function fetchList() {
    var payload = await LumeRpc.gatewayCall('config.get', {}, 12000);
    var list = (payload && payload.config && payload.config.agents && payload.config.agents.list) || [];
    if (!Array.isArray(list) || list.length === 0) return [];
    var ids = {};
    var rows = [];
    list.forEach(function (a) {
      if (!a || !a.id || ids[a.id]) return;
      ids[a.id] = true;
      rows.push(mapAgentRow(a));
    });
    var main = list.find(function (a) { return a.id === 'main' || a.default; });
    var allowed = (main && main.subagents && main.subagents.allowAgents) || [];
    allowed.forEach(function (id) {
      if (!id || ids[id]) return;
      ids[id] = true;
      var existing = list.find(function (a) { return a.id === id; });
      rows.push(existing ? mapAgentRow(existing) : mapAgentRow({ id: id, name: id }));
    });
    return rows;
  }

  async function addAgent(agentId, name, emoji) {
    var payload = await LumeRpc.gatewayCall('config.get', {}, 12000);
    var baseHash = payload && payload.hash;
    var config = (payload && payload.config) || {};
    var agentsList = (config.agents && config.agents.list) || [];
    var defaultWorkspace = (config.agents && config.agents.defaults && config.agents.defaults.workspace) || '~/.openclaw/workspace';

    if (agentsList.some(function (a) { return a.id === agentId; })) {
      throw new Error('Agent "' + agentId + '" 已存在');
    }

    var agentWorkspace = defaultWorkspace + '-' + agentId;
    var newAgent = {
      id: agentId,
      workspace: agentWorkspace,
      identity: { name: name || agentId, emoji: emoji || '\u00a0' },
    };

    var newList = agentsList.concat([newAgent]);
    var mainAgent = newList.find(function (a) { return a.id === 'main' || a.default; });
    if (mainAgent) {
      if (!mainAgent.subagents) mainAgent.subagents = {};
      if (!mainAgent.subagents.allowAgents) mainAgent.subagents.allowAgents = [];
      if (mainAgent.subagents.allowAgents.indexOf(agentId) === -1) {
        mainAgent.subagents.allowAgents.push(agentId);
      }
    }

    await LumeRpc.gatewayCall(
      'config.patch',
      {
        raw: JSON.stringify({ agents: { list: newList } }),
        baseHash: baseHash,
        note: '灵犀云添加 Agent: ' + (name || agentId),
      },
      20000,
    );
    return newAgent;
  }

  async function removeAgent(agentId) {
    if (agentId === 'main') throw new Error('不能删除主 Agent');

    var payload = await LumeRpc.gatewayCall('config.get', {}, 12000);
    var baseHash = payload && payload.hash;
    var agentsList = (config.agents && config.agents.list) || [];
    var updatedList = agentsList.filter(function (a) { return a.id !== agentId; });
    if (updatedList.length === agentsList.length) {
      throw new Error('Agent "' + agentId + '" 不存在');
    }

    var mainAgent = updatedList.find(function (a) { return a.id === 'main' || a.default; });
    if (mainAgent && mainAgent.subagents && mainAgent.subagents.allowAgents) {
      mainAgent.subagents.allowAgents = mainAgent.subagents.allowAgents.filter(function (id) { return id !== agentId; });
      var mainIdx = updatedList.findIndex(function (a) { return a.id === 'main' || a.default; });
      if (mainIdx >= 0) updatedList[mainIdx] = mainAgent;
    }

    await LumeRpc.gatewayCall(
      'config.patch',
      {
        raw: JSON.stringify({ agents: { list: updatedList } }),
        baseHash: baseHash,
        note: '灵犀云移除 Agent: ' + agentId,
      },
      20000,
    );

    try {
      await LumeRpc.gatewayCall('agents.delete', { agentId: agentId }, 8000);
    } catch (_) {}
  }

  return { fetchList: fetchList, addAgent: addAgent, removeAgent: removeAgent };
})();
