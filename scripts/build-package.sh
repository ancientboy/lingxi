#!/bin/bash
#
# 灵犀云安装包 - 打包脚本
#

set -e

VERSION=${1:-"1.0.0"}
PACKAGE_NAME="lingxi-cloud-installer-v${VERSION}"
BUILD_DIR="/tmp/${PACKAGE_NAME}"

echo "📦 打包灵犀云安装包 v${VERSION}"
echo ""

# 清理
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# 复制文件
echo "📋 复制文件..."
cp -r /home/admin/.openclaw/workspace/lingxi-cloud/installer/* "$BUILD_DIR/"

# 复制额外的必要文件
cp /home/admin/.openclaw/workspace/lingxi-cloud/README.md "$BUILD_DIR/"
cp /home/admin/.openclaw/workspace/lingxi-cloud/PRD.md "$BUILD_DIR/docs/" 2>/dev/null || mkdir -p "$BUILD_DIR/docs"

# 创建版本信息
cat > "$BUILD_DIR/VERSION" << EOF
{
  "version": "${VERSION}",
  "buildDate": "$(date -Iseconds)",
  "agents": 8,
  "skills": 20
}
EOF

# 打包
echo "📦 创建压缩包..."
cd /tmp
tar -czvf "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}"

# 移动到输出目录
OUTPUT_DIR="/home/admin/.openclaw/workspace/lingxi-cloud/releases"
mkdir -p "$OUTPUT_DIR"
mv "${PACKAGE_NAME}.tar.gz" "$OUTPUT_DIR/"

# 清理
rm -rf "$BUILD_DIR"

echo ""
echo "✅ 打包完成!"
echo "   文件: $OUTPUT_DIR/${PACKAGE_NAME}.tar.gz"
echo "   大小: $(du -sh "$OUTPUT_DIR/${PACKAGE_NAME}.tar.gz" | cut -f1)"
