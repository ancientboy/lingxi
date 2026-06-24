#!/bin/bash
# 在 144 服务器上禁用 9Router 的 OpenCode Go 连接（套餐未续费）
# 用法: sudo bash scripts/disable-opencode-go-9router.sh

set -euo pipefail

DB="${NROUTER_DB:-/root/.9router/db/data.sqlite}"

if [ ! -f "$DB" ]; then
  echo "❌ 未找到 9Router 数据库: $DB"
  exit 1
fi

echo "🔧 禁用 OpenCode Go 连接 ($DB)..."

sqlite3 "$DB" <<'SQL'
-- 禁用 opencode-go / ocg 相关 provider 连接
UPDATE provider_connections
SET isActive = 0
WHERE provider LIKE '%opencode%'
   OR provider LIKE '%ocg%'
   OR id LIKE '%opencode%'
   OR id LIKE '%ocg%';

-- 禁用 opencode-go 相关模型别名（若表存在）
UPDATE disabled_models SET disabled = 1
WHERE model LIKE 'opencode-go/%' OR model LIKE 'ocg/%';
SQL

# 部分版本表名可能不同，尝试 connections 表
sqlite3 "$DB" "UPDATE connections SET isActive = 0 WHERE provider LIKE '%opencode%' OR provider LIKE '%ocg%';" 2>/dev/null || true

echo "✅ 已禁用 OpenCode Go 连接"
echo "📋 当前 opencode 相关连接状态:"
sqlite3 "$DB" "SELECT provider, id, isActive FROM provider_connections WHERE provider LIKE '%opencode%' OR provider LIKE '%ocg%' OR id LIKE '%opencode%';" 2>/dev/null || \
sqlite3 "$DB" "SELECT provider, id, isActive FROM connections WHERE provider LIKE '%opencode%' OR provider LIKE '%ocg%';" 2>/dev/null || \
echo "  (无 opencode 连接记录，或表结构不同 — 请在 http://127.0.0.1:20128/dashboard 手动关闭)"

echo ""
echo "🔄 请重启 9Router: pm2 restart 9router  或  systemctl restart 9router"
echo "🔄 然后重启灵犀云: pm2 restart lingxi-cloud"
