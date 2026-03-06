#!/bin/bash
# 部署文件服务到用户服务器
#
# 使用方法:
# ./deploy-file-server-user.sh <服务器IP> [密码]

set -e

SERVER_IP=${1:-"120.55.192.144"}
SERVER_USER=${2:-"root"}
SERVER_PASS=${3:-"Lingxi@2026!"}

echo "🚀 开始部署文件服务到 $SERVER_IP"

# 1. 上传文件服务脚本
echo "📤 上传 file-server-wrapper.js..."
sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no \
  /home/admin/.openclaw/workspace/lingxi-cloud/deploy/file-server-wrapper.js \
  $SERVER_USER@$SERVER_IP:/root/file-server.js

# 2. 安装依赖并启动
echo "🔧 安装依赖并启动文件服务..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_IP << 'EOF'
# 安装 express（如果未安装）
if [ ! -d "/root/node_modules/express" ]; then
  echo "📦 安装 express..."
  cd /root && npm install express
fi

# 停止旧的文件服务
pm2 stop file-server 2>/dev/null || true
pm2 delete file-server 2>/dev/null || true

# 启动新的文件服务
echo "🚀 启动文件服务..."
pm2 start /root/file-server.js --name file-server

# 保存 pm2 配置
pm2 save

echo "✅ 文件服务已启动"
EOF

echo ""
echo "✅ 部署完成！"
echo ""
echo "测试命令:"
echo "  curl http://$SERVER_IP:9876/health"
echo ""
echo "如果需要查看日志:"
echo "  ssh root@$SERVER_IP 'pm2 logs file-server --lines 20'"
