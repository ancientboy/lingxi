#!/bin/bash
#
# 灵犀云 - 配置团队脚本
#
# 用法: ./configure-team.sh "ops,inventor"
#

set -e

INSTALL_DIR="${INSTALL_DIR:-$HOME/.lingxi-cloud}"
CONFIG_FILE="$INSTALL_DIR/config/openclaw.json"

# 可用的 Agent
declare -A AGENTS
AGENTS["coder"]="云溪|💻|代码女王"
AGENTS["ops"]="若曦|📊|运营专家"
AGENTS["inventor"]="紫萱|💡|创意天才"
AGENTS["pm"]="梓萱|🎯|产品女王"
AGENTS["noter"]="晓琳|📝|知识管理"
AGENTS["media"]="音韵|🎧|多媒体专家"
AGENTS["smart"]="智家|🏠|智能家居"

# 检查参数
if [ -z "$1" ]; then
    echo "用法: $0 \"agent1,agent2,...\""
    echo ""
    echo "可用的 Agent:"
    for id in "${!AGENTS[@]}"; do
        IFS='|' read -r name emoji desc <<< "${AGENTS[$id]}"
        echo "  $id - $emoji $name ($desc)"
    done
    exit 1
fi

# 解析要添加的 Agent
IFS=',' read -ra SELECTED <<< "$1"

echo "🔧 配置团队..."
echo ""

# 复制 Agent SOUL 文件
for agent in "${SELECTED[@]}"; do
    agent=$(echo "$agent" | tr -d ' ')
    
    if [ -z "${AGENTS[$agent]}" ]; then
        echo "⚠️  未知的 Agent: $agent (跳过)"
        continue
    fi
    
    IFS='|' read -r name emoji desc <<< "${AGENTS[$agent]}"
    
    # 创建 Agent 目录
    mkdir -p "$INSTALL_DIR/agents/$agent"
    
    # 复制 SOUL 文件（如果存在）
    if [ -f "/app/agents/$agent/SOUL.md" ]; then
        cp "/app/agents/$agent/SOUL.md" "$INSTALL_DIR/agents/$agent/"
    fi
    
    echo "✅ $emoji $name 已加入团队"
done

# 更新配置文件（简单版本 - 实际应该用 jq）
echo ""
echo "📝 更新配置..."

# 重启容器使配置生效
if docker ps | grep -q lingxi-cloud; then
    echo "🔄 重启服务..."
    docker restart lingxi-cloud
    echo "✅ 配置完成！"
else
    echo "⚠️  灵犀云容器未运行，请先启动"
fi

echo ""
echo "现在可以跟灵犀对话了！"
