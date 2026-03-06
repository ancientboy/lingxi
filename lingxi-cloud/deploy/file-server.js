/**
 * OpenClaw 文件服务
 * 
 * 提供静态文件访问（图片、PDF等）
 * 端口: 9876
 * 
 * 使用方法：
 * 1. 复制到用户实例目录
 * 2. pm2 start file-server.js --name file-server
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.FILE_SERVER_PORT || 9876;
const TOKEN = process.env.FILE_SERVER_TOKEN || 'lingxi-file-server-2026';

// 用户 workspace 目录
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || path.join(__dirname, 'workspace');

// CORS 设置
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-file-token');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Token 验证中间件（可选）
function validateToken(req, res, next) {
  const token = req.headers['x-file-token'] || req.query.token;
  
  // 如果 URL 中包含 token 参数，跳过验证
  if (req.query.token) {
    return next();
  }
  
  // 生产环境建议启用 token 验证
  // if (token !== TOKEN) {
  //   return res.status(403).json({ error: 'Invalid token' });
  // }
  
  next();
}

/**
 * GET /health
 * 健康检查
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

/**
 * GET /list
 * 列出文件
 */
app.get('/list', validateToken, (req, res) => {
  try {
    const targetPath = req.query.path || '';
    const fullPath = path.join(WORKSPACE_DIR, targetPath);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }
    
    const items = fs.readdirSync(fullPath, { withFileTypes: true });
    const files = items.map(item => ({
      name: item.name,
      type: item.isDirectory() ? 'directory' : 'file',
      size: item.isFile() ? fs.statSync(path.join(fullPath, item.name)).size : 0
    }));
    
    res.json({ files, path: targetPath });
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /preview
 * 预览文件（图片、PDF等）
 */
app.get('/preview', validateToken, (req, res) => {
  try {
    const targetPath = req.query.path;
    if (!targetPath) {
      return res.status(400).json({ error: 'Path is required' });
    }
    
    const fullPath = path.join(WORKSPACE_DIR, targetPath);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // 获取文件扩展名
    const ext = path.extname(fullPath).toLowerCase();
    const contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.html': 'text/html'
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /download
 * 下载文件
 */
app.get('/download', validateToken, (req, res) => {
  try {
    const targetPath = req.query.path;
    if (!targetPath) {
      return res.status(400).json({ error: 'Path is required' });
    }
    
    const fullPath = path.join(WORKSPACE_DIR, targetPath);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const filename = path.basename(fullPath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /files/*
 * 静态文件访问（直接通过 URL 访问）
 * 
 * 示例: http://ip:9876/files/chart.png
 */
app.use('/files', validateToken, express.static(WORKSPACE_DIR, {
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
      '.pdf': 'application/pdf'
    };
    
    if (contentTypes[ext]) {
      res.setHeader('Content-Type', contentTypes[ext]);
    }
  }
}));

// 启动服务
app.listen(PORT, '0.0.0.0', () => {
  console.log(`📁 OpenClaw 文件服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`📂 文件目录: ${WORKSPACE_DIR}`);
  console.log(`🔗 预览示例: http://localhost:${PORT}/files/image.png`);
});
