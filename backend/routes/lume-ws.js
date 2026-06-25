import { Router } from "express";
import jwt from "jsonwebtoken";
import net from "node:net";
import config from "../config/index.js";
import { getDB } from "../utils/db.js";
import { getActiveServer } from "../utils/activeServer.js";
import { callOpenClawRPC } from "../utils/openclaw-rpc.js";

const router = Router();
const JWT_SECRET = config.security.jwtSecret;
const LUME_PORT = Number(process.env.LUME_WS_PORT || "18790");
const LUME_SECRET = process.env.LUME_WS_SECRET || "lume-secret-2026";
const PROBE_TIMEOUT_MS = 5000; // 5秒，避免 NAT 回环延迟

/** TCP probe — check if Lume WS port is open on target host */
// 缓存探测结果 30 秒，避免频繁探测导致误判
let _probeCache = new Map(); // key: host:port → { result, expireAt }
function probeLumePort(host, port = LUME_PORT, timeoutMs = PROBE_TIMEOUT_MS) {
  const cacheKey = `${host}:${port}`;
  const cached = _probeCache.get(cacheKey);
  if (cached && cached.expireAt > Date.now()) {
    return Promise.resolve(cached.result);
  }
  return new Promise((resolve) => {
    if (!host) return resolve(false);
    const socket = net.connect({ host, port, timeout: timeoutMs }, () => {
      socket.destroy();
      _probeCache.set(cacheKey, { result: true, expireAt: Date.now() + 30000 });
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function buildCloudWsUrl(req, jwtToken) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const wsProto = proto === "https" ? "wss" : "ws";
  const hostHeader =
    req.headers["x-forwarded-host"] || req.headers.host || "lumeword.cn";
  return `${wsProto}://${hostHeader}/api/lume-ws?token=${encodeURIComponent(jwtToken)}`;
}

function buildRoutingContext(db, user) {
  const userServer = getActiveServer(db, user.id);
  const hasCloudServer = Boolean(userServer?.ip);
  const cloudServerRunning =
    userServer?.status === "running" && Boolean(userServer?.ip);
  const recommendLocalFirst = !cloudServerRunning;
  const defaultConnectionMode = cloudServerRunning ? "cloud" : "auto";
  const localWsUrl = `ws://127.0.0.1:${LUME_PORT}`;

  return {
    userId: user.id,
    hasCloudServer,
    cloudServerRunning,
    recommendLocalFirst,
    defaultConnectionMode,
    localWsUrl,
    localSecret: LUME_SECRET,
    serverId: userServer?.id || user.activeServerId || null,
    serverIp: userServer?.ip || null,
    serverName: userServer?.name || null,
  };
}

/** Lume OpenClaw 插件 WebSocket 连接信息（本机 / 云端路由 + 付费云端代理） */
router.get("/connect-info", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "未登录" });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, error: "登录已过期" });
  }

  const db = await getDB();
  const user = db.users?.find((u) => u.id === decoded.userId);
  if (!user) {
    return res.status(401).json({ success: false, error: "用户不存在" });
  }

  const sub = user.subscription || {};
  const plan = sub.plan || "free";
  const isPaid =
    plan !== "free" &&
    (sub.status === "active" ||
      !sub.endDate ||
      new Date(sub.endDate) > new Date());

  const routing = buildRoutingContext(db, user);
  const jwtToken = authHeader.substring(7);

  if (!isPaid) {
    return res.json({
      success: true,
      data: {
        mode: "free",
        lumeAvailable: false,
        wsUrl: null,
        secret: null,
        authHandled: false,
        ...routing,
        cloudWsUrl: null,
      },
    });
  }

  const host =
    routing.serverIp ||
    process.env.LUME_WS_HOST ||
    "120.55.192.144";

  const lumeAvailable = await probeLumePort(host, LUME_PORT);
  const wsUrl = buildCloudWsUrl(req, jwtToken);

  res.json({
    success: true,
    data: {
      mode: "lume",
      lumeAvailable,
      wsUrl,
      cloudWsUrl: wsUrl,
      authHandled: true,
      secret: null,
      ...routing,
      serverIp: host,
    },
  });
});


/** HTTP 备份：sessions.list（设备切换时 WS 竞态 fallback） */
router.get("/sessions", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "未登录" });
  }
  let decoded;
  try {
    decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, error: "登录已过期" });
  }
  const db = await getDB();
  const user = db.users?.find((u) => u.id === decoded.userId);
  if (!user) return res.status(401).json({ success: false, error: "用户不存在" });

  const userServer = getActiveServer(db, user.id);
  if (!userServer?.ip) {
    return res.status(400).json({ success: false, error: "无可用设备" });
  }

  const limit = Math.min(Number(req.query.limit) || 100, 200);
  try {
    const result = await callOpenClawRPC(userServer, "sessions.list", {
      limit,
      includeLastMessage: true,
      includeDerivedTitles: true,
    });
    const sessions = result?.payload?.sessions ?? result?.sessions ?? [];
    return res.json({ success: true, sessions, serverId: userServer.id });
  } catch (err) {
    console.error("[lume] GET /sessions:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
