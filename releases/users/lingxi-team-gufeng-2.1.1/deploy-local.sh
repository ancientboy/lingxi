#!/bin/bash
# 本地部署脚本（直接在服务器上运行）

set -e

echo "╔══════════════════════════════════════╗"
echo "║   ⚡ 灵犀 AI 团队 - 本地部署         ║"
echo "╚══════════════════════════════════════╝"
echo ""

echo "1️⃣ 检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo "安装 Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "Node 版本: $(node --version)"

echo "2️⃣ 停止旧进程..."
pkill -f openclaw 2>/dev/null || true
sleep 2

echo "3️⃣ 安装 OpenClaw..."
npm install -g openclaw@2026.2.17
echo "OpenClaw 版本: $(openclaw --version)"

echo "4️⃣ 复制配置文件..."
cp -r .openclaw ~/.openclaw

echo "5️⃣ 启动 Gateway..."
cd ~/.openclaw
nohup openclaw gateway > /var/log/openclaw.log 2>&1 &
sleep 5

echo "6️⃣ 检查服务状态..."
if netstat -tlnp 2>/dev/null | grep -q 18789; then
    echo "✅ Gateway 已启动在端口 18789"
else
    echo "⚠️ Gateway 可能未正常启动"
    tail -20 /var/log/openclaw.log
fi

# 读取配置
SESSION=$(cat ~/.openclaw/openclaw.json | grep -o '"basePath": "[^"]*"' | cut -d'"' -f4)
TOKEN=$(cat ~/.openclaw/openclaw.json | grep -o '"token": "[^"]*"' | cut -d'"' -f4)
SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     ✅ 部署成功！                    ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "🔗 访问地址:"
echo "   http://${SERVER_IP}:18789/${SESSION}?token=${TOKEN}"
echo ""
