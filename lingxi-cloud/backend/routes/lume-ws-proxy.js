/**
 * Lume WebSocket WSS 代理 — 客户端经 lumeword.cn 连接，后端转发至活跃设备 18790
 */

import expressWs from "express-ws";
import WebSocket from "ws";
import jwt from "jsonwebtoken";
import config from "../config/index.js";
import { getDB } from "../utils/db.js";
import { getActiveServer } from "../utils/activeServer.js";
import { resolveLumeModel } from "../utils/model-route.js";

const JWT_SECRET = config.security.jwtSecret;
const LUME_PORT = Number(process.env.LUME_WS_PORT || "18790");
const LUME_SECRET = process.env.LUME_WS_SECRET || "lume-secret-2026";
const CONNECT_TIMEOUT_MS = 12_000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export function setupLumeWebSocketProxy(app) {
  expressWs(app);

  app.ws("/api/lume-ws", async (clientWs, req) => {
    let targetWs = null;
    let userId = null;
    const messageQueue = [];
    let targetReady = false;
    let connectTimer = null;
    let idleTimer = null;

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
      while (messageQueue.length > 0 && targetWs?.readyState === WebSocket.OPEN) {
        targetWs.send(messageQueue.shift());
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

      const userServer = getActiveServer(db, userId);
      const host = userServer?.ip || process.env.LUME_WS_HOST || "127.0.0.1";
      const targetUrl = `ws://${host}:${LUME_PORT}`;
      const userPreferredModel = user?.preferredModel || null;

      console.log(`🔌 [Lume-WS] ${userId.substring(0, 8)} → ${targetUrl}`);

      targetWs = new WebSocket(targetUrl);
      resetIdleTimer();

      connectTimer = setTimeout(() => {
        if (targetWs?.readyState === WebSocket.CONNECTING) {
          console.error(`⏱️ [Lume-WS] ${userId.substring(0, 8)} 连接 Lume 超时`);
          cleanup();
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: "error", error: "Lume 服务连接超时" }));
            clientWs.close(1001, "connect timeout");
          }
        }
      }, CONNECT_TIMEOUT_MS);

      targetWs.on("open", () => {
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
      });

      targetWs.on("message", (data) => {
        resetIdleTimer();
        const raw = data.toString();

        if (!targetReady) {
          try {
            const msg = JSON.parse(raw);
            if (msg.type === "res" && msg.ok === true && msg.payload?.userId) {
              targetReady = true;
              console.log(`✅ [Lume-WS] ${userId.substring(0, 8)} Lume auth 成功`);
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

        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(raw);
        }
      });

      targetWs.on("error", (err) => {
        console.error(`❌ [Lume-WS] ${userId?.substring(0, 8)} target error:`, err.message);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: "error", error: "Lume 连接异常" }));
          clientWs.close(1011, "target error");
        }
        cleanup();
      });

      targetWs.on("close", () => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1000, "target closed");
        }
        cleanup();
      });

      clientWs.on("message", (data) => {
        resetIdleTimer();
        let raw = data.toString();

        try {
          const msg = JSON.parse(raw);
          if (msg.method === "auth") {
            return;
          }
          if (msg.method === "chat.send" && msg.params) {
            const resolved = resolveLumeModel(userPreferredModel || msg.params.model || "auto");
            msg.params.model = resolved;
            raw = JSON.stringify(msg);
            console.log(`🎯 [Lume-WS] ${userId.substring(0, 8)} chat.send 模型 → ${resolved}`);
          }
        } catch (_) {}

        if (targetWs?.readyState === WebSocket.OPEN && targetReady) {
          targetWs.send(raw);
        } else if (targetWs?.readyState === WebSocket.CONNECTING || !targetReady) {
          messageQueue.push(raw);
          if (targetReady) flushQueue();
        }
      });

      clientWs.on("close", () => {
        cleanup();
      });

      clientWs.on("error", () => {
        cleanup();
      });
    } catch (err) {
      console.error("❌ [Lume-WS] proxy error:", err);
      cleanup();
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", error: "代理初始化失败" }));
        clientWs.close();
      }
    }
  });
}
