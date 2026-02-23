#!/bin/bash
#
# 灵犀云 - 配置修复脚本
# 
# 用于修复从其他服务器拷贝配置后的路径和设置问题
# 

set -e

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
echo "╔══════════════════════════════════════════════════════╗"
echo "║     🔧 灵犀云配置修复工具                              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# 获取当前用户信息
CURRENT_USER=$(whoami)
CURRENT_HOME=$(eval echo ~$CURRENT_USER)
CONFIG_FILE="$CURRENT_HOME/.openclaw/openclaw.json"
LX_CLOUD_SERVER="120.26.137.51"  # 灵犀云主服务器

# 获取服务器 IP
log_info "检测服务器 IP..."
SERVER_IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || curl -s --connect-timeout 5 icanhazip.com 2>/dev/null)
if [ -z "$SERVER_IP" ]; then
    log_warn "无法自动检测服务器 IP，请手动输入"
    read -p "服务器 IP: " SERVER_IP
fi

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
BACKUP_FILE="$CONFIG_FILE.fix-backup-$(date +%Y%m%d-%H%M%S)"
cp "$CONFIG_FILE" "$BACKUP_FILE"
log_success "已备份配置到: $BACKUP_FILE"
echo ""

# === 修复 1: 硬编码路径 ===
log_info "检查硬编码路径..."

# 查找配置中的硬编码路径
HARDCODED=$(grep -oE '/home/[^/"'\'' ]+' "$CONFIG_FILE" 2>/dev/null | sort -u)

if [ -n "$HARDCODED" ]; then
    log_warn "发现硬编码路径:"
    echo "$HARDCODED" | while read path; do
        echo "  - $path"
    done
    
    # 获取要替换的原始用户名
    FIRST_PATH=$(echo "$HARDCODED" | head -1)
    ORIGINAL_USER=$(echo "$FIRST_PATH" | sed 's|/home/||')
    
    if [ "$ORIGINAL_USER" != "$CURRENT_USER" ] || [ "$ORIGINAL_USER" = "admin" ]; then
        log_info "修复路径: /home/$ORIGINAL_USER → /home/$CURRENT_USER"
        
        python3 << PYEOF
import json
import sys

try:
    with open("$CONFIG_FILE", 'r') as f:
        content = f.read()
    
    # 替换路径
    new_content = content.replace('/home/$ORIGINAL_USER', '$CURRENT_HOME')
    
    # 如果当前是 root，额外处理
    if '$CURRENT_USER' == 'root':
        new_content = new_content.replace('/home/root', '/root')
    
    # 验证 JSON
    json.loads(new_content)
    
    with open("$CONFIG_FILE", 'w') as f:
        f.write(new_content)
    
    print("✓ 路径修复完成")
except Exception as e:
    print(f"✗ 路径修复失败: {e}")
    sys.exit(1)
PYEOF
        
        [ $? -eq 0 ] && log_success "路径已修复" || log_error "路径修复失败"
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
    if grep -qE 'alibaba-cloud-auth|alibaba-cloud-international-auth|alibaba-cloud-us-auth' "$CONFIG_FILE"; then
        log_warn "发现无效插件配置，正在移除..."
        
        python3 << 'PYEOF'
import json
try:
    with open("$CONFIG_FILE".replace('$', ''), 'r') as f:
        pass  # 占位，实际路径在下面
except:
    pass

# 重新读取
import json
config_file = "$CONFIG_FILE".replace('$', '')
with open(config_file, 'r') as f:
    config = json.load(f)

if 'plugins' in config:
    del config['plugins']
    print('✓ 已删除无效 plugins 配置')

with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)
PYEOF
        
        log_success "插件配置已清理"
    fi
else
    log_success "无插件配置"
fi

echo ""

# === 修复 3: allowedOrigins ===
log_info "检查 CORS 配置..."

# 检查是否包含灵犀云主服务器
if ! grep -q "$LX_CLOUD_SERVER" "$CONFIG_FILE" 2>/dev/null; then
    log_warn "缺少灵犀云服务器地址，正在添加..."
    
    python3 << PYEOF
import json

with open("$CONFIG_FILE", 'r') as f:
    config = json.load(f)

