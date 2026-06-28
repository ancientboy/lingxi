/**
 * Lume 前端协议 ↔ OpenClaw Gateway 适配（无 18790 插件时使用）
 */

import { resolveLumeModel } from './model-route.js';
import { GatewayWsClient } from './gateway-ws-client.js';
import {
  filterSessionList,
  isListableChatSession,
  isAllowedGatewayMethod,
  isSystemSessionKey,
  resolveUserSessionPrefix,
  sanitizeHistoryMessages,
} from './gateway-session-filter.js';

function lumeRes(id, ok, payload, error) {
  const msg = { type: 'res', id: String(id ?? ''), ok };
  if (payload !== undefined) msg.payload = payload;
  if (!ok && error) msg.error = typeof error === 'string' ? { message: error } : error;
  return msg;
}

function normalizeChatEvent(msg) {
  if (msg.type === 'event' && (msg.event === 'chat' || msg.event === 'agent')) {
    const p = msg.payload || {};
    const textPreview = (p.message || p.text || p.data?.text || p.data?.content || '').substring(0, 80);
    console.log(`[Bridge] event=${msg.event} state=${p.state} stream=${p.stream} runId=${p.runId} textLen=${(p.message || p.text || p.data?.text || p.data?.content || '').length} text="${textPreview}"`);
  }
  if (msg.type !== 'event' || msg.event !== 'chat') return msg;
  const payload = msg.payload || {};
  const state = payload.state;
  if (state === 'delta' || state === 'block' || state === 'final' || state === 'start' || state === 'error') {
    return msg;
  }
  // Gateway 部分版本用 message 字段承载增量文本
  if (payload.text && !payload.message) {
    return {
      ...msg,
      payload: { ...payload, message: payload.text, state: payload.state || 'delta' },
    };
  }
  return msg;
}

export class LumeGatewayBridge {
  /**
   * @param {{ server: object, userId: string, sendToClient: (obj) => void, userPreferredModel?: string | null }} opts
   */
  constructor(opts) {
    this.server = opts.server;
    this.userId = opts.userId;
    this.sendToClient = opts.sendToClient;
    this.userPreferredModel = opts.userPreferredModel || null;
    this.client = new GatewayWsClient(opts.server, { displayName: 'Lume Cloud' });
    this.client.onEvent((ev) => {
      this.sendToClient(normalizeChatEvent(ev));
    });
  }

  async connect() {
    await this.client.connect();
  }

  destroy() {
    this.client.close();
  }

  async assertSessionAccess(sessionKey) {
    if (isListableChatSession(sessionKey, this.userId)) return;
    const list = await this.client.request('sessions.list', { limit: 200 });
    const sessions = Array.isArray(list.payload?.sessions) ? list.payload.sessions : [];
    const row = sessions.find((s) => String(s?.key) === sessionKey);
    if (row && isListableChatSession(sessionKey, this.userId, row)) return;
    throw new Error(`Session access denied: ${sessionKey}`);
  }

