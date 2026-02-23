#!/bin/bash
#
# 灵犀云 - 配置修复脚本
# 
# 用于修复从其他服务器拷贝配置后的路径和设置问题
# 
# 用法: curl -fsSL https://lingxi.cloud/fix-config.sh | bash
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

echo ""
echo "=== 灵犀云配置修复工具 ==="
echo ""

# 获取当前用户信息
CURRENT_USER=$(whoami)
CURRENT_HOME=$(eval echo ~$CURRENT_USER)
CONFIG_FILE="$CURRENT_HOME/.openclaw/openclaw.json"
SERVER_IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || echo "未知")

log_info "当前用户: $CURRENT_USER"
log_info "用户目录: $CURRENT_HOME"
log_info "服务器IP: $SERVER_IP"
log_info "配置文件: $CONFIG_FILE"
echo ""

# 检查配置文件
if [ ! -f "$CONFIG_FILE" ]; then
    log_error "配置文件不存在: $CONFIG_FILE"
    log_info "请先运行 openclaw onboard 初始化 OpenClaw"
    exit 1
fi

# 备份配置
BACKUP_FILE="$CONFIG_FILE.backup-$(date +%Y%m%d-%H%M%S)"
cp "$CONFIG_FILE" "$BACKUP_FILE"
log_success "已备份配置到: $BACKUP_FILE"
echo ""

# === 修复 1: 硬编码路径 ===
log_info "检查硬编码路径..."

# 查找配置中的硬编码用户目录
HARDCODED_USERS=$(grep -o '/home/[^/]*' "$CONFIG_FILE" 2>/dev/null | sort -u | head -5)

if [ -n "$HARDCODED_USERS" ]; then
    log_warn "发现硬编码路径:"
    echo "$HARDCODED_USERS"
    echo ""
    
    # 获取要替换的原始用户名
    FIRST_USER=$(echo "$HARDCODED_USERS" | head -1 | sed 's|/home/||')
    
    if [ "$FIRST_USER" != "$CURRENT_USER" ]; then
        log_info "将 /home/$FIRST_USER 替换为 /home/$CURRENT_USER ..."
        
        # 使用 Python 安全替换（保持 JSON 格式）
        python3 << EOF
import json
import sys

try:
    with open("$CONFIG_FILE", 'r') as f:
        content = f.read()
    
    # 替换路径
    new_content = content.replace('/home/$FIRST_USER', '/home/$CURRENT_USER')
    new_content = new_content.replace('/root', '/home/$CURRENT_USER')
    
    # 如果当前是 root，确保用正确的路径
    if '$CURRENT_USER' == 'root':
        new_content = new_content.replace('/home/root', '/root')
    
    # 验证 JSON
    json.loads(new_content)
    
    with open("$CONFIG_FILE", 'w') as f:
        f.write(new_content)
    
    print("✓ 路径替换完成")
except Exception as e:
    print(f"✗ 路径替换失败: {e}")
    sys.exit(1)
EOF
        
        if [ $? -eq 0 ]; then
            log_success "路径修复完成"
        else
            log_error "路径修复失败，正在恢复备份..."
            cp "$BACKUP_FILE" "$CONFIG_FILE"
            exit 1
        fi
    else
        log_success "路径配置正确"
    fi
else
    log_success "未发现硬编码路径"
fi

echo ""

# === 修复 2: 无效插件 ===
log_info "检查无效插件..."

if grep -q '"plugins"' "$CONFIG_FILE"; then
    log_warn "发现 plugins 配置，检查是否有效..."
    
    # 检查是否包含无效插件
    if grep -q 'alibaba-cloud-auth\|alibaba-cloud-international-auth\|alibaba-cloud-us-auth' "$CONFIG_FILE"; then
        log_warn "发现无效插件配置，正在移除..."
        
        python3 << 'EOF'
import json

try:
    with open("$CONFIG_FILE".replace('$', ''), 'r') as f:
        # 重新构建路径
        pass
except:
    pass
EOF
        
        # 简单方法：直接删除 plugins 块
        python3 -c "
