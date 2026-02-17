#!/bin/bash
# 灵犀云快速部署脚本

set -e

echo "╔══════════════════════════════════════╗"
echo "║     ⚡ 灵犀云 - 快速部署             ║"
echo "╚══════════════════════════════════════╝"
echo ""

# 配置
SERVER_IP=${1:-"120.26.137.51"}
JWT_SECRET=${JWT_SECRET:-"lingxi-cloud-secret-key-2026"}
ADMIN_KEY=${ADMIN_KEY:-"lingxi-admin-2026"}

echo "目标服务器: $SERVER_IP"
echo ""

# 创建 .env 文件
cat > .env << EOF
PORT=3000
JWT_SECRET=$JWT_SECRET
ADMIN_KEY=$ADMIN_KEY
MVP_MODE=true
SERVER_IP=$SERVER_IP
EOF

echo "✅ 配置文件创建完成"

# 检查 Docker
if command -v docker &> /dev/null; then
  echo "🐳 检测到 Docker，使用 Docker 部署..."
  
  cd deploy
  docker-compose up -d
  
  echo ""
  echo "✅ Docker 部署完成"
  echo "🌐 访问地址: http://$SERVER_IP"
else
  echo "📦 使用 Node.js 直接部署..."
  
  cd backend
  npm install --production
  
  # 使用 PM2 启动（如果有）
  if command -v pm2 &> /dev/null; then
    pm2 start index.js --name lingxi-cloud
    pm2 save
    echo ""
    echo "✅ PM2 启动完成"
  else
    nohup node index.js > ../logs/lingxi.log 2>&1 &
    echo ""
    echo "✅ 后台启动完成"
    echo "📋 查看日志: tail -f logs/lingxi.log"
  fi
fi

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     🎉 部署成功！                    ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "🌐 访问地址:"
echo "   前端: http://$SERVER_IP"
echo "   后端: http://$SERVER_IP:3000"
echo ""
echo "📋 管理命令:"
echo "   生成邀请码: curl -X POST http://$SERVER_IP:3000/api/admin/invite-codes/generate -H 'Content-Type: application/json' -H 'x-admin-key: $ADMIN_KEY' -d '{\"count\":5}'"
echo ""
