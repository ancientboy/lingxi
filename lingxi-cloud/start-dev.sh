#!/bin/bash

# 灵犀云开发环境启动脚本

echo "🚀 启动灵犀云开发环境..."

# 进入后端目录
cd "$(dirname "$0")/backend"

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "📝 创建 .env 文件..."
    cp .env.example .env
    echo "⚠️ 请编辑 backend/.env 文件，填入正确的配置"
    echo ""
fi

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 启动服务
echo ""
echo "🌟 启动后端服务..."
echo "   端口: 3000"
echo "   健康检查: http://localhost:3000/health"
echo ""

npm run dev
