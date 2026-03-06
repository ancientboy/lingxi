#!/bin/bash
# 部署文件服务到用户服务器（优化版）
#
# 使用方法:
# ./deploy-file-server-user-v2.sh <服务器IP> [密码]
#
# 示例:
# ./deploy-file-server-user-v2.sh 120.26.33.181
# ./deploy-file-server-user-v2.sh 120.26.33.181 "MyPassword"
#

set -e

SERVER_IP=${1:-"120.55.192.144"}
SERVER_USER=${2:-"root"}
SERVER_PASS=${3:-"Lingxi@2026!"}

echo "🚀 开始部署文件服务到 $SERVER_IP"
echo ""

# 创建文件服务脚本
echo "📝 创建文件服务脚本..."
cat > /tmp/file-server.js << 'EOF
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 9876;
const AUTH_TOKEN = process.env.FILE_SERVER_TOKEN || 'lingxi-file-server-2026';
const WORKSPACE_BASE = '/root/.openclaw/workspace';

function authMiddleware(req, res, next) {
  const token = req.headers['x-file-token'] || req.query.token;
  // 生产环境建议启用鉴权
  // if (token !== AUTH_TOKEN) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }
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
  if (!filePath) return res.status(400).线 (error: 'Invalid path' });
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
EOF

# 1. 上传文件服务脚本
echo "📤 上传文件服务脚本..."
sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no \
  /tmp/file-server.js \
  $SERVER_USER@$SERVER_IP:/opt/openclaw-file-server/index.js

# 2. 安装依赖并启动
echo "🔧 安装依赖并启动文件服务..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_IP << 'EOF'
# 安装 express（如果未安装）
if [ ! -d "/root/node_modules/express" ]; then
  echo "📦 安装 express..."
  cd /root && npm install express
fi

# 确保目录存在
mkdir -p /opt/openclaw-file-server

# 使用 PM2 启动文件服务
echo "🚀 启动文件服务..."
pm2 stop file-server 2>/dev/null || true
pm2 delete file-server 2>/dev/null || true
sleep 1

cd /opt/openclaw-file-server
pm2 start index.js --name file-server
pm2 save

echo "✅ 文件服务已启动"
EOF

echo ""
echo "✅ 部署完成！"
echo ""
echo "测试命令:"
echo "  curl http://$SERVER_IP:9876/health"
echo ""
echo "测试文件访问 (假设有 test.pdf):"
echo "  curl http://$SERVER_IP:9876/preview?path=test.pdf&token=lingxi-file-server-2026"
