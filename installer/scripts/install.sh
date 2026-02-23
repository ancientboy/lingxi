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
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

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

# 获取当前用户信息
CURRENT_USER=$(whoami)
CURRENT_HOME=$(eval echo ~$CURRENT_USER)

# 检测服务器 IP
log_info "检测服务器 IP..."
SERVER_IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || curl -s --connect-timeout 5 icanhazip.com 2>/dev/null || echo "未知")

log_info "当前用户: $CURRENT_USER"
log_info "用户目录: $CURRENT_HOME"
log_info "服务器IP: $SERVER_IP"

# 检查系统
log_info "检查系统环境..."

# 检查 Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker 未安装"
    log_info "请先安装 Docker: https://docs.docker.com/get-docker/"
    exit 1
fi
log_success "Docker 已安装: $(docker --version | cut -d' ' -f3)"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js 未安装"
    log_info "请先安装 Node.js 18+: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node -v)
log_success "Node.js 已安装: $NODE_VERSION"

# 检查 npm
if ! command -v npm &> /dev/null; then
    log_error "npm 未安装"
    exit 1
fi
log_success "npm 已安装: $(npm -v)"

echo ""

# 设置安装目录
INSTALL_DIR="${INSTALL_DIR:-$CURRENT_HOME/.lingxi-cloud}"
log_info "安装目录: $INSTALL_DIR"

# 检查是否已安装
if [ -d "$INSTALL_DIR" ]; then
    log_warn "检测到已有安装: $INSTALL_DIR"
    read -p "是否覆盖安装? (y/n): " OVERWRITE
    if [ "$OVERWRITE" != "y" ]; then
        log_info "安装已取消"
        exit 0
    fi
    log_info "备份旧安装..."
    mv "$INSTALL_DIR" "${INSTALL_DIR}.backup-$(date +%Y%m%d-%H%M%S)"
fi

# 创建目录结构
log_info "创建目录结构..."
mkdir -p "$INSTALL_DIR"/{backend,frontend,config,logs}

# 克隆代码
log_info "下载灵犀云代码..."
if ! git clone https://github.com/ancientboy/lingxi.git "$INSTALL_DIR" 2>/dev/null; then
    log_warn "Git 克隆失败，尝试下载压缩包..."
    curl -fsSL https://github.com/ancientboy/lingxi/archive/refs/heads/main.tar.gz | tar xz -C "$INSTALL_DIR" --strip-components=1
fi
log_success "代码下载完成"

# 安装后端依赖
log_info "安装后端依赖..."
cd "$INSTALL_DIR/backend"
npm install --production 2>/dev/null || npm install 2>/dev/null
log_success "后端依赖安装完成"

# 配置环境变量
log_info "配置环境变量..."
cat > "$INSTALL_DIR/backend/.env" << ENVFILE
# 服务端口
PORT=3000

# 实例存储目录
INSTANCES_DIR=$INSTALL_DIR/instances

# OpenClaw 镜像
OPENCLAW_IMAGE=openclaw/openclaw:latest

# 服务器 IP (自动检测)
SERVER_IP=$SERVER_IP

# JWT 密钥 (自动生成)
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")

# MVP 模式 (共享实例)
MVP_MODE=true
ENVFILE
log_success "环境变量配置完成"

# 检查并配置 OpenClaw
log_info "检查 OpenClaw 配置..."
OPENCLAW_DIR="$CURRENT_HOME/.openclaw"

if [ -d "$OPENCLAW_DIR" ]; then
    log_info "发现已有 OpenClaw 配置，运行修复脚本..."
    
    # 生成随机 Token 和 Session
    NEW_TOKEN=$(python3 -c "import secrets; print(secrets.token_hex(16))")
    NEW_SESSION=$(python3 -c "import secrets; print(secrets.token_hex(4))")
    
    # 更新配置
    python3 << PYEOF
import json
import os

config_file = "$OPENCLAW_DIR/openclaw.json"

try:
    with open(config_file, 'r') as f:
        config = json.load(f)
except:
    config = {}

# 确保 gateway 配置存在
if 'gateway' not in config:
    config['gateway'] = {}

# 更新 controlUi
if 'controlUi' not in config['gateway']:
    config['gateway']['controlUi'] = {}

config['gateway']['controlUi']['enabled'] = True
config['gateway']['controlUi']['basePath'] = '$NEW_SESSION'
config['gateway']['controlUi']['allowedOrigins'] = [
    '*',
    'http://$SERVER_IP:3000',
    'http://localhost:3000'
]
config['gateway']['controlUi']['allowInsecureAuth'] = True

