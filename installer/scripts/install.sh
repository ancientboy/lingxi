#!/bin/bash
#
# 灵犀云 - 一键安装脚本
# 
# 用法: curl -fsSL https://lingxi.cloud/install.sh | bash
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 欢迎信息
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                                                      ║"
echo "║   ⚡ 灵犀云 - 一键安装                                ║"
echo "║                                                      ║"
echo "║   让灵犀帮你配置专属的 AI 团队                        ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# 检查系统
log_info "检查系统环境..."

# 获取当前用户信息（用于自动配置路径）
CURRENT_USER=$(whoami)
CURRENT_HOME=$(eval echo ~$CURRENT_USER)
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "YOUR_SERVER_IP")

log_info "当前用户: $CURRENT_USER"
log_info "用户目录: $CURRENT_HOME"
log_info "服务器IP: $SERVER_IP"

# 检查 Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker 未安装"
    log_info "请先安装 Docker: https://docs.docker.com/get-docker/"
    exit 1
fi
log_success "Docker 已安装"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js 未安装"
    log_info "请先安装 Node.js 18+: https://nodejs.org/"
    exit 1
fi
log_success "Node.js 已安装: $(node -v)"

# 设置安装目录（自动使用当前用户目录）
INSTALL_DIR="${INSTALL_DIR:-$CURRENT_HOME/.lingxi-cloud}"
log_info "安装目录: $INSTALL_DIR"

# 创建目录结构
log_info "创建目录结构..."
mkdir -p "$INSTALL_DIR"/{config,agents,skills,data,logs}

# 复制配置文件
log_info "配置 OpenClaw..."
cat > "$INSTALL_DIR/config/openclaw.json" << 'OPENCLAW_CONFIG'
{
  "agents": {
    "defaults": {
      "model": { "primary": "zhipu/glm-5" },
      "workspace": "/workspace",
      "memory": { "enabled": true, "provider": "local" }
    },
    "list": [
      { "id": "main", "default": true, "name": "灵犀" }
    ]
  },
  "tools": { "subagents": { "tools": { "allow": [] } } },
  "server": { "port": 18789, "host": "0.0.0.0" }
}
OPENCLAW_CONFIG

# 创建灵犀 SOUL
log_info "配置灵犀..."
mkdir -p "$INSTALL_DIR/agents/lingxi"
cat > "$INSTALL_DIR/agents/lingxi/SOUL.md" << 'LINGXI_SOUL'
# SOUL.md - 灵犀 ⚡

你是灵犀，团队的队长，机灵俏皮的天才调度员。

## 核心身份
- 你是队长，不只是助手
- 用户提需求，你知道该派谁去
- 性格活泼，做事雷厉风行

## 🎯 首次对话判断

每次对话开始时，检查用户画像：
- 如果画像为空 → 执行「新用户引导流程」
- 如果画像存在 → 正常对话

### 新用户引导流程
1. 问候：「你好！我是灵犀 ⚡ 看来你是第一次来~」
2. 询问：「请问你主要是做什么工作的？」
3. 了解：「平时工作中，最常做哪些事？」
4. 推荐：「根据你的需求，我建议配置...」
5. 确认并保存用户画像
LINGXI_SOUL

# 拉取 OpenClaw 镜像
log_info "拉取 OpenClaw 镜像（首次可能需要几分钟）..."
docker pull openclaw/openclaw:latest || {
    log_warn "镜像拉取失败，尝试使用国内镜像..."
    # 可以添加国内镜像源
}

# 启动容器
log_info "启动灵犀云容器..."
docker run -d \
    --name lingxi-cloud \
    -p 18789:18789 \
    -v "$INSTALL_DIR/config":/config \
    -v "$INSTALL_DIR/agents":/agents \
    -v "$INSTALL_DIR/skills":/skills \
    -v "$INSTALL_DIR/data":/data \
    --restart unless-stopped \
    openclaw/openclaw:latest

# 等待启动
log_info "等待服务启动..."
sleep 5

# 检查状态
if curl -s http://localhost:18789/health > /dev/null 2>&1; then
    log_success "灵犀云启动成功！"
else
    log_warn "服务可能还在启动中，请稍后访问"
fi

# 完成
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                                                      ║"
echo "║   ✨ 灵犀云安装完成！                                ║"
echo "║                                                      ║"
echo "║   访问地址: http://localhost:18789                   ║"
echo "║   安装目录: $INSTALL_DIR"
echo "║                                                      ║"
echo "║   常用命令:                                          ║"
echo "║   - 查看日志: docker logs lingxi-cloud               ║"
echo "║   - 重启服务: docker restart lingxi-cloud            ║"
echo "║   - 停止服务: docker stop lingxi-cloud               ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
log_info "打开浏览器访问灵犀吧！"
