#!/bin/bash
# 用户 AI 团队部署包生成脚本
# 用法: ./create-user-package.sh <用户ID> <Token> <SessionID>

set -e

USER_ID=${1:-"demo-user"}
GATEWAY_TOKEN=${2:-"$(openssl rand -hex 16)"}
SESSION_ID=${3:-"$(openssl rand -hex 4)"}
VERSION="2.1.1"
PACKAGE_NAME="lingxi-team-${USER_ID}-${VERSION}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="${PROJECT_ROOT}/releases/users"
PACKAGE_DIR="${OUTPUT_DIR}/${PACKAGE_NAME}"

echo "╔══════════════════════════════════════════════════════╗"
echo "║   ⚡ 灵犀云 - 用户 AI 团队部署包生成                 ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "📋 用户 ID: ${USER_ID}"
echo "🔑 Token: ${GATEWAY_TOKEN}"
echo "🆔 Session: ${SESSION_ID}"
echo ""

# 创建输出目录
mkdir -p "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}/.openclaw"
mkdir -p "${PACKAGE_DIR}/.openclaw/agents"
mkdir -p "${PACKAGE_DIR}/.openclaw/workspace"

echo "📦 复制配置文件..."

# 复制并处理主配置
cat "${SCRIPT_DIR}/config/openclaw.json" | \
  sed "s/GATEWAY_TOKEN_PLACEHOLDER/${GATEWAY_TOKEN}/g" | \
  sed "s/SESSION_ID_PLACEHOLDER/${SESSION_ID}/g" | \
  sed "s/ZHIPU_API_KEY_PLACEHOLDER/77c2b59d03e646a9884f78f8c4787885.XunhoXmFaErSD0dR/g" | \
  sed "s/DASHSCOPE_API_KEY_PLACEHOLDER/sk-64985bfe63dd45e0a8e2e456624e3d21/g" | \
  sed "s/FEISHU_APP_ID_PLACEHOLDER//g" | \
  sed "s/FEISHU_APP_SECRET_PLACEHOLDER//g" \
  > "${PACKAGE_DIR}/.openclaw/openclaw.json"

echo "📦 复制 Agent 记忆文件..."

# 复制所有 agent 的 SOUL.md 和其他配置文件
for agent in lingxi coder ops inventor pm noter media smart; do
  mkdir -p "${PACKAGE_DIR}/.openclaw/agents/${agent}"
  mkdir -p "${PACKAGE_DIR}/.openclaw/agents/${agent}/agent"
  
  # 复制 SOUL.md
  if [ -f "${SCRIPT_DIR}/agents/${agent}/SOUL.md" ]; then
    cp "${SCRIPT_DIR}/agents/${agent}/SOUL.md" "${PACKAGE_DIR}/.openclaw/agents/${agent}/agent/"
    echo "  ✅ ${agent}/SOUL.md"
  fi
  
  # 复制 TEAM.md（仅灵犀）
  if [ -f "${SCRIPT_DIR}/agents/${agent}/TEAM.md" ]; then
    cp "${SCRIPT_DIR}/agents/${agent}/TEAM.md" "${PACKAGE_DIR}/.openclaw/agents/${agent}/agent/"
    echo "  ✅ ${agent}/TEAM.md"
  fi
  
  # 复制 WORKFLOW.md（仅灵犀）
  if [ -f "${SCRIPT_DIR}/agents/${agent}/WORKFLOW.md" ]; then
    cp "${SCRIPT_DIR}/agents/${agent}/WORKFLOW.md" "${PACKAGE_DIR}/.openclaw/agents/${agent}/agent/"
    echo "  ✅ ${agent}/WORKFLOW.md"
  fi
done

# 复制 auth-profiles.json（API 密钥配置）
if [ -f "${SCRIPT_DIR}/agents/main/auth-profiles.json" ]; then
  mkdir -p "${PACKAGE_DIR}/.openclaw/agents/main/agent"
  cp "${SCRIPT_DIR}/agents/main/auth-profiles.json" "${PACKAGE_DIR}/.openclaw/agents/main/agent/"
  echo "  ✅ auth-profiles.json (API 密钥)"
fi

echo "📦 复制 Skills..."

# 复制 skills
mkdir -p "${PACKAGE_DIR}/.openclaw/skills"
if [ -d "${SCRIPT_DIR}/skills" ]; then
  cp -r "${SCRIPT_DIR}/skills/"* "${PACKAGE_DIR}/.openclaw/skills/" 2>/dev/null || true
  echo "  ✅ skills 已复制"
fi

echo "🧬 复制基因库..."

# 复制 genes（平台种子基因）
mkdir -p "${PACKAGE_DIR}/.openclaw/genes"
if [ -d "${SCRIPT_DIR}/genes" ]; then
  cp -r "${SCRIPT_DIR}/genes/"* "${PACKAGE_DIR}/.openclaw/genes/" 2>/dev/null || true
  echo "  ✅ genes 已复制"
fi

echo "📝 创建部署脚本..."

# 创建部署脚本
cat > "${PACKAGE_DIR}/deploy.sh" << 'DEPLOY_EOF'
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
DEPLOY_EOF