# 更新 auth
if 'auth' not in config['gateway']:
    config['gateway']['auth'] = {}

config['gateway']['auth']['mode'] = 'token'
config['gateway']['auth']['token'] = '$NEW_TOKEN'

# 移除无效插件
if 'plugins' in config:
    del config['plugins']

# 修复路径
content = json.dumps(config, indent=2)
content = content.replace('/home/admin', '$CURRENT_HOME')
config = json.loads(content)

with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)

print(f'✓ Token: $NEW_TOKEN')
print(f'✓ Session: $NEW_SESSION')
PYEOF
    
    # 保存到灵犀云配置
    echo "MVP_OPENCLAW_TOKEN=$NEW_TOKEN" >> "$INSTALL_DIR/backend/.env"
    echo "MVP_OPENCLAW_SESSION=$NEW_SESSION" >> "$INSTALL_DIR/backend/.env"
    
    # 创建必要目录
    mkdir -p "$OPENCLAW_DIR/workspace"
    
    # 重启 Gateway
    log_info "重启 OpenClaw Gateway..."
    if command -v openclaw &> /dev/null; then
        pkill -f openclaw-gateway 2>/dev/null || true
        sleep 2
        openclaw gateway start 2>/dev/null &
        sleep 5
    fi
    
    log_success "OpenClaw 配置完成"
else
    log_warn "未检测到 OpenClaw 安装"
    log_info "请先安装 OpenClaw: curl -fsSL https://openclaw.io/install.sh | bash"
    
    # 使用默认值
    echo "MVP_OPENCLAW_TOKEN=6f3719a52fa12799fea8e4a06655703f" >> "$INSTALL_DIR/backend/.env"
    echo "MVP_OPENCLAW_SESSION=c308f1f0" >> "$INSTALL_DIR/backend/.env"
fi

# 创建 systemd 服务
log_info "创建系统服务..."
cat > /etc/systemd/system/lingxi-cloud.service << SERVICE
[Unit]
Description=灵犀云后端服务
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$INSTALL_DIR/backend
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload 2>/dev/null || true
log_success "系统服务配置完成"

# 启动服务
log_info "启动灵犀云服务..."
cd "$INSTALL_DIR/backend"
nohup node index.js > "$INSTALL_DIR/logs/lingxi.log" 2>&1 &
sleep 3

# 检查服务状态
if curl -s "http://localhost:3000/health" > /dev/null 2>&1; then
    log_success "灵犀云启动成功"
else
    log_warn "服务可能还在启动中..."
fi

# 创建管理脚本
log_info "创建管理脚本..."
cat > "$INSTALL_DIR/lingxi.sh" << MGMT
#!/bin/bash
case "\$1" in
    start)
        cd $INSTALL_DIR/backend && nohup node index.js > $INSTALL_DIR/logs/lingxi.log 2>&1 &
        echo "灵犀云已启动"
        ;;
    stop)
        pkill -f "node.*lingxi-cloud/backend"
        echo "灵犀云已停止"
        ;;
    restart)
        \$0 stop
        sleep 2
        \$0 start
        ;;
    logs)
        tail -f $INSTALL_DIR/logs/lingxi.log
        ;;
    status)
        curl -s http://localhost:3000/health && echo "" || echo "服务未运行"
        ;;
    *)
        echo "用法: \$0 {start|stop|restart|logs|status}"
        exit 1
        ;;
esac
MGMT
chmod +x "$INSTALL_DIR/lingxi.sh"

# 完成
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                                                      ║"
echo "║   ✨ 灵犀云安装完成！                                ║"
echo "║                                                      ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║   🌐 访问地址: http://$SERVER_IP:3000"
echo "║   📁 安装目录: $INSTALL_DIR"
echo "║                                                      ║"
echo "║   🔧 管理命令:                                       ║"
echo "║      $INSTALL_DIR/lingxi.sh start    # 启动"
echo "║      $INSTALL_DIR/lingxi.sh stop     # 停止"
echo "║      $INSTALL_DIR/lingxi.sh restart  # 重启"
echo "║      $INSTALL_DIR/lingxi.sh logs     # 查看日志"
echo "║      $INSTALL_DIR/lingxi.sh status   # 查看状态"
echo "║                                                      ║"
echo "║   📖 文档:                                           ║"
echo "║      - 部署指南: $INSTALL_DIR/docs/DEPLOY_OTHER_SERVER.md"
echo "║      - 配置修复: $INSTALL_DIR/installer/scripts/fix-config.sh"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
log_success "打开浏览器访问灵犀吧！"
log_info "首次使用需要邀请码注册"
