#!/bin/bash
#
# 实例预热脚本 - 预创建 OpenClaw 实例池
#

set -e

echo "🔥 灵犀云 - 实例预热"
echo "===================="

# 配置
INSTANCES_DIR="/data/lingxi-instances"
BASE_PORT=19000
PREHEAT_COUNT=${1:-3}  # 默认预热 3 个实例

echo "预热实例数: $PREHEAT_COUNT"
echo ""

# 创建目录
mkdir -p "$INSTANCES_DIR"

# 检查 Docker
if ! docker ps > /dev/null 2>&1; then
    echo "❌ Docker 未运行"
    exit 1
fi

# 获取已运行的实例
RUNNING=$(docker ps --format "{{.Names}}" | grep "lingxi-user-" | wc -l)
echo "已运行实例: $RUNNING"
echo ""

# 预热实例
for i in $(seq 1 $PREHEAT_COUNT); do
    PORT=$((BASE_PORT + i - 1))
    INSTANCE_ID="lingxi-user-$PORT"
    
    # 检查是否已存在
    if docker ps -a --format "{{.Names}}" | grep -q "^$INSTANCE_ID$"; then
        echo "⚠️  $INSTANCE_ID 已存在，跳过"
        continue
    fi
    
    echo "🚀 创建实例: $INSTANCE_ID (端口: $PORT)"
    
    # 创建配置目录
    CONFIG_DIR="$INSTANCES_DIR/$INSTANCE_ID/config"
    DATA_DIR="$INSTANCES_DIR/$INSTANCE_ID/data"
    mkdir -p "$CONFIG_DIR" "$DATA_DIR"
    
    # 创建基础配置
    cat > "$CONFIG_DIR/openclaw.json" << 'EOF'
{
  "agents": {
    "defaults": {
      "model": { "primary": "zhipu/glm-5" },
      "workspace": "/workspace"
    },
    "list": [{ "id": "main", "default": true, "name": "灵犀" }]
  },
  "server": { "port": 18789, "host": "0.0.0.0" }
}
EOF
    
    # 启动容器
    docker run -d \
        --name "$INSTANCE_ID" \
        -p $PORT:18789 \
        -v "$CONFIG_DIR:/config" \
        -v "$DATA_DIR:/data" \
        --restart unless-stopped \
        openclaw/openclaw:latest > /dev/null
    
    echo "   ✅ 已启动"
done

echo ""
echo "=== 预热完成 ==="
echo ""

# 显示实例列表
echo "运行中的实例:"
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}" | grep lingxi-user

echo ""
echo "分配实例 API:"
echo "curl -X POST http://120.55.192.144:3000/api/instance/assign -H 'Content-Type: application/json' -d '{\"userId\":\"test\"}'"
