#!/bin/bash
#
# 灵犀云 - 实例配置测试脚本
#

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}[✓]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

echo "=== 灵犀云实例配置测试 ==="
echo ""

ERRORS=0

# 1. 检查配置文件
echo "1. 检查配置文件..."
CONFIG="$HOME/.openclaw/openclaw.json"

if [ -f "$CONFIG" ]; then
    pass "配置文件存在: $CONFIG"
    
    # 验证 JSON 格式
    if python3 -c "import json; json.load(open('$CONFIG'))" 2>/dev/null; then
        pass "JSON 格式正确"
    else
        fail "JSON 格式错误"
        ERRORS=$((ERRORS + 1))
    fi
else
    fail "配置文件不存在"
    ERRORS=$((ERRORS + 1))
fi

# 2. 检查路径配置
echo ""
echo "2. 检查路径配置..."

if grep -q "/home/admin" "$CONFIG" 2>/dev/null; then
    fail "发现硬编码路径 /home/admin"
    ERRORS=$((ERRORS + 1))
else
    pass "无硬编码路径"
fi

# 检查 workspace 目录
WORKSPACE=$(python3 -c "import json; c=json.load(open('$CONFIG')); print(c.get('agents',{}).get('defaults',{}).get('workspace',''))" 2>/dev/null)

if [ -n "$WORKSPACE" ]; then
    if [ -d "$WORKSPACE" ]; then
        pass "Workspace 目录存在: $WORKSPACE"
    else
        warn "Workspace 目录不存在: $WORKSPACE (将自动创建)"
    fi
fi

# 3. 检查 Gateway 配置
echo ""
echo "3. 检查 Gateway 配置..."

TOKEN=$(python3 -c "import json; c=json.load(open('$CONFIG')); print(c.get('gateway',{}).get('auth',{}).get('token',''))" 2>/dev/null)
BASE_PATH=$(python3 -c "import json; c=json.load(open('$CONFIG')); print(c.get('gateway',{}).get('controlUi',{}).get('basePath',''))" 2>/dev/null)
PORT=$(python3 -c "import json; c=json.load(open('$CONFIG')); print(c.get('gateway',{}).get('port',18789))" 2>/dev/null)

if [ -n "$TOKEN" ]; then
    pass "Token 已配置: ${TOKEN:0:8}..."
else
    fail "Token 未配置"
    ERRORS=$((ERRORS + 1))
fi

if [ -n "$BASE_PATH" ]; then
    pass "BasePath 已配置: $BASE_PATH"
else
    fail "BasePath 未配置"
    ERRORS=$((ERRORS + 1))
fi

pass "端口: $PORT"

# 4. 检查 CORS 配置
echo ""
echo "4. 检查 CORS 配置..."

ORIGINS=$(python3 -c "import json; c=json.load(open('$CONFIG')); print('\n'.join(c.get('gateway',{}).get('controlUi',{}).get('allowedOrigins',[])))" 2>/dev/null)

if echo "$ORIGINS" | grep -q "^\*$"; then
    pass "允许所有来源 (*)"
fi

if echo "$ORIGINS" | grep -q "120.26.137.51"; then
    pass "包含灵犀云主服务器"
else
    warn "未包含灵犀云主服务器 (120.26.137.51)"
fi

# 5. 检查无效插件
echo ""
echo "5. 检查无效插件..."

if grep -qE 'alibaba-cloud-auth|alibaba-cloud-international-auth' "$CONFIG" 2>/dev/null; then
    fail "发现无效插件配置"
    ERRORS=$((ERRORS + 1))
else
    pass "无无效插件"
fi

# 6. 检查 Gateway 运行状态
echo ""
echo "6. 检查 Gateway 运行状态..."

if pgrep -f openclaw-gateway > /dev/null; then
    pass "Gateway 进程运行中"
    
    # 测试连接
    if curl -s "http://localhost:$PORT/$BASE_PATH/" 2>/dev/null | head -1 | grep -q "html"; then
        pass "Gateway 响应正常"
    else
        warn "Gateway 响应异常"
    fi
else
    fail "Gateway 未运行"
    ERRORS=$((ERRORS + 1))
fi

# 7. 检查灵犀云后端
echo ""
echo "7. 检查灵犀云后端..."

if curl -s "http://localhost:3000/health" > /dev/null 2>&1; then
    pass "灵犀云后端运行正常"
else
    warn "灵犀云后端未运行或未在 3000 端口"
fi

# 总结
echo ""
echo "=== 测试完成 ==="

if [ $ERRORS -eq 0 ]; then
    pass "所有检查通过！"
    echo ""
    echo "访问地址: http://$(curl -s ifconfig.me):$PORT/$BASE_PATH/?token=$TOKEN"
else
    fail "发现 $ERRORS 个错误，请运行修复脚本:"
    echo "  bash $HOME/.lingxi-cloud/installer/scripts/fix-config.sh"
fi

exit $ERRORS
