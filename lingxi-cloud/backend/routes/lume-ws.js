import { Router } from "express";
import jwt from "jsonwebtoken";
import config from "../config/index.js";
import { getDB } from "../utils/db.js";
import { getActiveServer } from "../utils/activeServer.js";
import { callOpenClawRPC } from "../utils/openclaw-rpc.js";
import { probeTcp } from "../utils/port-probe.js";
import { OPENCLAW_PORT, LUME_PLUGIN_PORT } from "../utils/openclaw-deploy-constants.js";

const router = Router();
const JWT_SECRET = config.security.jwtSecret;
const LUME_PORT = LUME_PLUGIN_PORT;
const LUME_SECRET = process.env.LUME_WS_SECRET || "lume-secret-2026";
const PROBE_TIMEOUT_MS = 5000;

function probePortCached(host, port, timeoutMs = PROBE_TIMEOUT_MS) {
  return probeTcp(host, port, timeoutMs);
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
    serverOpenclawPort: userServer?.openclawPort || OPENCLAW_PORT,
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

  const gatewayPort = routing.serverOpenclawPort || OPENCLAW_PORT;
  const gatewayAvailable = await probePortCached(host, gatewayPort);
  const lumePluginAvailable = await probePortCached(host, LUME_PORT);
  const wsUrl = buildCloudWsUrl(req, jwtToken);
  const transport = gatewayAvailable ? "gateway" : lumePluginAvailable ? "lume" : "gateway";

  res.json({
    success: true,
    data: {
      mode: "lume",
      transport,
      gatewayAvailable,
      lumePluginAvailable,
      lumeAvailable: gatewayAvailable || lumePluginAvailable,
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
