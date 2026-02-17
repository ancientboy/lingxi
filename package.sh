#!/bin/bash
# 灵犀云打包脚本

set -e

VERSION=${1:-"1.0.0"}
PACKAGE_NAME="lingxi-cloud-${VERSION}"
DIST_DIR="dist/${PACKAGE_NAME}"

echo "╔══════════════════════════════════════╗"
echo "║   ⚡ 灵犀云 - 打包 v${VERSION}            ║"
echo "║      新增：飞书一键配置              ║"
echo "╚══════════════════════════════════════╝"
echo ""

# 清理
echo "🧹 清理旧文件..."
rm -rf dist
mkdir -p dist

# 创建打包目录
mkdir -p ${DIST_DIR}

# 复制文件
echo "📦 复制文件..."

# 后端（不包含 node_modules）
cp -r backend ${DIST_DIR}/
rm -rf ${DIST_DIR}/backend/node_modules

# 前端
cp -r frontend ${DIST_DIR}/

# 部署脚本
cp -r deploy ${DIST_DIR}/

# 安装脚本
cp install.sh ${DIST_DIR}/
cp deploy.sh ${DIST_DIR}/
chmod +x ${DIST_DIR}/*.sh

# 文档
cp README.md ${DIST_DIR}/
cp PRD.md ${DIST_DIR}/
cp ARCHITECTURE.md ${DIST_DIR}/
cp TASKS.md ${DIST_DIR}/

# 配置示例
cp backend/.env.example ${DIST_DIR}/backend/.env

# 创建版本文件
echo "{\"version\": \"${VERSION}\", \"build\": \"$(date -Iseconds)\"}" > ${DIST_DIR}/version.json

# 打包
echo "🗜️  打包中..."
cd dist
tar -czf ${PACKAGE_NAME}.tar.gz ${PACKAGE_NAME}

# 计算 hash
HASH=$(sha256sum ${PACKAGE_NAME}.tar.gz | cut -d' ' -f1)
echo "{\"version\": \"${VERSION}\", \"hash\": \"${HASH}\", \"file\": \"${PACKAGE_NAME}.tar.gz\"}" > ${PACKAGE_NAME}.json

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     ✅ 打包完成！                    ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "📦 包名: dist/${PACKAGE_NAME}.tar.gz"
echo "📋 大小: $(du -h dist/${PACKAGE_NAME}.tar.gz | cut -f1)"
echo "🔐 Hash: ${HASH:0:16}..."
echo ""
echo "📤 部署方法:"
echo "   1. 上传到服务器: scp dist/${PACKAGE_NAME}.tar.gz user@server:/opt/"
echo "   2. 解压: tar -xzf ${PACKAGE_NAME}.tar.gz"
echo "   3. 安装: cd ${PACKAGE_NAME} && ./install.sh"
echo "   4. 启动: ./deploy.sh YOUR_SERVER_IP"
echo ""