# 确保 gateway.controlUi.allowedOrigins 存在
if 'gateway' not in config:
    config['gateway'] = {}
if 'controlUi' not in config['gateway']:
    config['gateway']['controlUi'] = {}
if 'allowedOrigins' not in config['gateway']['controlUi']:
    config['gateway']['controlUi']['allowedOrigins'] = ['*']

# 添加必要的 origins
origins = config['gateway']['controlUi']['allowedOrigins']
required = [
    'http://$LX_CLOUD_SERVER:3000',
    'http://$SERVER_IP:3000'
]

for origin in required:
    if origin not in origins:
        origins.append(origin)
        print(f'✓ 添加: {origin}')

config['gateway']['controlUi']['allowedOrigins'] = origins

with open("$CONFIG_FILE", 'w') as f:
    json.dump(config, f, indent=2)
PYEOF
    
    log_success "CORS 配置已更新"
else
    log_success "CORS 配置正确"
fi

echo ""

# === 修复 4: 创建必要目录 ===
log_info "检查必要目录..."

WORKSPACE="$CURRENT_HOME/.openclaw/workspace"
if [ ! -d "$WORKSPACE" ]; then
    mkdir -p "$WORKSPACE"
    log_success "创建: $WORKSPACE"
fi

# 检查配置中的所有 workspace 目录
python3 << PYEOF
import json
import os

with open("$CONFIG_FILE", 'r') as f:
    content = f.read()

# 查找所有 workspace 路径
import re
workspaces = re.findall(r'"workspace":\s*"([^"]+)"', content)

for ws in workspaces:
    # 替换 ~ 和 $HOME
    ws = ws.replace('~', '$CURRENT_HOME').replace('$HOME', '$CURRENT_HOME')
    if ws and not os.path.exists(ws):
        os.makedirs(ws, exist_ok=True)
        print(f'✓ 创建目录: {ws}')
PYEOF

echo ""

# === 修复 5: Token 检查 ===
log_info "检查 Gateway Token..."

TOKEN=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('gateway',{}).get('auth',{}).get('token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    log_warn "未配置 Gateway Token，正在生成..."
    
    NEW_TOKEN=$(python3 -c "import secrets; print(secrets.token_hex(16))")
    
    python3 << PYEOF
import json

with open("$CONFIG_FILE", 'r') as f:
    config = json.load(f)

if 'gateway' not in config:
    config['gateway'] = {}
if 'auth' not in config['gateway']:
    config['gateway']['auth'] = {}

config['gateway']['auth']['mode'] = 'token'
config['gateway']['auth']['token'] = '$NEW_TOKEN'

with open("$CONFIG_FILE", 'w') as f:
    json.dump(config, f, indent=2)
    
print(f'✓ 已生成新 Token: $NEW_TOKEN')
PYEOF
    
    log_success "Token 已配置"
else
    log_success "Token 已配置: ${TOKEN:0:8}..."
fi

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
log_info "重启 OpenClaw Gateway..."

if command -v openclaw &> /dev/null; then
    # 停止旧进程
    pkill -f openclaw-gateway 2>/dev/null || true
    sleep 2
    
    # 启动新进程
    openclaw gateway start 2>/dev/null &
    sleep 5
    
    # 检查状态
    if pgrep -f openclaw-gateway > /dev/null; then
        log_success "Gateway 已重启"
        
        # 测试连接
        BASE_PATH=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('gateway',{}).get('controlUi',{}).get('basePath',''))" 2>/dev/null)
        if [ -n "$BASE_PATH" ]; then
            if curl -s "http://localhost:18789/$BASE_PATH/" | head -1 | grep -q "html"; then
                log_success "Gateway 访问正常"
            fi
        fi
    else
        log_warn "Gateway 启动可能失败，请手动检查"
    fi
else
    log_warn "未找到 openclaw 命令，请手动重启 Gateway"
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     ✅ 配置修复完成                                   ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║  如仍有问题，请运行:                                  ║"
echo "║    openclaw config validate                          ║"
echo "║    openclaw gateway status                           ║"
echo "║                                                      ║"
echo "║  备份文件: $BACKUP_FILE"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
