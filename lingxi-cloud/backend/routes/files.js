/**
 * 文件代理路由
 * 
 * 从用户实例拉取文件，提供预览和下载
 * - 代理到用户实例的 openclaw-file-server (端口 9876)
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// 文件服务 token（与用户实例共享）
const FILE_SERVER_TOKEN = process.env.FILE_SERVER_TOKEN || 'lingxi-file-server-2026';

// 临时文件存储目录
const TEMP_DIR = join(__dirname, '../temp-files');

// 确保临时目录存在
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// 读取数据库
function getDB() {
  const dbPath = join(__dirname, '../data/db.json');
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

// 获取用户的服务器信息
function getUserServer(userId) {
  const db = getDB();
  const servers = db.userServers || [];
  return servers.find(s => s.userId === userId && s.status === 'running');
}

// 认证中间件（简单版，实际应使用 JWT）
function authMiddleware(req, res, next) {
  // 从 header 或 query 获取 token
  const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  // 这里简化处理，实际应验证 JWT
  // 从 token 解析 userId（假设 token 是 userId）
  req.userId = token;
  next();
}

/**
 * GET /api/files/list
 * 列出用户实例的文件
 * 
 * Query:
 * - path: 目录路径（默认 /）
 */
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const server = getUserServer(req.userId);
    if (!server) {
      return res.status(404).json({ error: 'No running server found for user' });
    }

    const { ip } = server;
    const targetPath = req.query.path || '';
    
    const response = await axios.get(`http://${ip}:9876/list`, {
      params: { path: targetPath },
      headers: { 'x-file-token': FILE_SERVER_TOKEN },
      timeout: 10000
    });

    res.json(response.data);
  } catch (err) {
    console.error('List files error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/files/preview
 * 预览文件（图片、PDF等）
 * 
 * Query:
 * - path: 文件路径
 */
router.get('/preview', authMiddleware, async (req, res) => {
  try {
    const server = getUserServer(req.userId);
    if (!server) {
      return res.status(404).json({ error: 'No running server found for user' });
    }

    const { ip } = server;
    const targetPath = req.query.path;
    
    if (!targetPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const response = await axios.get(`http://${ip}:9876/preview`, {
      params: { path: targetPath },
      headers: { 'x-file-token': FILE_SERVER_TOKEN },
      responseType: 'arraybuffer',
      timeout: 30000
    });

    // 转发 Content-Type
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Content-Disposition', response.headers['content-disposition'] || 'inline');
    res.send(response.data);
  } catch (err) {
    console.error('Preview file error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/files/download
 * 下载文件
 * 
 * Query:
 * - path: 文件路径
 */
router.get('/download', authMiddleware, async (req, res) => {
  try {
    const server = getUserServer(req.userId);
    if (!server) {
      return res.status(404).json({ error: 'No running server found for user' });
    }

    const { ip } = server;
    const targetPath = req.query.path;
    
    if (!targetPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const response = await axios.get(`http://${ip}:9876/download`, {
      params: { path: targetPath },
      headers: { 'x-file-token': FILE_SERVER_TOKEN },
      responseType: 'arraybuffer',
      timeout: 60000
    });

    // 获取文件名
    const filename = path.basename(targetPath);
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(response.data);
  } catch (err) {
    console.error('Download file error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/files/pull
 * 拉取文件到灵犀云后端（用于缓存/预览）
 * 
 * Body:
 * - path: 文件路径
 * 
 * 返回: 预览 URL
 */
router.post('/pull', authMiddleware, async (req, res) => {
  try {
    const server = getUserServer(req.userId);
    if (!server) {
      return res.status(404).json({ error: 'No running server found for user' });
    }

    const { ip } = server;
    const targetPath = req.body.path;
    
    if (!targetPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    // 从用户实例拉取文件
    const response = await axios.get(`http://${ip}:9876/download`, {
      params: { path: targetPath },
      headers: { 'x-file-token': FILE_SERVER_TOKEN },
      responseType: 'arraybuffer',
      timeout: 60000
    });

    // 生成唯一文件名
    const ext = path.extname(targetPath);
    const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`;
    const tempPath = join(TEMP_DIR, filename);

    // 保存到临时目录
    fs.writeFileSync(tempPath, response.data);

    // 返回预览 URL
    res.json({
      success: true,
      previewUrl: `/api/files/temp/${filename}`,
      filename: path.basename(targetPath),
      size: response.data.length
    });
  } catch (err) {
    console.error('Pull file error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/files/temp/:filename
 * 访问临时文件（用于预览）
 */
router.get('/temp/:filename', (req, res) => {
  const { filename } = req.params;
  const tempPath = join(TEMP_DIR, filename);

  if (!fs.existsSync(tempPath)) {
    return res.status(404).json({ error: 'File not found or expired' });
  }

  // 设置 Content-Type
  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json'
  };

  const contentType = contentTypes[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', 'inline');

  fs.createReadStream(tempPath).pipe(res);
});

/**
 * 清理过期临时文件（3天）
 * 可以通过 cron 定时调用
 */
router.post('/cleanup', async (req, res) => {
  try {
    const result = cleanupTempFiles();
    res.json(result);
  } catch (err) {
    console.error('Cleanup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 清理临时文件的实现
 */
export function cleanupTempFiles() {
  const files = fs.readdirSync(TEMP_DIR);
  const now = Date.now();
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  let cleaned = 0;

  for (const file of files) {
    const filePath = join(TEMP_DIR, file);
    const stat = fs.statSync(filePath);
    
    if (now - stat.mtimeMs > threeDays) {
      fs.unlinkSync(filePath);
      cleaned++;
    }
  }

  console.log(`🧹 清理临时文件: 删除 ${cleaned} 个，剩余 ${files.length - cleaned} 个`);
  return { success: true, cleaned, remaining: files.length - cleaned };
}

export default router;
