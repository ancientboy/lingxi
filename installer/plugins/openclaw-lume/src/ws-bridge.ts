/**
 * Lume WebSocket Bridge
 *
 * Maintains a WebSocket server that the Lingxi Cloud frontend connects to.
 * Each connected user is tracked by userId extracted from the auth handshake.
 * Messages from the frontend are forwarded to the inbound handler.
 * Outbound messages from OpenClaw core are pushed to the appropriate user's socket.
 */

import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import type { LumeAccount, LumeWsMessage, LumeChatSendParams } from "./types.js";
import type { GatewayApiConfig } from "./gateway-api.js";
import {
  listUserSessions,
  getUserChatHistory,
  resolveUserSessionPrefix,
  abortChat,
  patchSession,
  deleteSession,
  callGatewayMethod,
} from "./gateway-api.js";
import {
  handleManagementMethod,
  MANAGEMENT_METHODS,
  startHealthMonitor,
  stopHealthMonitor,
} from "./management-handlers.js";

/** Callback for inbound messages from a connected Lume client */
export type InboundHandler = (params: {
  userId: string;
  accountId: string;
  message: string;
  sessionKey?: string;
  agentId?: string;
  model?: string;
  attachments?: LumeChatSendParams["attachments"];
}) => void | Promise<void>;

export interface WsBridge {
  /** Start the WebSocket server */
  start(): Promise<void>;
  /** Gracefully shut down */
  stop(): Promise<void>;
  /** Send an event to a specific user. Returns number of connections delivered to. */
  sendToUser(userId: string, message: LumeWsMessage): number;
  /** Send an event to all connected users */
  broadcast(message: LumeWsMessage): void;
  /** Register handler for inbound messages */
  onInbound(handler: InboundHandler): void;
  /** Get number of connected clients */
  readonly connectionCount: number;
}

