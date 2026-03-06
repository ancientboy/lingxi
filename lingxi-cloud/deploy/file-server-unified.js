const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 9876;

// 鉴权 token（与灵犀云后端共享）
const AUTH_TOKEN = process.env.FILE_SERVER_TOKEN || 'lingxi-file-server-2026';

// OpenClaw workspace 目录
const WORKSPACE_BASE = '/root/.openclaw/workspace';

// 鉴权中间件（可选）
function authMiddleware(req, res, next) {
  const token = req.headers['x-file-token'] || req.query.token;

  // 生产环境建议启用鉴权
  // if (token !== AUTH_TOKEN) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

  next();
}

// 安全路径校验（防止目录穿越）
function safePath(userPath) {
  const resolved = path.resolve(WORKSPACE_BASE, userPath || '');
  if (!resolved.startsWith(WORKSPACE_BASE)) {
    return null;
  }
  return resolved;
}

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-file-token');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 列出文件
app.get('/list', authMiddleware, (req, res) => {
  const targetPath = safePath(req.query.path || '');
  if (!targetPath) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  try {
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const items = fs.readdirSync(targetPath, { withFileTypes: true });
    const files = items.map(item => ({
      name: item.name,
      type: item.isDirectory() ? 'directory' : 'file',
      size: item.isFile() ? fs.statSync(path.join(targetPath, item.name)).size : 0,
      modified: fs.statSync(path.join(targetPath, item.name)).mtime
    }));

    res.json({
      path: req.query.path || '/',
      files
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 下载文件
app.get('/download', authMiddleware, (req, res) => {
  const filePath = safePath(req.query.path);
  if (!filePath) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (fs.statSync(filePath).isDirectory()) {
      return res.status(400).json({ error: 'Path is a directory' });
    }

    const filename = path.basename(filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 预览文件（图片、PDF等）
app.get('/preview', authMiddleware, (req, res) => {
  const filePath = safePath(req.query.path);
  if (!filePath) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return res.status(404).json({ error: 'File not found' });
    }

    // 设置 Content-Type
    const ext = path.extname(filePath).toLowerCase();
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

    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔧 新增：静态文件路由 /files/*
app.use('/files', authMiddleware, express.static(WORKSPACE_BASE, {
  setHeaders: (res, filePath) => {
    // 设置 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 设置正确的 Content-Type
    const ext = path.extname(filePath).toLowerCase();
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

    if (contentTypes[ext]) {
      res.setHeader('Content-Type', contentTypes[ext]);
    }
  }
}));

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    port: PORT,
    workspace: WORKSPACE_BASE,
    exists: fs.existsSync(WORKSPACE_BASE),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 OpenClaw File Server running on port ' + PORT);
  console.log('📂 Workspace: ' + WORKSPACE_BASE);
  console.log('🔗 Preview: http://localhost:' + PORT + '/files/image.png');
});