import json
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
if 'plugins' in config:
    del config['plugins']
    print('✓ 已删除无效 plugins 配置')
with open('$CONFIG_FILE', 'w') as f:
    json.dump(config, f, indent=2)
" 2>/dev/null || log_warn "请手动检查 plugins 配置"
        
        log_success "插件配置已清理"
    else
        log_success "插件配置正常"
    fi
else
    log_success "无插件配置"
fi

echo ""

# === 修复 3: allowedOrigins ===
log_info "检查 CORS 配置..."

# 获取当前配置的 allowedOrigins
CURRENT_ORIGINS=$(grep -A 10 '"allowedOrigins"' "$CONFIG_FILE" 2>/dev/null | grep -o 'http://[^"]*' | head -5)

if echo "$CURRENT_ORIGINS" | grep -qE '120\.26\.|120\.55\.'; then
    # 检查是否包含其他服务器的 IP
    WRONG_IP=$(echo "$CURRENT_ORIGINS" | grep -v "$SERVER_IP" | grep -v 'localhost' | grep -v '127.0.0.1' | head -1)
    
    if [ -n "$WRONG_IP" ]; then
        WRONG_SERVER=$(echo "$WRONG_IP" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+')
        log_warn "发现其他服务器 IP: $WRONG_SERVER"
        log_info "替换为本服务器 IP: $SERVER_IP"
        
        sed -i "s|$WRONG_SERVER|$SERVER_IP|g" "$CONFIG_FILE"
        log_success "CORS 配置已更新"
    else
        log_success "CORS 配置正确"
    fi
else
    log_success "CORS 配置正常"
fi

echo ""

# === 修复 4: 创建必要目录 ===
log_info "检查必要目录..."

WORKSPACE_BASE="$CURRENT_HOME/.openclaw/workspace"
if [ ! -d "$WORKSPACE_BASE" ]; then
    mkdir -p "$WORKSPACE_BASE"
    log_success "创建目录: $WORKSPACE_BASE"
fi

# 检查配置中的所有 workspace 目录
WORKSPACES=$(grep -o "\"workspace\": *\"[^\"]*\"" "$CONFIG_FILE" | sed 's/.*: *"\([^"]*\)".*/\1/' 2>/dev/null)

for ws in $WORKSPACES; do
    # 替换 ~ 和 $HOME
    ws_expanded=$(echo "$ws" | sed "s|~|$CURRENT_HOME|g" | sed "s|\$HOME|$CURRENT_HOME|g")
    if [ ! -d "$ws_expanded" ] && [ "$ws_expanded" != "" ]; then
        mkdir -p "$ws_expanded" 2>/dev/null && log_success "创建目录: $ws_expanded"
    fi
done

echo ""

# === 验证配置 ===
log_info "验证配置文件..."

if python3 -c "import json; json.load(open('$CONFIG_FILE'))" 2>/dev/null; then
    log_success "配置文件格式正确"
else
    log_error "配置文件格式错误，正在恢复备份..."
    cp "$BACKUP_FILE" "$CONFIG_FILE"
    exit 1
fi

echo ""

# === 重启 Gateway ===
log_info "尝试重启 OpenClaw Gateway..."

if command -v openclaw &> /dev/null; then
    # 停止旧进程
    pkill -f openclaw-gateway 2>/dev/null || true
    sleep 2
    
    # 启动新进程
    openclaw gateway start 2>/dev/null || nohup openclaw-gateway > /tmp/gateway.log 2>&1 &
    sleep 3
    
    # 检查状态
    if pgrep -f openclaw-gateway > /dev/null; then
        log_success "Gateway 已重启"
    else
        log_warn "Gateway 启动可能失败，请手动检查"
    fi
else
    log_warn "未找到 openclaw 命令，请手动重启 Gateway"
fi

echo ""
echo "=== 修复完成 ==="
echo ""
log_info "如果仍有问题，请运行:"
echo "  openclaw config validate"
echo "  openclaw gateway status"
echo ""
