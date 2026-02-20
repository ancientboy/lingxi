#!/bin/bash
# 灵犀 AI 团队一键部署脚本
# 用法: ./deploy.sh <服务器IP>

set -e

SERVER_IP=${1:-""}
SSH_USER=${2:-"root"}
SSH_PORT=${3:-"22"}
PASSWORD="Lingxi@2026!"

if [ -z "$SERVER_IP" ]; then
    echo "用法: ./deploy.sh <服务器IP> [SSH用户] [SSH端口]"
    exit 1
fi

echo "╔══════════════════════════════════════╗"
echo "║   ⚡ 灵犀 AI 团队 - 一键部署         ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "🎯 目标服务器: ${SERVER_IP}"
echo "👤 SSH 用户: ${SSH_USER}"
echo ""

# 检查 sshpass
if ! command -v sshpass &> /dev/null; then
    echo "❌ 请先安装 sshpass:"
    echo "   Ubuntu/Debian: sudo apt-get install sshpass"
    echo "   macOS: brew install sshpass"
    exit 1
fi

echo "📤 上传配置文件..."
sshpass -p "${PASSWORD}" scp -o StrictHostKeyChecking=no -P ${SSH_PORT} \
    -r .openclaw ${SSH_USER}@${SERVER_IP}:/root/

echo "🚀 安装 OpenClaw 和启动服务..."
sshpass -p "${PASSWORD}" ssh -o StrictHostKeyChecking=no -p ${SSH_PORT} \
    ${SSH_USER}@${SERVER_IP} << 'REMOTE_SCRIPT'
set -e

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

echo "4️⃣ 启动 Gateway..."
cd /root/.openclaw
nohup openclaw gateway > /var/log/openclaw.log 2>&1 &
sleep 5

echo "5️⃣ 检查服务状态..."
if netstat -tlnp 2>/dev/null | grep -q 18789; then
    echo "✅ Gateway 已启动在端口 18789"
else
    echo "⚠️ Gateway 可能未正常启动，请检查日志:"
    echo "   tail -50 /var/log/openclaw.log"
fi

echo ""
echo "✅ 部署完成!"
REMOTE_SCRIPT

# 读取配置获取连接信息
SESSION=$(cat .openclaw/openclaw.json | grep -o '"basePath": "[^"]*"' | cut -d'"' -f4)
TOKEN=$(cat .openclaw/openclaw.json | grep -o '"token": "[^"]*"' | cut -d'"' -f4)

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     ✅ 部署成功！                    ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "🔗 访问地址:"
echo "   http://${SERVER_IP}:18789/${SESSION}?token=${TOKEN}"
echo ""
echo "📱 接入灵犀云:"
echo "   在灵犀云 -> 设置 -> 服务器管理 中添加此服务器"
echo ""
