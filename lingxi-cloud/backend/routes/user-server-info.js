/**
 * 用户服务器信息 API
 * 
 * 获取当前用户的服务器信息（IP、端口等）
 */

import express from 'express';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// JWT 密钥（从环境变量获取）
const JWT_SECRET = process.env.JWT_SECRET || 'lingxi-cloud-secret-2026';

// 认证中间件
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.userId };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token 无效' });
  }
}

// 读取数据库
async function getDB() {
  const dbPath = join(__dirname, '../data/db.json');
  const data = await readFile(dbPath, 'utf8');
  return JSON.parse(data);
}

/**
 * GET /api/user/server
 * 获取当前用户的服务器信息
 */
router.get('/server', authMiddleware, async (req, res) => {
  try {
    // 从 JWT 获取用户 ID
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const db = await getDB();
    const server = db.userServers?.find(s => s.userId === userId && s.status === 'running');

    if (!server) {
      return res.status(404).json({ error: '未找到运行中的服务器' });
    }

    // 文件服务 token（从环境变量获取）
    const fileServerToken = process.env.FILE_SERVER_TOKEN || 'lingxi-file-server-2026';

    // 返回服务器信息
    res.json({
      serverIp: server.ip,
      openclawPort: server.openclawPort,
      fileServerPort: 9876, // 文件服务固定端口
      fileServerToken, // 文件服务 token
      status: server.status,
      serverId: server.id
    });

  } catch (err) {
    console.error('获取服务器信息失败:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
