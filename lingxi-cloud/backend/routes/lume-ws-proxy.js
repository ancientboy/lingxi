/**
 * Lume WebSocket WSS 代理 — 设备热切换版
 *
 * 客户端保持一个长连接，proxy 内部按 device.switch 切换后端。
 * 切换流程：Flutter 发 device.switch → proxy 断开旧后端 → 连新后端 → auth → 响应 OK
 * 之后 sessions.list / chat.history 等自动走新设备。
 */

import expressWs from "express-ws";
import WebSocket from "ws";
import jwt from "jsonwebtoken";
import config from "../config/index.js";
import { getDB, saveDB } from "../utils/db.js";
import { getActiveServer, getUserServers } from "../utils/activeServer.js";

const JWT_SECRET = config.security.jwtSecret;
const LUME_PORT = Number(process.env.LUME_WS_PORT || "18790");
const LUME_SECRET = process.env.LUME_WS_SECRET || "lume-secret-2026";
const CONNECT_TIMEOUT_MS = 15_000;
const AUTH_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export function setupLumeWebSocketProxy(app) {
  expressWs(app);

  app.ws("/api/lume-ws", async (clientWs, req) => {
    let userId = null;
    let currentServerId = null;
    let targetWs = null;
    let targetReady = false;
    let targetConnecting = false;
    const messageQueue = [];
    let connectTimer = null;
    let authTimer = null;
    let idleTimer = null;
    // device.switch 的 pending 响应回调
    let switchCallback = null;

    // ── 工具函数 ──

    const cleanupTarget = () => {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      if (authTimer) { clearTimeout(authTimer); authTimer = null; }
      if (targetWs) {
        try {
          targetWs.removeAllListeners();
          if (targetWs.readyState === WebSocket.OPEN || targetWs.readyState === WebSocket.CONNECTING) {
            targetWs.close(1000, "proxy switch");
          }
        } catch (_) {}
        targetWs = null;
      }
      targetReady = false;
      targetConnecting = false;
    };

    const cleanupAll = () => {
      cleanupTarget();
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      if (switchCallback) { switchCallback = null; }
    };

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        console.log(`⏰ [Lume-WS] ${userId?.substring(0, 8)} idle timeout`);
        cleanupAll();
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: "error", error: "连接超时，请重新连接" }));
          clientWs.close(1000, "idle timeout");
        }
      }, IDLE_TIMEOUT_MS);
    };

    const flushQueue = () => {
      while (messageQueue.length > 0 && targetWs?.readyState === WebSocket.OPEN && targetReady) {
        targetWs.send(messageQueue.shift());
      }
    };

    const sendToClient = (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(typeof data === "string" ? data : JSON.stringify(data));
      }
    };

    // ── 连接到后端 Lume ──

    const connectToTarget = (host, onComplete) => {
      if (targetConnecting) {
        console.log(`⏳ [Lume-WS] ${userId?.substring(0, 8)} 正在连接中，跳过`);
        return;
      }

      cleanupTarget();
      targetConnecting = true;

      const targetUrl = `ws://${host}:${LUME_PORT}`;
      console.log(`🔌 [Lume-WS] ${userId?.substring(0, 8)} → ${targetUrl}`);

      targetWs = new WebSocket(targetUrl);

      // 连接超时
      connectTimer = setTimeout(() => {
        if (targetWs?.readyState === WebSocket.CONNECTING) {
          console.error(`⏱️ [Lume-WS] ${userId?.substring(0, 8)} 连接超时`);
          targetConnecting = false;
          cleanupTarget();
          if (onComplete) onComplete(new Error("连接 Lume 超时"));
        }
      }, CONNECT_TIMEOUT_MS);

      targetWs.on("open", () => {
        if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }

        // 发 auth
        const authMsg = JSON.stringify({
          id: `proxy-auth-${Date.now()}`,
          method: "auth",
          params: { token: LUME_SECRET, userId },
        });
        targetWs.send(authMsg);

        // Auth 超时
        authTimer = setTimeout(() => {
          if (!targetReady) {
            console.error(`⏱️ [Lume-WS] ${userId?.substring(0, 8)} auth 超时`);
            targetConnecting = false;
            cleanupTarget();
            if (onComplete) onComplete(new Error("Lume auth 超时"));
          }
        }, AUTH_TIMEOUT_MS);
      });

      targetWs.on("message", (data) => {
        resetIdleTimer();
        const raw = data.toString();

        // 等待 auth 响应
        if (!targetReady) {
          try {
            const msg = JSON.parse(raw);
            if (msg.type === "res" && msg.ok === true && msg.payload?.userId) {
              if (authTimer) { clearTimeout(authTimer); authTimer = null; }
              targetReady = true;
              targetConnecting = false;
              console.log(`✅ [Lume-WS] ${userId?.substring(0, 8)} auth 成功`);
              flushQueue();
              if (onComplete) onComplete(null);
              // 🔧 不要 return！auth 响应也要转发给客户端
            } else if (msg.type === "res" && msg.ok === false) {
              if (authTimer) { clearTimeout(authTimer); authTimer = null; }
              console.error(`❌ [Lume-WS] ${userId?.substring(0, 8)} auth 失败`);
              targetConnecting = false;
              cleanupTarget();
              if (onComplete) onComplete(new Error("Lume auth 失败"));
              // auth 失败不需要转发
              return;
            }
          } catch (_) {}
        }

        // 正常转发给客户端（包括 auth 成功响应）
        sendToClient(raw);
      });

      targetWs.on("error", (err) => {
        console.error(`❌ [Lume-WS] ${userId?.substring(0, 8)} target error:`, err.message);
        targetConnecting = false;
        if (!targetReady && onComplete) {
          onComplete(new Error("Lume 连接异常: " + err.message));
          return;  // 切换场景：不清理客户端连接
        }
        // 非切换期间的连接错误
        if (!switchCallback) {
          sendToClient({ type: "error", error: "Lume 连接异常" });
          cleanupAll();
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(1011, "target error");
          }
        }
      });

      targetWs.on("close", (code, reason) => {
        targetConnecting = false;
        if (!targetReady && onComplete) {
          // 连接/切换过程中后端关闭
          onComplete(new Error("后端连接关闭: code=" + code));
          return;  // 不清理客户端连接
        }
        if (!switchCallback) {
          // 非切换期间的后端断开，通知客户端
          sendToClient({ type: "error", error: "Lume 连接断开" });
          cleanupAll();
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(1000, "target closed");
          }
        }
      });
    };

    // ── device.switch 处理 ──

    const handleDeviceSwitch = (msg) => {
      const params = msg.params || {};
      const serverId = params.serverId;

      if (!serverId) {
        sendToClient({
          type: "res", id: String(msg.id ?? ""), ok: false,
          error: { code: "MISSING_SERVER_ID", message: "device.switch requires serverId" },
        });
        return;
      }

      if (switchCallback) {
        sendToClient({
          type: "res", id: String(msg.id ?? ""), ok: false,
          error: { code: "SWITCH_IN_PROGRESS", message: "设备切换进行中" },
        });
        return;
      }

      console.log(`🔄 [Lume-WS] ${userId?.substring(0, 8)} device.switch → ${serverId}`);

      (async () => {
        try {
          const db = await getDB();
          const server = db.userServers?.find(s => s.userId === userId && s.id === serverId);
          if (!server || !server.ip) {
            sendToClient({
              type: "res", id: String(msg.id ?? ""), ok: false,
              error: { code: "SERVER_NOT_FOUND", message: "设备不存在或未配置 IP" },
            });
            return;
          }

          const host = server.ip;

          // 🔧 先保存旧连接引用，新连接成功后再断旧
          const oldTargetWs = targetWs;
          const oldTargetReady = targetReady;

          // 清空消息队列（旧设备的消息不再转发）
          messageQueue.length = 0;

          switchCallback = (err) => {
            if (err) {
              // ❌ 新连接失败 — 恢复旧连接
              console.error(`❌ [Lume-WS] device.switch 失败: ${err.message}`);
              // 恢复旧状态（connectToTarget 已清理 targetWs，但旧引用还在）
              if (oldTargetWs && oldTargetWs.readyState === WebSocket.OPEN && oldTargetReady) {
                targetWs = oldTargetWs;
                targetReady = true;
                console.log(`↩️ [Lume-WS] 恢复旧连接`);
              }
              sendToClient({
                type: "res", id: String(msg.id ?? ""), ok: false,
                error: { code: "SWITCH_FAILED", message: err.message },
              });
              switchCallback = null;
              return;
            }

            // ✅ 新连接成功 — 断开旧的
            if (oldTargetWs && oldTargetWs !== targetWs) {
              try {
                oldTargetWs.removeAllListeners();
                if (oldTargetWs.readyState === WebSocket.OPEN || oldTargetWs.readyState === WebSocket.CONNECTING) {
                  oldTargetWs.close(1000, "replaced");
                }
              } catch (_) {}
            }

            currentServerId = serverId;
            console.log(`✅ [Lume-WS] ${userId?.substring(0, 8)} 已切换到 ${server.name || serverId}`);

            (async () => {
              try {
                const db2 = await getDB();
                const u = db2.users?.find((x) => x.id === userId);
                if (u) {
                  u.activeServerId = serverId;
                  await saveDB(db2);
                }
              } catch (_) {}
            })();

            sendToClient({
              type: "res", id: String(msg.id ?? ""), ok: true,
              payload: {
                switched: true,
                serverId,
                serverName: server.name || serverId,
                serverIp: host,
              },
            });
            sendToClient({
              type: "event",
              event: "device.switched",
              payload: {
                serverId,
                serverName: server.name || serverId,
                serverIp: host,
              },
            });
            switchCallback = null;
          };

          // 🔧 不再 cleanupTarget()，而是直接创建新连接
          // connectToTarget 内部会 cleanupTarget，但我们在 switchCallback 里恢复
          // 改为：手动重置状态，让 connectToTarget 创建新连接
          targetReady = false;
          targetConnecting = false;
          targetWs = null;
          if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
          if (authTimer) { clearTimeout(authTimer); authTimer = null; }

          connectToTarget(host, switchCallback);

        } catch (err) {
          console.error(`❌ [Lume-WS] device.switch 异常:`, err);
          sendToClient({
            type: "res", id: String(msg.id ?? ""), ok: false,
            error: { code: "SWITCH_ERROR", message: String(err) },
          });
          switchCallback = null;
        }
      })();
    };

    // ── device.list 处理 ──

    const handleDeviceList = (msg) => {
      (async () => {
        try {
          const db = await getDB();
          const servers = getUserServers(db, userId);
          const user = db.users?.find(u => u.id === userId);
          const activeId = user?.activeServerId || servers[0]?.id;

          sendToClient({
            type: "res", id: String(msg.id ?? ""), ok: true,
            payload: {
              servers: servers.map(s => ({
                id: s.id,
                name: s.name,
                ip: s.ip,
                status: s.status,
                active: s.id === activeId,
              })),
              activeServerId: activeId,
            },
          });
        } catch (err) {
          sendToClient({
            type: "res", id: String(msg.id ?? ""), ok: false,
            error: { code: "LIST_ERROR", message: String(err) },
          });
        }
      })();
    };

    // ── 初始化连接 ──

    try {
      const token = req.query.token;
      if (!token) {
        clientWs.send(JSON.stringify({ type: "error", error: "未授权" }));
        clientWs.close();
        return;
      }

      let decoded;
      try {
        decoded = jwt.verify(String(token), JWT_SECRET);
        userId = decoded.userId;
      } catch (e) {
        clientWs.send(JSON.stringify({ type: "error", error: "登录已过期" }));
        clientWs.close();
        return;
      }

      const db = await getDB();
      const user = db.users?.find((u) => u.id === userId);
      if (!user) {
        clientWs.send(JSON.stringify({ type: "error", error: "用户不存在" }));
        clientWs.close();
        return;
      }

      currentServerId = user.activeServerId;
      const userServer = getActiveServer(db, userId);
      const host = userServer?.ip || process.env.LUME_WS_HOST || "127.0.0.1";

      resetIdleTimer();

      // 连接到活跃设备的 Lume
      connectToTarget(host, (err) => {
        if (err) {
          console.error(`❌ [Lume-WS] 初始连接失败: ${err.message}`);
          sendToClient({ type: "error", error: `初始连接失败: ${err.message}` });
          // 不关闭客户端连接，允许发 device.switch 重试
        }
      });

      // ── 客户端消息路由 ──

      clientWs.on("message", (data) => {
        resetIdleTimer();
        const raw = data.toString();

        let msg;
        try {
          msg = JSON.parse(raw);
        } catch (_) {
          return;
        }

        // 客户端 auth → proxy 代替后端响应（proxy 已在后端完成 auth）
        if (msg.method === "auth") {
          // 🔧 无论 targetReady 与否，直接回复客户端 auth 成功
          // proxy 自己在后端做了 auth，不需要客户端再 auth
          sendToClient({
            type: "res",
            id: String(msg.id ?? ""),
            ok: true,
            payload: {
              userId: userId,
              serverTime: Date.now(),
              sessionPrefix: `agent:main:user_${userId.substring(0, 8)}`,
              channel: "lume",
            },
          });
          return;
        }

        // 🔥 device.switch — 热切换后端
        if (msg.method === "device.switch") {
          handleDeviceSwitch(msg);
          return;
        }

        // device.list — 查询用户设备列表
        if (msg.method === "device.list") {
          handleDeviceList(msg);
          return;
        }

        // 其他方法：转发给当前后端
        console.log(`➡️ [Lume-WS] ${userId?.substring(0,8)} ${msg.method} (targetReady=${targetReady})`);
        if (targetWs?.readyState === WebSocket.OPEN && targetReady) {
          targetWs.send(raw);
        } else if (targetWs?.readyState === WebSocket.CONNECTING || !targetReady) {
          messageQueue.push(raw);
        } else {
          // 后端不可用
          sendToClient({
            type: "res", id: String(msg.id ?? ""), ok: false,
            error: { code: "BACKEND_UNAVAILABLE", message: "后端设备未连接，请先切换设备" },
          });
        }
      });

      clientWs.on("close", () => {
        console.log(`👋 [Lume-WS] ${userId?.substring(0, 8)} 客户端断开`);
        cleanupAll();
      });

      clientWs.on("error", () => {
        cleanupAll();
      });

    } catch (err) {
      console.error("❌ [Lume-WS] proxy error:", err);
      cleanupAll();
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", error: "代理初始化失败" }));
        clientWs.close();
      }
    }
  });
}
