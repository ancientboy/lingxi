#!/bin/bash

# 技能库优化安装脚本

set -e

echo "🚀 开始安装技能库优化依赖..."

# 进入后端目录
cd /home/admin/.openclaw/workspace/lingxi-cloud/backend

# 检查 package.json 是否存在
if [ ! -f "package.json" ]; then
    echo "❌ 错误: package.json 不存在"
    exit 1
fi

# 安装依赖
echo "📦 安装 node-cron 等依赖..."
npm install

# 创建 skills 目录（如果不存在）
mkdir -p skills

# 复制技能文件
echo "📄 复制技能文件..."
cp -f /home/admin/.openclaw/workspace-coder/backend/skills/clawhub-integration.mjs ./skills/ 2>/dev/null || true
cp -f /home/admin/.openclaw/workspace-coder/backend/skills/sync-cron.mjs ./skills/ 2>/dev/null || true
cp -f /home/admin/.openclaw/workspace-coder/backend/skills/sync-job.mjs ./skills/ 2>/dev/null || true
cp -f /home/admin/.openclaw/workspace-coder/backend/skills/library.json ./skills/ 2>/dev/null || true
cp -f /home/admin/.openclaw/workspace-coder/backend/skills/README.md ./skills/ 2>/dev/null || true

echo "✅ 安装完成！"

# 显示帮助信息
echo "📋 使用说明："
echo ""
echo "1. 手动同步技能库："
echo "   cd backend"
echo "   node -e \"import('./skills/sync-cron.mjs').then(m => m.manualSync())\""
echo ""
echo "2. 启动后端服务（自动运行定时任务）："
echo "   npm start"
echo ""
echo "3. 自定义 cron 表达式："
echo "   编辑 backend/index.js，修改 startCronJob() 的参数"
echo ""
echo "4. cron 表达式示例："
echo "   '0 0 * * 0'  - 每周日中午12点"
echo "   '0 0 * * *'  - 每天中午12点"
echo "   '0 * * * *'  - 每小时"
echo ""