  async handleMessage(msg) {
    const method = String(msg.method || '');
    const id = msg.id;
    const params = msg.params || {};

    if (method === 'ping') {
      this.sendToClient(lumeRes(id, true, { pong: true }));
      return;
    }

    if (method === 'chat.send' || method === 'sendMessage') {
      const sessionKey = params.sessionKey ? String(params.sessionKey) : undefined;
      const message = String(params.message ?? '');
      const agentId = params.agentId ? String(params.agentId) : 'main';
      let model = params.model;
      const resolved = resolveLumeModel(model, this.userPreferredModel);
      if (resolved) model = resolved;

      const chatParams = {
        message,
        sessionKey,
        agentId,
        idempotencyKey: params.idempotencyKey || `lume-${Date.now()}`,
      };
      // OpenClaw chat.send 不接受 model 参数
      // 模型通过 sessions.patch 设置，不在这里传

      // 与插件一致：先 ack，流式走 event
      this.sendToClient(lumeRes(id, true, { received: true }));

      try {
        await this.client.request('chat.send', chatParams, 30_000);
      } catch (err) {
        this.sendToClient({
          type: 'event',
          event: 'chat',
          payload: {
            state: 'error',
            message: `⚠️ 发送失败：${err.message}`,
            runId: `gw-err-${Date.now()}`,
            sessionKey,
          },
        });
      }
      return;
    }

      console.log("[Bridge] handleMessage: " + method + " id=" + id);
    if (method === 'sessions.list') {
      const gw = await this.client.request('sessions.list', params, 30_000);
      const sessions = filterSessionList(gw.payload?.sessions, this.userId);
      const prefix = resolveUserSessionPrefix(this.userId);
      this.sendToClient(
        lumeRes(id, true, {
          ...gw.payload,
          sessions,
          count: sessions.length,
          totalCount: sessions.length,
          userPrefix: prefix,
        }),
      );
      return;
    }

    if (method === 'chat.history') {
      const sessionKey = String(params.sessionKey ?? '');
      await this.assertSessionAccess(sessionKey);
      const limit = typeof params.limit === 'number' ? params.limit : 100;
      const gw = await this.client.request('chat.history', { sessionKey, limit }, 20_000);
      const rawMessages = Array.isArray(gw.payload?.messages) ? gw.payload.messages : [];
      const { messages, totalRaw, visibleCount } = sanitizeHistoryMessages(rawMessages);
      this.sendToClient(
        lumeRes(id, true, {
          ...gw.payload,
          messages,
          totalRaw,
          visibleCount,
          limit,
        }),
      );
      return;
    }

    if (method === 'chat.abort') {
      const sessionKey = String(params.sessionKey ?? '');
      await this.assertSessionAccess(sessionKey);
      const gw = await this.client.request('chat.abort', { sessionKey }, 15_000);
      this.sendToClient(lumeRes(id, true, gw.payload));
      return;
    }

    if (method === 'sessions.patch' || method === 'sessions.update') {
      const key = String(params.key ?? params.sessionKey ?? '');
      if (!key) throw new Error('sessions.patch requires key');
      await this.assertSessionAccess(key);
      const patch = { key };
      if (params.model !== undefined) patch.model = params.model;
      if (params.label !== undefined) patch.label = params.label;
      if (params.title !== undefined && params.label === undefined) patch.label = params.title;
      if (params.displayName !== undefined) patch.displayName = params.displayName;
      if (params.thinkingLevel !== undefined) patch.thinkingLevel = params.thinkingLevel;
      const gw = await this.client.request('sessions.patch', patch, 15_000);
      this.sendToClient(lumeRes(id, true, gw.payload));
      return;
    }

    if (method === 'sessions.delete') {
      const key = String(params.key ?? params.sessionKey ?? '').trim();
      if (!key) throw new Error('sessions.delete requires key');
      if (isSystemSessionKey(key)) throw new Error(`Cannot delete system session: ${key}`);
      const gw = await this.client.request('sessions.delete', { key, sessionKey: key }, 15_000);
      this.sendToClient(lumeRes(id, true, gw.payload));
      return;
    }

    if (method === 'sessions.create') {
      const gw = await this.client.request('sessions.create', params, 15_000);
      this.sendToClient(lumeRes(id, true, gw.payload));
      return;
    }

    if (method === 'gateway.call') {
      const innerMethod = String(params.method || '').trim();
      const innerParams = params.params || {};
      if (!innerMethod) {
        this.sendToClient(
          lumeRes(id, false, null, 'gateway.call requires params.method'),
        );
        return;
      }
      if (!isAllowedGatewayMethod(innerMethod)) {
        this.sendToClient(
          lumeRes(id, false, null, `Gateway method not allowed: ${innerMethod}`),
        );
        return;
      }
      const gw = await this.client.request(innerMethod, innerParams, 25_000);
      this.sendToClient(lumeRes(id, true, gw.payload));
      return;
    }

    // 未知方法尝试直传 Gateway（管理扩展）
    if (method && method !== 'auth') {
      const gw = await this.client.request(method, params, 20_000);
      this.sendToClient(lumeRes(id, true, gw.payload));
      return;
    }

    this.sendToClient(lumeRes(id, false, null, `Unknown method: ${method}`));
  }

  async handleMessageSafe(msg) {
    try {
      console.log(`[Bridge] handleMessageSafe: ${msg.method} id=${msg.id}`);
      await this.handleMessage(msg);
      console.log(`[Bridge] handleMessageSafe done: ${msg.method}`);
    } catch (err) {
      console.error(`[Bridge] handleMessageSafe error: ${msg.method}`, err.message);
      this.sendToClient(lumeRes(msg.id, false, null, err.message || String(err)));
    }
  }
}
