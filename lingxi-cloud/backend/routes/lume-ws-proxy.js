/**
 * Lume WebSocket WSS 代理 — 客户端经 lumeword.cn 连接，后端转发至活跃设备 18790
 * 支持 device.list / device.switch（热切换后端，不断开客户端 WS）
 */

import expressWs from "express-ws";
import WebSocket from "ws";
import jwt from "jsonwebtoken";
import config from "../config/index.js";
import { getDB, saveDB } from "../utils/db.js";
import { getActiveServer, getUserServers } from "../utils/activeServer.js";
import { resolveLumeModel } from "../utils/model-route.js";

const JWT_SECRET = config.security.jwtSecret;
const LUME_PORT = Number(process.env.LUME_WS_PORT || "18790");
const LUME_SECRET = process.env.LUME_WS_SECRET || "lume-secret-2026";
const CONNECT_TIMEOUT_MS = 12_000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const SELF_HOST_IPS = new Set(["120.55.192.144", "127.0.0.1", "localhost"]);

function resolveLumeHost(ip) {
  if (!ip) return "127.0.0.1";
  if (SELF_HOST_IPS.has(ip)) return "127.0.0.1";
  return ip;
}

function buildTargetUrl(server) {
  const host = resolveLumeHost(server?.ip);
  return `ws://${host}:${LUME_PORT}`;
}

