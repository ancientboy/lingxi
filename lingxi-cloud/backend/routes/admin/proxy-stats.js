/**
 * 代理统计路由 - 转发到 ai-proxy-lite (13000)
 */

import { Router } from "express";

const router = Router();
const PROXY_BASE = "http://localhost:13000";

// GET /api/admin/proxy-stats - 总览
router.get("/", async (req, res) => {
  try {
    const r = await fetch(`${PROXY_BASE}/api/stats`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: "代理统计服务不可用", detail: e.message });
  }
});

// GET /api/admin/proxy-stats/days - 每日统计
router.get("/days", async (req, res) => {
  try {
    const r = await fetch(`${PROXY_BASE}/api/stats/days`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: "代理统计服务不可用", detail: e.message });
  }
});

// GET /api/admin/proxy-stats/ip/:ip - IP 详情
router.get("/ip/:ip", async (req, res) => {
  try {
    const r = await fetch(`${PROXY_BASE}/api/stats/ip/${req.params.ip}`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: "代理统计服务不可用", detail: e.message });
  }
});

export default router;
