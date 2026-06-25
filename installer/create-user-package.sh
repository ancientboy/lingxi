#!/bin/bash
# 已迁移至云端专用打包脚本 — 请勿直接调用本脚本
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "⚠️  create-user-package.sh 已弃用，请使用: installer/cloud/create-cloud-package.sh"
exec "${SCRIPT_DIR}/cloud/create-cloud-package.sh" "$@"
