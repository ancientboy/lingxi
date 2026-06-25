#!/bin/bash
# 云端 OpenClaw 部署包（SSH / ECS 专用，不含本机 Mac 安装逻辑）
# 用法: create-cloud-package.sh <userId> <gatewayToken> <sessionId>
# 环境变量: ZHIPU_API_KEY, DASHSCOPE_API_KEY, OPENCLAW_VERSION, CLOUD_PACKAGE_REV, OUTPUT_DIR

set -euo pipefail

USER_ID="${1:?缺少 userId}"
GATEWAY_TOKEN="${2:?缺少 gatewayToken}"
SESSION_ID="${3:?缺少 sessionId}"

OPENCLAW_VERSION="${OPENCLAW_VERSION:-2026.6.9}"
PACKAGE_REV="${CLOUD_PACKAGE_REV:-1}"
ZHIPU_KEY="${ZHIPU_API_KEY:-}"
DASHSCOPE_KEY="${DASHSCOPE_API_KEY:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLER_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$INSTALLER_ROOT")"
OUTPUT_DIR="${OUTPUT_DIR:-${PROJECT_ROOT}/releases/cloud}"
PACKAGE_NAME="lingxi-cloud-${USER_ID}-${OPENCLAW_VERSION}-r${PACKAGE_REV}"
PACKAGE_DIR="${OUTPUT_DIR}/${PACKAGE_NAME}"

echo "╔══════════════════════════════════════════════════════╗"
echo "║   Lume 云端 OpenClaw 部署包                          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo "用户: ${USER_ID}"
echo "OpenClaw: ${OPENCLAW_VERSION}"
echo "输出: ${OUTPUT_DIR}"
echo ""

rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}/.openclaw/workspace"
mkdir -p "${PACKAGE_DIR}/.openclaw/agents/main/agent"

# --- openclaw.json ---
sed -e "s/GATEWAY_TOKEN_PLACEHOLDER/${GATEWAY_TOKEN}/g" \
    -e "s/SESSION_ID_PLACEHOLDER/${SESSION_ID}/g" \
    -e "s/ZHIPU_API_KEY_PLACEHOLDER/${ZHIPU_KEY}/g" \
    -e "s/DASHSCOPE_API_KEY_PLACEHOLDER/${DASHSCOPE_KEY}/g" \
    "${INSTALLER_ROOT}/config/openclaw.json" > "${PACKAGE_DIR}/.openclaw/openclaw.json"

# --- Agent 记忆：lingxi -> main ---
AGENT_MAP="lingxi:main coder:coder ops:ops inventor:inventor pm:pm noter:noter media:media smart:smart"
for pair in $AGENT_MAP; do
  SRC="${pair%%:*}"
  DST="${pair##*:}"
  mkdir -p "${PACKAGE_DIR}/.openclaw/agents/${DST}/agent"
  if [ -f "${INSTALLER_ROOT}/agents/${SRC}/SOUL.md" ]; then
    cp "${INSTALLER_ROOT}/agents/${SRC}/SOUL.md" "${PACKAGE_DIR}/.openclaw/agents/${DST}/agent/"
  fi
  if [ -f "${INSTALLER_ROOT}/agents/${SRC}/TEAM.md" ]; then
    cp "${INSTALLER_ROOT}/agents/${SRC}/TEAM.md" "${PACKAGE_DIR}/.openclaw/agents/${DST}/agent/"
  fi
  if [ -f "${INSTALLER_ROOT}/agents/${SRC}/WORKFLOW.md" ]; then
    cp "${INSTALLER_ROOT}/agents/${SRC}/WORKFLOW.md" "${PACKAGE_DIR}/.openclaw/agents/${DST}/agent/"
  fi
done

# auth-profiles 由远程 deploy 脚本写入（避免包内携带明文 Key 副本）
echo '{"version":1,"profiles":{},"lastGood":{}}' > "${PACKAGE_DIR}/.openclaw/agents/main/auth-profiles.json"
cp "${PACKAGE_DIR}/.openclaw/agents/main/auth-profiles.json" \
   "${PACKAGE_DIR}/.openclaw/agents/main/agent/auth-profiles.json"

# skills / genes
if [ -d "${INSTALLER_ROOT}/skills" ]; then
  mkdir -p "${PACKAGE_DIR}/.openclaw/skills"
  cp -r "${INSTALLER_ROOT}/skills/"* "${PACKAGE_DIR}/.openclaw/skills/" 2>/dev/null || true
fi
if [ -d "${INSTALLER_ROOT}/genes" ]; then
  mkdir -p "${PACKAGE_DIR}/.openclaw/genes"
  cp -r "${INSTALLER_ROOT}/genes/"* "${PACKAGE_DIR}/.openclaw/genes/" 2>/dev/null || true
fi

cat > "${PACKAGE_DIR}/package-meta.json" << META
{
  "kind": "lume-cloud-openclaw",
  "userId": "${USER_ID}",
  "openclawVersion": "${OPENCLAW_VERSION}",
  "packageRev": "${PACKAGE_REV}",
  "sessionId": "${SESSION_ID}",
  "builtAt": "$(date -Iseconds)"
}
META

cat > "${PACKAGE_DIR}/README.md" << 'README'
# Lume 云端 OpenClaw 部署包

此包仅用于 **SSH 远程 / 阿里云 ECS** 部署，由 `backend/routes/deploy.js` 自动上传执行。

- 不要与 `installer/local/` 本机桌面包混用
- API Key 在服务器上由部署脚本注入 `auth-profiles.json`
README

mkdir -p "${OUTPUT_DIR}"
tar -czf "${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz" -C "${OUTPUT_DIR}" "${PACKAGE_NAME}"
echo "✅ ${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"