export function setupLumeWebSocketProxy(app) {
  expressWs(app);

  app.ws("/api/lume-ws", async (clientWs, req) => {
    let targetWs = null;
    let userId = null;
    let userPreferredModel = null;
    let currentServer = null;
    let currentServerId = null;
    const messageQueue = [];
    let targetReady = false;
    let connectTimer = null;
    let idleTimer = null;
    let switching = false;

    const cleanup = () => {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (targetWs) {
        try {
          if (targetWs.readyState === WebSocket.OPEN || targetWs.readyState === WebSocket.CONNECTING) {
            targetWs.close(1000, "proxy cleanup");
          }
        } catch (_) {}
        targetWs = null;
      }
      targetReady = false;
    };

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        cleanup();
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

    const sendToClient = (obj) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(obj));
      }
    };

    const bindTargetHandlers = () => {
      if (!targetWs) return;

      targetWs.on("message", (data) => {
        resetIdleTimer();
        const raw = data.toString();

        if (!targetReady) {
          try {
            const msg = JSON.parse(raw);
            if (msg.type === "res" && msg.ok === true && msg.payload?.userId) {
              targetReady = true;
              console.log(`✅ [Lume-WS] ${userId.substring(0, 8)} Lume auth 成功 → ${currentServer?.name || currentServerId}`);
              flushQueue();
            }
            if (msg.type === "res" && msg.ok === false) {
              console.error(`❌ [Lume-WS] ${userId.substring(0, 8)} Lume auth 失败`);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(raw);
                clientWs.close(4003, "lume auth failed");
              }
              cleanup();
              return;
            }
          } catch (_) {}
        }

        try {
          const parsed = JSON.parse(raw);
          if (parsed.type === "event" && parsed.event === "chat") {
            const s = parsed.payload?.state;
            const runId = parsed.payload?.runId;
            const msgLen = (parsed.payload?.message || "").length;
            console.log(`📤 [Lume-WS] chat event → state=${s}, runId=${runId?.substring(0, 12)}, msgLen=${msgLen}`);
          }
        } catch (_) {}

        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(raw);
        }
      });

      targetWs.on("error", (err) => {
        console.error(`❌ [Lume-WS] ${userId?.substring(0, 8)} target error:`, err.message);
        if (!switching && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: "error", error: "Lume 连接异常" }));
          clientWs.close(1011, "target error");
        }
        cleanup();
      });

      targetWs.on("close", () => {
        if (!switching && clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1000, "target closed");
        }
        if (!switching) cleanup();
      });
    };

    const connectToServer = (server, { reason = "init" } = {}) =>
      new Promise((resolve, reject) => {
        if (!server?.ip) {
          reject(new Error("设备无可用 IP"));
          return;
        }

        switching = true;
        targetReady = false;
        messageQueue.length = 0;

        if (targetWs) {
          try {
            targetWs.removeAllListeners();
            if (targetWs.readyState === WebSocket.OPEN || targetWs.readyState === WebSocket.CONNECTING) {
              targetWs.close(1000, "switching device");
            }
          } catch (_) {}
          targetWs = null;
        }

        currentServer = server;
        currentServerId = server.id;
        const targetUrl = buildTargetUrl(server);
        console.log(`🔌 [Lume-WS] ${userId.substring(0, 8)} ${reason} → ${targetUrl} (${server.name || server.id})`);

        targetWs = new WebSocket(targetUrl);
        bindTargetHandlers();

        if (connectTimer) clearTimeout(connectTimer);
        connectTimer = setTimeout(() => {
          if (targetWs?.readyState === WebSocket.CONNECTING) {
            console.error(`⏱️ [Lume-WS] ${userId.substring(0, 8)} 连接 Lume 超时`);
            switching = false;
            cleanup();
            reject(new Error("Lume 服务连接超时"));
          }
        }, CONNECT_TIMEOUT_MS);

        const onOpen = () => {
          if (connectTimer) {
            clearTimeout(connectTimer);
            connectTimer = null;
          }
          const authMsg = JSON.stringify({
            id: `proxy-auth-${Date.now()}`,
            method: "auth",
            params: { token: LUME_SECRET, userId },
          });
          targetWs.send(authMsg);
          console.log(`🔐 [Lume-WS] ${userId.substring(0, 8)} 已发送 Lume auth`);
        };

        const onFirstAuthOk = (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === "res" && msg.ok === true && msg.payload?.userId) {
              targetWs.off("message", onFirstAuthOk);
              switching = false;
              resolve(server);
            }
            if (msg.type === "res" && msg.ok === false) {
              targetWs.off("message", onFirstAuthOk);
              switching = false;
              reject(new Error("Lume auth 失败"));
            }
          } catch (_) {}
        };

        targetWs.on("open", onOpen);
        targetWs.on("message", onFirstAuthOk);

        targetWs.on("error", (err) => {
          switching = false;
          reject(err);
        });
      });

    const handleDeviceList = async (msg) => {
      const db = await getDB();
      const servers = getUserServers(db, userId).map((s) => ({
        id: s.id,
        name: s.name,
        ip: s.ip,
        status: s.status || "unknown",
        openclawPort: s.openclawPort,
        isActive: s.id === currentServerId,
      }));
      sendToClient({
        type: "res",
        id: msg.id,
        ok: true,
        payload: { servers, activeServerId: currentServerId },
      });
    };

    const handleDeviceSwitch = async (msg) => {
      const serverId = msg.params?.serverId?.toString();
      if (!serverId) {
        sendToClient({ type: "res", id: msg.id, ok: false, error: "缺少 serverId" });
        return;
      }

      try {
        const db = await getDB();
        const server = db.userServers?.find((s) => s.userId === userId && s.id === serverId);
        if (!server) {
          sendToClient({ type: "res", id: msg.id, ok: false, error: "设备不存在" });
          return;
        }

        const user = db.users?.find((u) => u.id === userId);
        if (user) {
          user.activeServerId = serverId;
          await saveDB(db);
        }

        await connectToServer(server, { reason: "device.switch" });

        sendToClient({
          type: "res",
          id: `proxy-ready-${Date.now()}`,
          ok: true,
          payload: {
            userId,
            sessionPrefix: `user_${userId.substring(0, 8)}`,
            serverId: server.id,
            serverName: server.name,
          },
        });

        sendToClient({
          type: "res",
          id: msg.id,
          ok: true,
          payload: {
            serverId: server.id,
            serverName: server.name,
            serverIp: server.ip,
          },
        });

        sendToClient({
          type: "event",
          event: "device.switched",
          payload: {
            serverId: server.id,
            serverName: server.name,
            serverIp: server.ip,
          },
        });

        console.log(`🖥️ [Lume-WS] ${userId.substring(0, 8)} 已切换到 ${server.name} (${server.ip})`);
      } catch (err) {
        console.error(`❌ [Lume-WS] device.switch 失败:`, err.message);
        sendToClient({ type: "res", id: msg.id, ok: false, error: err.message || "切换失败" });
      }
    };

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

      userPreferredModel = user?.preferredModel || null;
      const userServer = getActiveServer(db, userId);
      if (!userServer?.ip) {
        clientWs.send(JSON.stringify({ type: "error", error: "无可用设备" }));
        clientWs.close();
        return;
      }

      resetIdleTimer();
        await connectToServer(userServer, { reason: "connect" });

        sendToClient({
          type: "res",
          id: `proxy-ready-${Date.now()}`,
          ok: true,
          payload: {
            userId,
            sessionPrefix: `user_${userId.substring(0, 8)}`,
            serverId: currentServerId,
            serverName: currentServer?.name,
          },
        });

      clientWs.on("message", async (data) => {
        resetIdleTimer();
        let raw = data.toString();

        try {
          const msg = JSON.parse(raw);
          if (msg.method === "auth") return;

          if (msg.method === "device.list") {
            await handleDeviceList(msg);
            return;
          }
          if (msg.method === "device.switch") {
            await handleDeviceSwitch(msg);
            return;
          }

          if (msg.method === "chat" || msg.method === "sendMessage") {
            const resolved = resolveLumeModel(msg.params?.model, userPreferredModel);
            if (resolved) {
              msg.params = msg.params || {};
              msg.params.model = resolved;
              raw = JSON.stringify(msg);
            }
          }
        } catch (_) {}

        if (switching) {
          messageQueue.push(raw);
          return;
        }

        if (targetWs?.readyState === WebSocket.OPEN && targetReady) {
          targetWs.send(raw);
        } else {
          messageQueue.push(raw);
        }
      });

      clientWs.on("close", () => {
        cleanup();
      });

      clientWs.on("error", (err) => {
        console.error(`❌ [Lume-WS] ${userId?.substring(0, 8)} client error:`, err.message);
        cleanup();
      });
    } catch (err) {
      console.error("❌ [Lume-WS] 代理异常:", err);
      cleanup();
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", error: "代理异常" }));
        clientWs.close(1011, "proxy error");
      }
    }
  });
}
