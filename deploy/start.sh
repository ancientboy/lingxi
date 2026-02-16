#!/bin/bash
# 灵犀云部署脚本

set -e

echo "🚀 灵犀云部署脚本"
echo "=================="

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装"
    exit 1
fi

# 创建目录
echo "📁 创建目录..."
sudo mkdir -p /data/lingxi-instances
sudo chown -R $USER:$USER /data/lingxi-instances

# 安装后端依赖
echo "📦 安装后端依赖..."
cd backend
npm install
cd ..

# 启动后端
echo "🔧 启动后端服务..."
cd backend
node index.js &
BACKEND_PID=$!
cd ..

# 等待启动
sleep 3

# 测试健康检查
echo "🧪 测试健康检查..."
curl -s http://localhost:3000/health

echo ""
echo "✅ 部署完成！"
echo ""
echo "后端服务: http://localhost:3000"
echo "前端页面: 在 frontend/ 目录打开 index.html"
echo ""
echo "API 测试:"
echo "  curl http://localhost:3000/health"
echo "  curl -X POST http://localhost:3000/api/instance/assign -H 'Content-Type: application/json' -d '{\"userId\":\"test\"}'"
