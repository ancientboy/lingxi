#!/bin/bash
# 部署文件服务到已存在的用户服务器
#
# 使用方法:
# ./deploy-file-server-existing.sh <服务器IP> [密码]
#
# 示例:
# ./deploy-file-server-existing.sh 120.26.33.181
# ./deploy-file-server-existing.sh 120.26.33.181 "MyPassword"
#

set -e

SERVER_IP=${1:-"120.55.192.144"}
SERVER_USER=${2:-"root"}
SERVER_PASS=${3:-"Lingxi@2026!"}

echo "🚀 开始部署文件服务到 $SERVER_IP"
echo ""

# 部署文件服务
echo "📦 部署文件服务..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_IP << 'DEPLOYEOF'

# 创建文件服务目录
mkdir -p /opt/openclaw-file-server

# 创建文件服务脚本
cat > /opt/openclaw-file-server/index.js << 'FILEEOF'
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 9876;
const WORKSPACE_BASE = '/root/.openclaw/workspace';

function authMiddleware(req, res, next) {
  const token = req.headers['x-file-token'] || req.query.token;
  next();
}

function safePath(userPath) {
  const resolved = path.resolve(WORKSPACE_BASE, userPath || '');
  if (!resolved.startsWith(WORKSPACE_BASE)) return null;
  return resolved;
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-file-token');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    port: PORT,
    workspace: WORKSPACE_BASE,
    exists: fs.existsSync(WORKSPACE_BASE),
    timestamp: new Date().toISOString()
  });
});

app.get('/list', authMiddleware, (req, res) => {
  const targetPath = safePath(req.query.path || '');
  if (!targetPath) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'Path not found' });

  const items = fs.readdirSync(targetPath, { withFileTypes: true });
  const files = items.map(item => ({
    name: item.name,
    type: item.isDirectory() ? 'directory' : 'file',
    size: item.isFile() ? fs.statSync(path.join(targetPath, item.name)).size : 0,
    modified: fs.statSync(path.join(targetPath, item.name)).mtime
  }));

  res.json({ path: req.query.path || '/', files });
});

app.get('/download', authMiddleware, (req, res) => {
  const filePath = safePath(req.query.path);
  if (!filePath) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  if (fs.statSync(filePath).isDirectory()) return res.status(400).json({ error: 'Path is a directory' });

  const filename = path.basename(filePath);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
  fs.createReadStream(filePath).pipe(res);
});

app.get('/preview', authMiddleware, (req, res) => {
  const filePath = safePath(req.query.path);
  if (!filePath) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).json({ error: 'File not found' });
  }

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
});

app.use('/files', authMiddleware, express.static(WORKSPACE_BASE, {
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.pdf': 'application/pdf'
    };
    if (contentTypes[ext]) res.setHeader('Content-Type', contentTypes[ext]);
  }
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 文件服务已启动: http://0.0.0.0:' + PORT);
  console.log('📂 工作目录: ' + WORKSPACE_BASE);
});
FILEEOF

# 安装 express（在文件服务目录）
echo "📦 安装 express..."
cd /opt/openclaw-file-server
if [ ! -d "node_modules/express" ]; then
  npm install express
fi

# 安装 PM2（如果未安装）
if ! command -v pm2 &> /dev/null; then
  echo "📦 安装 PM2..."
  npm install -g pm2
fi

# 使用 PM2 启动文件服务
echo "🚀 启动文件服务..."
pm2 stop file-server 2>/dev/null || true
pm2 delete file-server 2>/dev/null || true
sleep 1

cd /opt/openclaw-file-server
pm2 start index.js --name file-server
pm2 save

echo "✅ 文件服务已启动 (端口: 9876)"
DEPLOYEOF

echo ""
echo "✅ 部署完成！"
echo ""
echo "测试命令:"
echo "  curl http://$SERVER_IP:9876/health"
echo ""
echo "测试文件访问 (假设有 test.pdf):"
echo "  curl 'http://$SERVER_IP:9876/preview?path=test.pdf&token=lingxi-file-server-2026'"
