/**
 * Gateway 连接池 — 每个用户维护一个持久 Gateway WS 连接
 * 支持 SSE 事件转发，自动重连
 */

import { GatewayWsClient } from './gateway-ws-client.js';
import { getDB } from './db.js';
import { getActiveServer } from './activeServer.js';

const pool = new Map(); // userId -> { client, listeners, lastActive }
const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 分钟空闲超时

async function getUserServer(userId) {
  const db = await getDB();
  return getActiveServer(db, userId);
}

/**
 * 获取或创建用户的 Gateway 连接
 */
export async function getGatewayClient(userId) {
  const entry = pool.get(userId);
  if (entry && entry.client && entry.client.connected) {
    entry.lastActive = Date.now();
    return entry.client;
  }

  const server = await getUserServer(userId);
  if (!server || !server.ip) {
    throw new Error('用户无可用服务器');
  }

  const client = new GatewayWsClient(server, { displayName: `Lume SSE [${userId.substring(0, 8)}]` });

  const poolEntry = { client, listeners: new Set(), lastActive: Date.now() };
  pool.set(userId, poolEntry);

  // 自动重连 + 空闲清理
  client.onEvent((ev) => {
    poolEntry.lastActive = Date.now();
    for (const fn of poolEntry.listeners) {
      try { fn(ev); } catch (_) {}
    }
  });

  return client;
}

/**
 * 订阅用户的事件流
 * @returns {Function} unsubscribe
 */
export function subscribeEvents(userId, handler) {
  const entry = pool.get(userId);
  if (!entry) throw new Error('用户未连接');
  entry.listeners.add(handler);
  entry.lastActive = Date.now();
  return () => {
    entry.listeners.delete(handler);
    // 如果没有监听者了，标记空闲
    if (entry.listeners.size === 0) {
      entry.lastActive = Date.now();
    }
  };
}

/**
 * 发送消息到 Gateway
 */
export async function sendChatMessage(userId, { message, sessionKey, agentId, model }) {
  const client = await getGatewayClient(userId);

  // 确保连接
  if (!client.connected) {
    await client.connect();
  }

  // 设置模型（如果有）
  if (model && sessionKey) {
    try {
      await client.request('sessions.patch', { key: sessionKey, agentId: agentId || 'main', model });
    } catch (e) {
      console.warn(`[Pool] session model patch failed:`, e.message);
    }
  }

  // 发送消息
  const chatParams = {
    message,
    sessionKey,
    agentId: agentId || 'main',
    idempotencyKey: `sse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };

  await client.request('chat.send', chatParams, 30_000);
}

/**
 * 获取聊天历史
 */
export async function getChatHistory(userId, sessionKey, limit = 50) {
  const client = getGatewayClient(userId);
  if (!client.connected) {
    await client.connect();
  }
  const result = await client.request('chat.history', { sessionKey, limit }, 20_000);
  return result.payload?.messages || [];
}

/**
 * 获取会话列表
 */
export async function getSessionList(userId) {
  const client = getGatewayClient(userId);
  if (!client.connected) {
    await client.connect();
  }
  const result = await client.request('sessions.list', { limit: 200 }, 20_000);
  return result.payload?.sessions || [];
}

/**
 * 关闭用户连接
 */
export function closeGatewayClient(userId) {
  const entry = pool.get(userId);
  if (entry) {
    entry.client.close();
    pool.delete(userId);
  }
}

/**
 * 定期清理空闲连接（每分钟执行）
 */
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of pool) {
    if (entry.listeners.size === 0 && now - entry.lastActive > IDLE_TIMEOUT) {
      console.log(`[Pool] 清理空闲连接: ${userId.substring(0, 8)}`);
      entry.client.close();
      pool.delete(userId);
    }
  }
}, 60_000);

/**
 * 获取连接池状态（调试用）
 */
export function getPoolStatus() {
  const status = {};
  for (const [userId, entry] of pool) {
    status[userId.substring(0, 8)] = {
      connected: entry.client.connected,
      listeners: entry.listeners.size,
      lastActive: new Date(entry.lastActive).toISOString(),
    };
  }
  return status;
}
