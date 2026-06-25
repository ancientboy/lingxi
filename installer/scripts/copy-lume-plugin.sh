#!/bin/bash
# 将 openclaw-lume 插件复制到部署包内的 ~/.openclaw/workspace/plugins/openclaw-lume
# 用法: copy-lume-plugin.sh <INSTALLER_ROOT> <PACKAGE_DIR>

set -euo pipefail

INSTALLER_ROOT="${1:?缺少 INSTALLER_ROOT}"
PACKAGE_DIR="${2:?缺少 PACKAGE_DIR}"

PLUGIN_SRC="${INSTALLER_ROOT}/plugins/openclaw-lume"
PLUGIN_DST="${PACKAGE_DIR}/.openclaw/workspace/plugins/openclaw-lume"

if [ ! -f "${PLUGIN_SRC}/openclaw.plugin.json" ]; then
  echo "❌ Lume 插件不存在: ${PLUGIN_SRC}"
  exit 1
fi

rm -rf "${PLUGIN_DST}"
mkdir -p "${PLUGIN_DST}"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude node_modules --exclude '*.bak' "${PLUGIN_SRC}/" "${PLUGIN_DST}/"
else
  tar -cf - -C "${PLUGIN_SRC}" \
    --exclude=node_modules \
    --exclude='*.bak' \
    . | tar -xf - -C "${PLUGIN_DST}"
fi

echo "✅ Lume 插件已复制到包内: workspace/plugins/openclaw-lume"
