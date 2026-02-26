#!/bin/bash

# OpenClaw 配置路径修复脚本
# 用于修复从其他服务器拷贝配置后的路径问题

set -e

echo "=== OpenClaw 配置路径修复工具 ==="
echo ""

# 获取当前用户信息
CURRENT_USER=$(whoami)
CURRENT_HOME=$(eval echo ~$CURRENT_USER)
CONFIG_FILE="$CURRENT_HOME/.openclaw/openclaw.json"

echo "当前用户: $CURRENT_USER"
echo "用户目录: $CURRENT_HOME"
echo "配置文件: $CONFIG_FILE"
echo ""

# 检查配置文件是否存在
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ 错误: 配置文件不存在: $CONFIG_FILE"
    echo ""
    echo "请先运行 OpenClaw 向导:"
    echo "  openclaw onboard"
    exit 1
fi

# 备份配置文件
BACKUP_FILE="$CONFIG_FILE.backup-$(date +%Y%m%d-%H%M%S)"
cp "$CONFIG_FILE" "$BACKUP_FILE"
echo "✅ 已备份配置文件到: $BACKUP_FILE"
echo ""

# 询问原用户名（配置文件中的硬编码用户名）
read -p "请输入原配置文件中的用户名 (默认: admin): " ORIGINAL_USER
ORIGINAL_USER=${ORIGINAL_USER:-admin}

echo ""
echo "将把所有 /home/$ORIGINAL_USER 替换为 /home/$CURRENT_USER ..."

# 使用 Python 进行 JSON 安全替换（避免破坏 JSON 结构）
python3 << EOF
import json
import sys

config_file = "$CONFIG_FILE"
original_user = "$ORIGINAL_USER"
current_user = "$CURRENT_USER"

try:
    with open(config_file, 'r') as f:
        content = f.read()
    
    # 替换路径
    new_content = content.replace(f'/home/{original_user}', f'/home/{current_user}')
    
    # 验证 JSON 格式
    json.loads(new_content)
    
    # 写回文件
    with open(config_file, 'w') as f:
        f.write(new_content)
    
    print(f'✅ 路径替换完成')
    print(f'   原路径: /home/{original_user}')
    print(f'   新路径: /home/{current_user}')
    
except json.JSONDecodeError as e:
    print(f'❌ JSON 格式错误: {e}')
    sys.exit(1)
except Exception as e:
    print(f'❌ 错误: {e}')
    sys.exit(1)
EOF

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 路径替换失败，正在恢复备份..."
    cp "$BACKUP_FILE" "$CONFIG_FILE"
    exit 1
fi

echo ""
echo "=== 验证配置 ==="

# 检查目录是否存在
WORKSPACE_DIR=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['agents']['defaults']['workspace'])")
if [ ! -d "$WORKSPACE_DIR" ]; then
    echo "⚠️  工作目录不存在: $WORKSPACE_DIR"
    read -p "是否创建? (y/n): " CREATE_DIR
    if [ "$CREATE_DIR" = "y" ]; then
        mkdir -p "$WORKSPACE_DIR"
        echo "✅ 已创建工作目录"
    fi
else
    echo "✅ 工作目录存在: $WORKSPACE_DIR"
fi

echo ""
echo "=== 重启 OpenClaw Gateway ==="
read -p "是否现在重启 Gateway? (y/n): " RESTART_GW

if [ "$RESTART_GW" = "y" ]; then
    openclaw gateway restart
    sleep 3
    
    # 检查状态
    if curl -s http://localhost:18789/health > /dev/null 2>&1; then
        echo "✅ Gateway 启动成功"
    else
        echo "⚠️  Gateway 可能未启动，请检查日志:"
        echo "   tail -f ~/.openclaw/logs/gateway.log"
    fi
fi

echo ""
echo "=== 修复完成 ==="
echo ""
echo "如果仍有问题，请运行:"
echo "  openclaw config validate"
echo "  openclaw gateway status"
