#!/bin/bash
# 灵犀云 APK 发布脚本
# 用法: ./deploy-apk.sh
# 从 flutter-app 构建目录复制到所有需要的位置

set -e
SRC="/home/admin/.openclaw/workspace/lingxi-cloud/flutter-app/build/app/outputs/flutter-apk/app-release.apk"

if [ ! -f "$SRC" ]; then
  echo "❌ APK 不存在，请先构建"
  exit 1
fi

VERSION="v1.9.0-$(date +%Y%m%d%H%M)"
echo "📦 发布版本: $VERSION"
echo "📄 源文件: $SRC ($(du -h "$SRC" | cut -f1))"

# 唯一分发目录
DEST="/home/admin/.openclaw/workspace/lingxi-cloud/frontend/public/lingxi.apk"

cp -f "$SRC" "$DEST"
echo "✅ 已部署到: $DEST"

# 验证
ORIG_MD5=$(md5sum "$SRC" | cut -c1-8)
DEST_MD5=$(md5sum "$DEST" | cut -c1-8)

if [ "$ORIG_MD5" = "$DEST_MD5" ]; then
  echo "✅ 校验通过: $ORIG_MD5"
  echo "🔗 下载链接: http://120.55.192.144:3000/lingxi.apk"
else
  echo "❌ 校验失败! 源=$ORIG_MD5 目标=$DEST_MD5"
  exit 1
fi
