#!/bin/bash
# 部署 OpenClaw 文件服务到所有用户实例
# 
# 使用方法:
# ./deploy-file-server.sh [服务器IP]

set -e

SERVER_IP=${1:-"120.55.192.144"}
SERVER_USER=${2:-"root"}
SERVER_PASS=${3:-"Lingxi@2026!"}

echo "🚀 开始部署文件服务到 $SERVER_IP"

# 1. 上传文件服务脚本
echo "📤 上传 file-server.js..."
sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no \
  /root/.openclaw/workspace/lingxi-cloud/deploy/file-server.js \
  $SERVER_USER@$SERVER_IP:/root/file-server.js

# 2. 启动文件服务
echo "🔧 启动文件服务..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_IP << 'EOF'
# 检查是否已运行
if pm2 list | grep -q "file-server"; then
  echo "⚠️  file-server 已在运行，重启..."
  pm2 restart file-server
else
  echo "🆕 启动 file-server..."
  pm2 start /root/file-server.js --name file-server
fi

pm2 save
EOF

echo "✅ 文件服务部署完成！"
echo ""
echo "测试命令:"
echo "curl http://$SERVER_IP:9876/health"