interface ClientInfo {
  userId: string;
  accountId: string;
  socket: WebSocket;
  connectedAt: number;
  pendingMessages: LumeWsMessage[];
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

export function createWsBridge(account: LumeAccount, gatewayApi?: GatewayApiConfig): WsBridge {
  const clients = new Map<string, Set<ClientInfo>>(); // userId → Set<ClientInfo>
  const OFFLINE_TTL = 5 * 60 * 1000; // 5 minutes
  const MAX_PENDING = 100;
  let wss: WebSocketServer | null = null;
  let inboundHandler: InboundHandler | null = null;

  return {
    get connectionCount() {
      let count = 0;
      for (const userSet of clients.values()) {
        for (const c of userSet) {
          if (c.socket.readyState === WebSocket.OPEN) count++;
        }
      }
      return count;
    },

    onInbound(handler: InboundHandler) {
      inboundHandler = handler;
    },

    async start() {
      wss = new WebSocketServer({ port: account.port });

      wss.on("connection", (ws, req) => {
        let userId: string | null = null;
        let accountId = account.accountId;
        let authenticated = false;

        // Auth timeout: close if not authenticated within 10s
        const authTimer = setTimeout(() => {
          if (!authenticated) {
            send(ws, { type: "error", error: "Authentication timeout" });
            ws.close(4001, "auth timeout");
          }
        }, 10_000);

        ws.on("message", (raw) => {
          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(raw.toString());
          } catch {
            send(ws, { type: "error", error: "Invalid JSON" });
            return;
          }

          // ── Auth handshake ────────────────────────────────
          if (msg.method === "auth") {
            clearTimeout(authTimer);
            const params = msg.params as Record<string, unknown> | undefined;
            const token = params?.token;
            if (!token || token !== account.secret) {
              send(ws, {
                type: "res",
                id: String(msg.id ?? ""),
                ok: false,
                error: { code: "AUTH_FAILED", message: "Invalid token" },
              });
              ws.close(4003, "auth failed");
              return;
            }

            userId = String(params?.userId ?? randomUUID());
            authenticated = true;

            // Multi-device: add to Set (don't kick existing connections)
            let userSet = clients.get(userId);
            if (!userSet) {
              userSet = new Set();
              clients.set(userId, userSet);
            }

            const newClient: ClientInfo = {
              userId,
              accountId,
              socket: ws,
              connectedAt: Date.now(),
              pendingMessages: [],
              cleanupTimer: null,
            };
            userSet.add(newClient);

            // Flush pending messages from disconnected clients
            for (const c of userSet) {
              if (c === newClient) continue;
              if (c.pendingMessages.length > 0) {
                for (const pending of c.pendingMessages) {
                  send(ws, pending);
                }
                c.pendingMessages = [];
              }
              // Clear cleanup timer on old entry
              if (c.cleanupTimer) {
                clearTimeout(c.cleanupTimer);
                c.cleanupTimer = null;
              }
              // Remove old disconnected entries after flushing
              if (c.socket.readyState !== WebSocket.OPEN) {
                userSet.delete(c);
              }
            }

            // 不再自动启动 health monitor — 客户端通过 health.subscribe 按需订阅

            send(ws, {
              type: "res",
              id: String(msg.id ?? ""),
              ok: true,
              payload: {
                userId,
                serverTime: Date.now(),
                sessionPrefix: resolveUserSessionPrefix(userId),
                channel: "lume",
              },
            });

            return;
          }

          // ── Reject unauthenticated messages ───────────────
          if (!authenticated || !userId) {
            send(ws, { type: "error", error: "Not authenticated" });
            ws.close(4001, "not authenticated");
            return;
          }

          // ── chat.send ─────────────────────────────────────
          if (msg.method === "chat.send") {
            const params = (msg.params ?? {}) as Record<string, unknown>;

            // Acknowledge receipt
            send(ws, {
              type: "res",
              id: String(msg.id ?? ""),
              ok: true,
              payload: { received: true },
            });

            // Dispatch to inbound handler (fire-and-foretch with error logging)
            if (inboundHandler) {
              const handlerUserId = userId;
              const handlerAccountId = accountId;
              Promise.resolve(inboundHandler({
                userId: handlerUserId,
                accountId: handlerAccountId,
                message: String(params.message ?? ""),
                sessionKey: params.sessionKey ? String(params.sessionKey) : undefined,
                agentId: params.agentId ? String(params.agentId) : undefined,
                 model: params.model ? String(params.model) : undefined,
                attachments: params.attachments as LumeChatSendParams["attachments"] | undefined,
              })).catch((err) => {
                console.error(`lume: inbound handler error for user=${handlerUserId}: ${String(err)}`);
              });
            }
            return;
          }


          // ── sessions.list (user-scoped) ───────────────────
          if (msg.method === "sessions.list") {
            if (!gatewayApi?.token) {
              send(ws, {
                type: "res",
                id: String(msg.id ?? ""),
                ok: false,
                error: { code: "GATEWAY_UNAVAILABLE", message: "Gateway not configured" },
              });
              return;
            }
            const params = (msg.params ?? {}) as Record<string, unknown>;
            void listUserSessions(gatewayApi, userId, params)
              .then((payload) => {
                send(ws, {
                  type: "res",
                  id: String(msg.id ?? ""),
                  ok: true,
                  payload,
                });
              })
              .catch((err) => {
                send(ws, {
                  type: "res",
                  id: String(msg.id ?? ""),
                  ok: false,
                  error: { code: "SESSIONS_LIST_FAILED", message: String(err) },
                });
              });
            return;
          }

          // ── chat.history (user-scoped) ────────────────────
          if (msg.method === "chat.history") {
            if (!gatewayApi?.token) {
              send(ws, {
                type: "res",
                id: String(msg.id ?? ""),
                ok: false,
                error: { code: "GATEWAY_UNAVAILABLE", message: "Gateway not configured" },
              });
              return;
            }
            const params = (msg.params ?? {}) as Record<string, unknown>;
            void getUserChatHistory(gatewayApi, userId, params)
              .then((payload) => {
                send(ws, {
                  type: "res",
                  id: String(msg.id ?? ""),
                  ok: true,
                  payload,
                });
              })
              .catch((err) => {
                send(ws, {
                  type: "res",
                  id: String(msg.id ?? ""),
                  ok: false,
                  error: { code: "CHAT_HISTORY_FAILED", message: String(err) },
                });
              });
            return;
          }


          // ── chat.abort ────────────────────────────────────
          if (msg.method === "chat.abort") {
            if (!gatewayApi?.token) {
              send(ws, {
                type: "res",
                id: String(msg.id ?? ""),
                ok: false,
                error: { code: "GATEWAY_UNAVAILABLE", message: "Gateway not configured" },
              });
              return;
            }
            const params = (msg.params ?? {}) as Record<string, unknown>;
            const sessionKey = String(params.sessionKey ?? "");
            void abortChat(gatewayApi, userId, sessionKey)
              .then((payload) => {
                send(ws, { type: "res", id: String(msg.id ?? ""), ok: true, payload });
              })
              .catch((err) => {
                send(ws, {
                  type: "res",
                  id: String(msg.id ?? ""),
                  ok: false,
                  error: { code: "CHAT_ABORT_FAILED", message: String(err) },
                });
              });
            return;
          }

          // ── sessions.patch ────────────────────────────────
          if (msg.method === "sessions.patch") {
            if (!gatewayApi?.token) {
              send(ws, {
                type: "res",
                id: String(msg.id ?? ""),
                ok: false,
                error: { code: "GATEWAY_UNAVAILABLE", message: "Gateway not configured" },
              });
              return;
            }
            const params = (msg.params ?? {}) as Record<string, unknown>;
            void patchSession(gatewayApi, userId, params)
              .then((payload) => {
                send(ws, { type: "res", id: String(msg.id ?? ""), ok: true, payload });
              })
              .catch((err) => {
                send(ws, {
                  type: "res",
                  id: String(msg.id ?? ""),
                  ok: false,
                  error: { code: "SESSIONS_PATCH_FAILED", message: String(err) },
                });
              });
            return;
          }


          // ── sessions.update (Flutter 兼容 → sessions.patch) ─
          if (msg.method === "sessions.update") {
            if (!gatewayApi?.token) {
              send(ws, {
                type: "res",
                id: String(msg.id ?? ""),
                ok: false,
                error: { code: "GATEWAY_UNAVAILABLE", message: "Gateway not configured" },
              });
              return;
            }
            const raw = (msg.params ?? {}) as Record<string, unknown>;
            const normalized: Record<string, unknown> = {
              key: raw.key ?? raw.sessionKey,
              label: raw.label ?? raw.title,
            };
            if (raw.displayName !== undefined) normalized.displayName = raw.displayName;
            if (raw.model !== undefined) normalized.model = raw.model;
            if (raw.thinkingLevel !== undefined) normalized.thinkingLevel = raw.thinkingLevel;
            void patchSession(gatewayApi, userId, normalized)
              .then((payload) => {
                send(ws, { type: "res", id: String(msg.id ?? ""), ok: true, payload });
              })
              .catch((err) => {
                send(ws, {
                  type: "res",
                  id: String(msg.id ?? ""),
                  ok: false,
                  error: { code: "SESSIONS_UPDATE_FAILED", message: String(err) },
                });
              });
            return;
          }


          if (msg.method === "sessions.delete") {
            if (!gatewayApi?.token) {
              send(ws, {
                type: "res",
                id: String(msg.id ?? ""),
                ok: false,
                error: { code: "GATEWAY_UNAVAILABLE", message: "Gateway not configured" },
              });
              return;
            }
            const params = (msg.params ?? {}) as Record<string, unknown>;
            const key = String(params.key ?? params.sessionKey ?? "");
            void deleteSession(gatewayApi, userId, key)
              .then((payload) => {
                send(ws, { type: "res", id: String(msg.id ?? ""), ok: true, payload });
              })
              .catch((err) => {
                send(ws, {
                  type: "res",
                  id: String(msg.id ?? ""),
                  ok: false,
                  error: { code: "SESSIONS_DELETE_FAILED", message: String(err) },
                });
              });
            return;
          }


          // ── gateway.call (白名单代理 Gateway RPC) ─────────
          if (msg.method === "gateway.call") {
            if (!gatewayApi?.token) {
              send(ws, {
                type: "res",
                id: String(msg.id ?? ""),
                ok: false,
                error: { code: "GATEWAY_UNAVAILABLE", message: "Gateway not configured" },
              });
              return;
            }
            const params = (msg.params ?? {}) as Record<string, unknown>;
            const innerMethod = String(params.method ?? "").trim();
            const innerParams = (params.params && typeof params.params === "object")
              ? (params.params as Record<string, unknown>)
              : {};
            if (!innerMethod) {
              send(ws, {
                type: "res",
                id: String(msg.id ?? ""),
                ok: false,
                error: { code: "GATEWAY_CALL_INVALID", message: "gateway.call requires params.method" },
              });
              return;
            }
            void callGatewayMethod(gatewayApi, innerMethod, innerParams)
              .then((payload) => {
                send(ws, {
                  type: "res",
                  id: String(msg.id ?? ""),
                  ok: true,
                  payload,
                });
              })
              .catch((err) => {
                send(ws, {
                  type: "res",
                  id: String(msg.id ?? ""),
                  ok: false,
                  error: { code: "GATEWAY_CALL_FAILED", message: String(err) },
                });
              });
            return;
          }

          // ── 管理类原生 RPC (P2/P4) ─────────────────────────
          if (MANAGEMENT_METHODS.has(String(msg.method))) {
            const params = (msg.params ?? {}) as Record<string, unknown>;
            const methodName = String(msg.method);

            // health.subscribe: 返回状态 + 启动定时推送
            if (methodName === "health.subscribe") {
              void handleManagementMethod(methodName, params, gatewayApi)
                .then((payload) => {
                  send(ws, { type: "res", id: String(msg.id ?? ""), ok: true, payload });
                  // 启动定时健康推送
                  startHealthMonitor(userId!, ws, gatewayApi, send);
                })
                .catch((err) => {
                  send(ws, { type: "res", id: String(msg.id ?? ""), ok: false, error: { code: "HEALTH_FAILED", message: String(err) } });
                });
              return;
            }
            void handleManagementMethod(methodName, params, gatewayApi)
              .then((payload) => {
                send(ws, {
                  type: "res",
                  id: String(msg.id ?? ""),
                  ok: true,
                  payload,
                });
              })
              .catch((err) => {
                send(ws, {
                  type: "res",
                  id: String(msg.id ?? ""),
                  ok: false,
                  error: { code: "MANAGEMENT_FAILED", message: String(err) },
                });
              });
            return;
          }

          // ── ping / keepalive ──────────────────────────────
          if (msg.method === "ping") {
            send(ws, {
              type: "res",
              id: String(msg.id ?? ""),
              ok: true,
              payload: { pong: true },
            });
            return;
          }

          // ── Unknown method ────────────────────────────────
          send(ws, {
            type: "res",
            id: String(msg.id ?? ""),
            ok: false,
            error: { code: "UNKNOWN_METHOD", message: `Unknown method: ${String(msg.method)}` },
          });
        });

        ws.on("close", () => {
          clearTimeout(authTimer);
          if (userId) {
            stopHealthMonitor(userId);
            const userSet = clients.get(userId);
            if (userSet) {
              // Find the matching ClientInfo and start cleanup timer
              for (const c of userSet) {
                if (c.socket === ws) {
                  const uid = userId; // capture narrowed type for closure
                  c.cleanupTimer = setTimeout(() => {
                    userSet.delete(c);
                    if (userSet.size === 0) {
                      clients.delete(uid);
                    }
                  }, OFFLINE_TTL);
                  break;
                }
              }
            }
          }
        });

        ws.on("error", (err) => {
          clearTimeout(authTimer);
          void err;
        });
      });

      return new Promise<void>((resolve, reject) => {
        wss!.on("listening", () => {
          resolve();
        });
        wss!.on("error", (err) => {
          reject(err);
        });
      });
    },

    async stop() {
      if (!wss) return;
      // Close all client connections
      for (const [, userSet] of clients) {
        for (const c of userSet) {
          if (c.cleanupTimer) clearTimeout(c.cleanupTimer);
          c.socket.close(1001, "server shutting down");
        }
      }
      clients.clear();
      await new Promise<void>((resolve) => {
        wss!.close(() => resolve());
      });
      wss = null;
    },

    sendToUser(userId: string, message: LumeWsMessage): number {
      const userSet = clients.get(userId);
      if (!userSet || userSet.size === 0) return 0;

      let sentCount = 0;
      for (const c of userSet) {
        if (c.socket.readyState === WebSocket.OPEN) {
          send(c.socket, message);
          sentCount++;
        }
      }

      // No open connections — buffer for offline delivery
      if (sentCount === 0) {
        for (const c of userSet) {
          if (c.pendingMessages.length >= MAX_PENDING) {
            c.pendingMessages.shift(); // drop oldest
          }
          c.pendingMessages.push(message);
          break; // only buffer on first disconnected client
        }
      }

      return sentCount;
    },

    broadcast(message: LumeWsMessage): void {
      for (const [, userSet] of clients) {
        for (const c of userSet) {
          if (c.socket.readyState === WebSocket.OPEN) {
            send(c.socket, message);
          }
        }
      }
    },
  };
}

function send(ws: WebSocket, msg: LumeWsMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
