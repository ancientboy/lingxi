/**
 * Cron 定时任务代理 API（精简版：设备列表）
 */

import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';

const router = Router();

router.use(verifyToken);

router.get('/servers', async (req, res) => {
  const db = await getDB();
  const servers = (db.userServers || []).filter((s) => s.userId === req.user.id);
  const activeServer = getActiveServer(db, req.user.id);

  const list = servers.map((s) => ({
    id: s.id,
    name: s.name || s.description || s.ip,
    ip: s.ip,
    openclawPort: s.openclawPort,
    isActive: activeServer?.id === s.id,
  }));

  res.json({ success: true, servers: list, activeServerId: activeServer?.id || null });
});

export default router;
