#!/bin/bash
# 灵犀云一键安装脚本

set -e

echo "╔══════════════════════════════════════╗"
echo "║     ⚡ 灵犀云 - 一键安装             ║"
echo "╚══════════════════════════════════════╝"
echo ""

# 检查依赖
echo "🔍 检查系统依赖..."
command -v node >/dev/null 2>&1 || { echo "❌ 需要安装 Node.js 18+"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ 需要安装 npm"; exit 1; }

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 版本过低，需要 18+"
  exit 1
fi

echo "✅ Node.js $(node -v)"
echo "✅ npm $(npm -v)"
echo ""

# 创建目录
echo "📁 创建目录结构..."
mkdir -p ~/.lingxi-cloud/{config,data,logs}
echo "✅ 目录创建完成"
echo ""

# 安装后端依赖
echo "📦 安装后端依赖..."
cd backend
npm install --production
echo "✅ 后端依赖安装完成"
echo ""

# 初始化数据库
echo "🗄️  初始化数据库..."
mkdir -p data
node -e "
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'db.json');
const defaultDB = { users: [], inviteCodes: [], agentConfigs: [] };
fs.writeFileSync(dbPath, JSON.stringify(defaultDB, null, 2));
console.log('✅ 数据库初始化完成');
"
echo ""

# 生成初始邀请码
echo "🎫 生成初始邀请码..."
node -e "
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'data', 'db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

for (let i = 0; i < 5; i++) {
  const code = 'LINGXI-' + crypto.randomUUID().substring(0, 8).toUpperCase();
  db.inviteCodes.push({
    code,
    used: false,
    usedBy: null,
    createdAt: new Date().toISOString()
  });
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('✅ 已生成 5 个邀请码');
"
echo ""

# 创建 systemd 服务（可选）
if [ "$1" == "--service" ]; then
  echo "🔧 创建系统服务..."
  
  cat > /tmp/lingxi-cloud.service << EOF
[Unit]
Description=Lingxi Cloud Backend
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$(pwd)
ExecStart=$(which node) index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

  sudo mv /tmp/lingxi-cloud.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable lingxi-cloud
  echo "✅ 系统服务创建完成"
  echo "   启动: sudo systemctl start lingxi-cloud"
  echo ""
fi

# 完成
echo "╔══════════════════════════════════════╗"
echo "║     ✅ 安装完成！                    ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "🚀 启动服务:"
echo "   cd $(pwd) && node index.js"
echo ""
echo "🌐 访问地址:"
echo "   后端: http://localhost:3000"
echo "   前端: 打开 frontend/index.html"
echo ""
echo "📋 查看邀请码:"
echo "   cat data/db.json | grep LINGXI"
echo ""
