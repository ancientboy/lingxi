import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getDB } from '../utils/db.js';
import { getActiveServer } from '../utils/activeServer.js';
import axios from 'axios';

const router = Router();

const FILE_API_PORT = 9092;

/** GET /api/file-explorer/list?path=/root — 列出目录 */
router.get('/list', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const server = getActiveServer(db, req.user.id);
    if (!server) return res.status(404).json({ error: '没有可用的服务器' });

    const dirPath = req.query.path || '/root';
    const { data } = await axios.get(`http://${server.ip}:${FILE_API_PORT}/api/list`, {
      params: { path: dirPath },
      headers: { 'Authorization': `Bearer ${server.openclawToken}` },
      timeout: 8000,
    });

    res.json(data);
  } catch (e) {
    const msg = e.response?.data?.error || e.message;
    console.error('❌ file-explorer/list:', msg);
    res.status(500).json({ error: msg });
  }
});

/** GET /api/file-explorer/get?path=/root/file.txt — 读取文件 */
router.get('/get', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const server = getActiveServer(db, req.user.id);
    if (!server) return res.status(404).json({ error: '没有可用的服务器' });

    const filePath = req.query.path || '';
    if (!filePath) return res.status(400).json({ error: '缺少 path 参数' });

    const { data } = await axios.get(`http://${server.ip}:${FILE_API_PORT}/api/get`, {
      params: { path: filePath },
      headers: { 'Authorization': `Bearer ${server.openclawToken}` },
      timeout: 10000,
    });

    res.json(data);
  } catch (e) {
    const msg = e.response?.data?.error || e.message;
    console.error('❌ file-explorer/get:', msg);
    res.status(500).json({ error: msg });
  }
});

/** GET /api/file-explorer/status — 检查文件 API 是否已安装 */
router.get('/status', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const server = getActiveServer(db, req.user.id);
    if (!server) return res.json({ installed: false });

    const { data } = await axios.get(`http://${server.ip}:${FILE_API_PORT}/api/health`, {
      headers: { 'Authorization': `Bearer ${server.openclawToken}` },
      timeout: 3000,
    });
    res.json({ installed: data.ok });
  } catch (e) {
    res.json({ installed: false });
  }
});

export default router;
