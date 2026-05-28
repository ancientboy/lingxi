/**
 * 文件下载路由
 * 
 * 提供安全的文件下载，不暴露服务器 IP 和真实路径
 * - /api/downloads/:filename - 下载文件
 * - /api/downloads/list - 列出可下载文件
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// 共享文件目录
const SHARED_DIR = '/root/.openclaw/workspace/shared';

// 允许的下载目录白名单
const ALLOWED_DIRS = [
  '/root/.openclaw/workspace/shared',
  '/home/admin/.openclaw/workspace/lingxi-cloud/uploads'
];

/**
 * 安全检查：确保文件路径在允许的目录内
 */
function isPathSafe(filePath) {
  const resolvedPath = path.resolve(filePath);
  return ALLOWED_DIRS.some(dir => resolvedPath.startsWith(dir));
}

/**
 * GET /api/downloads/list
 * 列出可下载的文件
 */
router.get('/list', (req, res) => {
  try {
    const files = [];
    
    // 扫描 shared 目录
    if (fs.existsSync(SHARED_DIR)) {
      const entries = fs.readdirSync(SHARED_DIR);
      for (const entry of entries) {
        const filePath = path.join(SHARED_DIR, entry);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile() && /\.(docx|pdf|html|md|txt|zip)$/.test(entry)) {
          files.push({
            name: entry,
            size: stat.size,
            mtime: stat.mtime,
            url: `/api/downloads/${encodeURIComponent(entry)}`
          });
        }
      }
    }
    
    // 扫描 uploads 目录
    const uploadsDir = path.join(__dirname, '../uploads');
    if (fs.existsSync(uploadsDir)) {
      const entries = fs.readdirSync(uploadsDir);
      for (const entry of entries) {
        const filePath = path.join(uploadsDir, entry);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile() && /\.(docx|pdf|html|md|txt|zip)$/.test(entry)) {
          files.push({
            name: entry,
            size: stat.size,
            mtime: stat.mtime,
            url: `/api/downloads/${encodeURIComponent(entry)}`
          });
        }
      }
    }
    
    // 按修改时间排序（最新的在前）
    files.sort((a, b) => b.mtime - a.mtime);
    
    res.json({
      success: true,
      files: files,
      total: files.length
    });
  } catch (err) {
    console.error('List downloads error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/downloads/:filename
 * 下载文件
 */
router.get('/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // 解码文件名
    const decodedFilename = decodeURIComponent(filename);
    
    // 可能的文件路径
    const possiblePaths = [
      path.join(SHARED_DIR, decodedFilename),
      path.join(__dirname, '../uploads', decodedFilename)
    ];
    
    // 查找文件
    let filePath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }
    
    if (!filePath) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // 安全检查
    if (!isPathSafe(filePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // 获取文件信息
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    // 设置 Content-Type
    const contentTypes = {
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pdf': 'application/pdf',
      '.html': 'text/html; charset=utf-8',
      '.md': 'text/markdown; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8',
      '.zip': 'application/zip'
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    // 设置响应头
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    // 发送文件
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/downloads/preview/:filename
 * 预览文件（不下载，直接在浏览器打开）
 */
router.get('/preview/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const decodedFilename = decodeURIComponent(filename);
    
    // 可能的文件路径
    const possiblePaths = [
      path.join(SHARED_DIR, decodedFilename),
      path.join(__dirname, '../uploads', decodedFilename)
    ];
    
    // 查找文件
    let filePath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }
    
    if (!filePath) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // 安全检查
    if (!isPathSafe(filePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // 获取文件信息
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    // 设置 Content-Type
    const contentTypes = {
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pdf': 'application/pdf',
      '.html': 'text/html; charset=utf-8',
      '.md': 'text/markdown; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    // 设置响应头（inline 表示在浏览器打开）
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    // 发送文件
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (err) {
    console.error('Preview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
