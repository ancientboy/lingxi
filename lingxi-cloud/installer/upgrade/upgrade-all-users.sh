#!/bin/bash
# 批量升级所有用户到新记忆系统

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_FILE="${PROJECT_ROOT}/backend/data/db.json"

echo "╔══════════════════════════════════════════════════════╗"
echo "║   ⚡ 灵犀云 - 批量升级记忆系统                       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# 读取所有运行中的服务器
SERVERS=$(node -e "
const db = require('${DB_FILE}');
const servers = db.userServers || [];
const running = servers.filter(s => s.status === 'running' && s.ip);
running.forEach(s => console.log(s.ip));
")

if [ -z "$SERVERS" ]; then
  echo "❌ 没有找到运行中的服务器"
  exit 1
fi

echo "📋 找到以下服务器："
echo "$SERVERS" | while read ip; do
  echo "  - $ip"
done
echo ""

# 确认升级
read -p "确认升级所有服务器？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 取消升级"
  exit 1
fi

# 批量升级
echo ""
echo "🚀 开始批量升级..."
echo ""

SUCCESS=0
FAILED=0

echo "$SERVERS" | while read ip; do
  echo "📦 升级: $ip"
  
  if bash "${SCRIPT_DIR}/upgrade-memory-system.sh" "$ip"; then
    echo "  ✅ 成功"
    ((SUCCESS++))
  else
    echo "  ❌ 失败"
    ((FAILED++))
  fi
done

echo ""
echo "═══════════════════════════════════════"
echo "📊 升级完成"
echo "  ✅ 成功: $SUCCESS"
echo "  ❌ 失败: $FAILED"
echo "═══════════════════════════════════════"
