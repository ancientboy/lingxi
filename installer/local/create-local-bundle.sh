#!/bin/bash
# 本机 OpenClaw 资源包 — 供 Lume 桌面客户端内置，不含 SSH 部署逻辑
# 输出: releases/local/lume-local-openclaw-<version>.tar.gz

set -euo pipefail

OPENCLAW_VERSION="${OPENCLAW_VERSION:-2026.6.9}"
PACKAGE_REV="${LOCAL_PACKAGE_REV:-1}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLER_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$INSTALLER_ROOT")"
OUTPUT_DIR="${OUTPUT_DIR:-${PROJECT_ROOT}/releases/local}"
PACKAGE_NAME="lume-local-openclaw-${OPENCLAW_VERSION}-r${PACKAGE_REV}"
PACKAGE_DIR="${OUTPUT_DIR}/${PACKAGE_NAME}"

rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}/.openclaw/workspace"
mkdir -p "${PACKAGE_DIR}/.openclaw/agents/main/agent"

# 最小模板（Key 由桌面 bootstrap API 写入）
sed -e "s/PLACEHOLDER_OPENCLAW_VERSION/${OPENCLAW_VERSION}/g" \
    -e "s/GATEWAY_TOKEN_PLACEHOLDER/local-bootstrap/g" \
    -e "s/SESSION_ID_PLACEHOLDER/local/g" \
    "${SCRIPT_DIR}/config/openclaw.local.template.json" \
    > "${PACKAGE_DIR}/.openclaw/openclaw.json"

# Agent 记忆（lingxi -> main）
for pair in lingxi:main coder:coder ops:ops inventor:inventor pm:pm noter:noter media:media smart:smart; do
  SRC="${pair%%:*}"
  DST="${pair##:*}"
  mkdir -p "${PACKAGE_DIR}/.openclaw/agents/${DST}/agent"
  if [ -f "${INSTALLER_ROOT}/agents/${SRC}/SOUL.md" ]; then
    cp "${INSTALLER_ROOT}/agents/${SRC}/SOUL.md" "${PACKAGE_DIR}/.openclaw/agents/${DST}/agent/"
  fi
done

echo '{"version":1,"profiles":{},"lastGood":{}}' > "${PACKAGE_DIR}/.openclaw/agents/main/auth-profiles.json"
cp "${PACKAGE_DIR}/.openclaw/agents/main/auth-profiles.json" \
   "${PACKAGE_DIR}/.openclaw/agents/main/agent/auth-profiles.json"

cat > "${PACKAGE_DIR}/lume-local.marker.json" << MARKER
{
  "kind": "lume-local-openclaw",
  "openclawVersion": "${OPENCLAW_VERSION}",
  "packageRev": "${PACKAGE_REV}",
  "builtAt": "$(date -Iseconds)"
}
MARKER

mkdir -p "${OUTPUT_DIR}"
tar -czf "${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz" -C "${OUTPUT_DIR}" "${PACKAGE_NAME}"
echo "✅ ${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"