chmod +x "${PACKAGE_DIR}/deploy.sh"

# 创建本地部署脚本（不需要 SSH）
cat > "${PACKAGE_DIR}/deploy-local.sh" << 'LOCAL_EOF'
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
LOCAL_EOF

chmod +x "${PACKAGE_DIR}/deploy-local.sh"

# 创建 README
cat > "${PACKAGE_DIR}/README.md" << README_EOF
# ⚡ 灵犀 AI 团队部署包

你的专属 AI 团队，包含 8 位专业成员：

| 成员 | 专长 | 描述 |
|------|------|------|
| 🎯 灵犀 | 团队队长 | 智能调度，理解需求，分配任务 |
| 💻 云溪 | 代码专家 | 编程、调试、架构设计 |
| 📊 若曦 | 运营专家 | 数据分析、增长策略、学习规划 |
| 💡 紫萱 | 创意天才 | 头脑风暴、产品设计、文案创作 |
| 🎯 梓萱 | 产品专家 | 需求分析、用户体验、商业模式 |
| 📝 晓琳 | 知识管理 | 笔记整理、知识库、学习辅导 |
| 🎧 音韵 | 多媒体 | 音乐推荐、氛围营造、内容创作 |
| 🏠 智家 | 智能家居 | 设备控制、场景联动、自动化 |

## 🚀 快速部署

### 方式一：远程部署（推荐）

```bash
# 在本地电脑运行
./deploy.sh 你的服务器IP
```

### 方式二：本地部署

```bash
# 上传整个目录到服务器后运行
./deploy-local.sh
```

## 📱 接入灵犀云

部署完成后，在 [灵犀云](http://120.26.137.51:3000) 中：

1. 登录后进入「设置」
2. 点击「服务器管理」
3. 添加服务器信息：
   - IP: 你的服务器IP
   - 端口: 18789
   - Token: 见下方
   - Session: 见下方

## 🔗 连接信息

- **Session ID**: \`${SESSION_ID}\`
- **Token**: \`${GATEWAY_TOKEN}\`
- **访问地址**: \`http://你的IP:18789/${SESSION_ID}?token=${GATEWAY_TOKEN}\`

## 🔧 飞书接入（可选）

1. 在飞书开放平台创建企业自建应用
2. 获取 App ID 和 App Secret
3. 编辑 \`~/.openclaw/openclaw.json\`，找到 \`plugins.entries.feishu.config\`
4. 填入 App ID 和 App Secret
5. 设置 \`enabled: true\`
6. 重启 OpenClaw

## 📦 包含内容

\`\`\`
.
├── .openclaw/
│   ├── openclaw.json      # 主配置文件
│   ├── agents/            # AI 成员记忆
│   │   ├── lingxi/        # 灵犀
│   │   ├── coder/         # 云溪
│   │   ├── ops/           # 若曦
│   │   ├── inventor/      # 紫萱
│   │   ├── pm/            # 梓萱
│   │   ├── noter/         # 晓琳
│   │   ├── media/         # 音韵
│   │   └── smart/         # 智家
│   ├── skills/            # 技能包
│   └── workspace/         # 工作目录
├── deploy.sh              # 远程部署脚本
├── deploy-local.sh        # 本地部署脚本
└── README.md              # 本文件
\`\`\`

## ❓ 常见问题

### Q: 部署后无法访问？
A: 检查防火墙是否开放 18789 端口：
\`\`\`bash
# Ubuntu/Debian
sudo ufw allow 18789

# CentOS
sudo firewall-cmd --add-port=18789/tcp --permanent
sudo firewall-cmd --reload
\`\`\`

### Q: 如何查看日志？
\`\`\`bash
tail -f /var/log/openclaw.log
\`\`\`

### Q: 如何重启服务？
\`\`\`bash
pkill -f openclaw
cd ~/.openclaw && nohup openclaw gateway > /var/log/openclaw.log 2>&1 &
\`\`\`

---

⚡ 灵犀云 - 你的 AI 团队，一键拥有
README_EOF

# 创建版本信息
cat > "${PACKAGE_DIR}/version.json" << VERSION_EOF
{
  "version": "${VERSION}",
  "userId": "${USER_ID}",
  "sessionId": "${SESSION_ID}",
  "token": "${GATEWAY_TOKEN}",
  "openclawVersion": "2026.2.17",
  "buildAt": "$(date -Iseconds)"
}
VERSION_EOF

# 打包
echo "🗜️  打包中..."
cd "${OUTPUT_DIR}"
tar -czf "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}"

# 计算 hash
HASH=$(sha256sum "${PACKAGE_NAME}.tar.gz" | cut -d' ' -f1)

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     ✅ 打包完成！                                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "📦 包名: ${PACKAGE_NAME}.tar.gz"
echo "📋 大小: $(du -h ${PACKAGE_NAME}.tar.gz | cut -f1)"
echo "🔐 Hash: ${HASH:0:32}..."
echo ""
echo "📂 位置: ${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"
echo ""
echo "🔗 连接信息:"
echo "   Session: ${SESSION_ID}"
echo "   Token:   ${GATEWAY_TOKEN}"
echo ""
