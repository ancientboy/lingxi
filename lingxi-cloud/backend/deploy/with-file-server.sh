#!/bin/bash
# 带文件服务部署的打包脚本
# 在部署用户实例时，自动部署文件服务

set -e

echo "📦 开始打包用户实例（含文件服务）..."

# 1. 复制文件服务脚本到部署包
echo "📝 添加文件服务脚本..."
mkdir -p .opencl
cp /home/admin/.openclaw/workspace/lingxi-cloud/deploy/file-server-unified.js .openclaw/file-server.js

echo "✅ 文件服务脚本已添加"
