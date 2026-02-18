#!/bin/bash
cd /home/admin/.openclaw/workspace/lingxi-cloud/backend
while true; do
  echo "🚀 启动灵犀云后端..."
  node index.js
  echo "⚠️ 服务退出，5秒后重启..."
  sleep 5
done
