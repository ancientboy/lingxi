import { Router } from "express";
import jwt from "jsonwebtoken";
import net from "node:net";
import config from "../config/index.js";
import { getDB } from "../utils/db.js";
import { getActiveServer } from "../utils/activeServer.js";

const router = Router();
const JWT_SECRET = config.security.jwtSecret;
const LUME_PORT = Number(process.env.LUME_WS_PORT || "18790");
const LUME_SECRET = process.env.LUME_WS_SECRET || "lume-secret-2026";
const PROBE_TIMEOUT_MS = 2500;

/** TCP probe — check if Lume WS port is open on target host */
function probeLumePort(host, port = LUME_PORT, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!host) return resolve(false);
    const socket = net.connect({ host, port, timeout: timeoutMs }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** Lume OpenClaw 插件 WebSocket 连接信息（订阅用户，跟随活跃设备） */
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

  if (!isPaid) {
    return res.json({
      success: true,
      data: { mode: "free", lumeAvailable: false, wsUrl: null, secret: null },
    });
  }

  const userServer = getActiveServer(db, user.id);
  const host =
    userServer?.ip ||
    process.env.LUME_WS_HOST ||
    "120.55.192.144";

  const lumeAvailable = await probeLumePort(host, LUME_PORT);

  if (!lumeAvailable) {
    return res.json({
      success: true,
      data: {
        mode: "gateway",
        lumeAvailable: false,
        wsUrl: null,
        secret: null,
        userId: user.id,
        serverIp: host,
        serverName: userServer?.name || null,
        message: "当前设备未安装或未启动 Lume 插件，将使用 Gateway WebSocket",
      },
    });
  }

  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const wsProto = proto === "https" ? "wss" : "ws";
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host || "lumeword.cn";
  const jwtToken = authHeader.substring(7);
  const wsUrl = `${wsProto}://${hostHeader}/api/lume-ws?token=${encodeURIComponent(jwtToken)}`;

  // authHandled: false — Flutter 客户端需要自己发 auth 握手
  res.json({
    success: true,
    data: {
      mode: "lume",
      lumeAvailable: true,
      wsUrl,
      authHandled: false,
      secret: LUME_SECRET,
      userId: user.id,
      serverIp: host,
      serverName: userServer?.name || null,
    },
  });
});

export default router;
