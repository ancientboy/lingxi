#!/bin/bash
#
# 启动灵犀云前端服务
#

PORT=${1:-8080}
FRONTEND_DIR="/home/admin/.openclaw/workspace/lingxi-cloud/frontend"

echo "🌐 启动灵犀云前端服务"
echo "   端口: $PORT"
echo "   目录: $FRONTEND_DIR"
echo ""

cd "$FRONTEND_DIR"

# 使用 Python 启动 HTTP 服务
if command -v python3 &> /dev/null; then
    echo "访问地址: http://120.26.137.51:$PORT"
    echo ""
    python3 -m http.server $PORT --bind 0.0.0.0
elif command -v python &> /dev/null; then
    echo "访问地址: http://120.26.137.51:$PORT"
    echo ""
    python -m SimpleHTTPServer $PORT
else
    echo "❌ 需要 Python"
    exit 1
fi
