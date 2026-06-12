/**
 * Lume WebSocket RPC — 付费用户优先连接 Lume 插件
 * 支持 gateway.call 代理 + 原生管理 RPC + 聊天
 */
const LumeRpc = (function () {
  let ws = null;
  let connected = false;
  let connecting = false;
  let userId = null;
  let secret = null;
  const pending = new Map();
  const eventListeners = [];
  let reqSeq = 1;

  function getToken() {
    return localStorage.getItem('lingxi_token');
  }

  function getApiBase() {
    try {
      const u = JSON.parse(localStorage.getItem('lingxi_user') || '{}');
      return u.serverUrl || '';
    } catch {
      return '';
    }
  }

  function emitEvent(msg) {
    for (const fn of eventListeners) {
      try {
        fn(msg);
      } catch (_) {}
    }
  }

  async function connect() {
    if (connected) return true;
    if (connecting) {
      await new Promise((r) => setTimeout(r, 500));
      return connected;
    }
    const token = getToken();
    if (!token) return false;

    connecting = true;
    try {
      const res = await fetch(getApiBase() + '/api/lume/connect-info', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const json = await res.json();
      const info = json.data || {};
      if (info.mode !== 'lume' || !info.wsUrl) {
        connecting = false;
        return false;
      }
      userId = info.userId;
      secret = info.secret;
      const wsUrl = info.wsUrl;

      return await new Promise((resolve) => {
        ws = new WebSocket(wsUrl);
        const authId = 'auth-' + Date.now();
        let settled = false;

        const fail = () => {
          if (settled) return;
          settled = true;
          connecting = false;
          connected = false;
          resolve(false);
        };

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              id: authId,
              method: 'auth',
              params: { token: secret, userId },
            }),
          );
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
          if (msg.id === authId) {
            if (msg.ok) {
              connected = true;
              connecting = false;
              if (!settled) {
                settled = true;
                resolve(true);
              }
            } else {
              fail();
            }
            return;
          }
          if (msg.type === 'res' && msg.id && pending.has(msg.id)) {
            const entry = pending.get(msg.id);
            pending.delete(msg.id);
            clearTimeout(entry.timer);
            if (msg.ok) entry.resolve(msg);
            else entry.reject(new Error(msg.error?.message || 'RPC failed'));
          }
        };

        ws.onerror = fail;
        ws.onclose = () => {
          connected = false;
          connecting = false;
        };

        setTimeout(fail, 12000);
      });
    } catch (e) {
      connecting = false;
      return false;
    }
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
  }

  return {
    connect,
    disconnect,
    isConnected: () => connected,
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
    return list.map(mapAgentRow);
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
