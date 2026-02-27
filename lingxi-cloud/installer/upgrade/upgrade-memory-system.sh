#!/bin/bash
# 记忆系统升级脚本
# 用法: ./upgrade-memory-system.sh <用户服务器IP>

SERVER_IP=$1
SERVER_PASSWORD="Lingxi@2026!"

if [ -z "$SERVER_IP" ]; then
  echo "用法: ./upgrade-memory-system.sh <IP>"
  exit 1
fi

echo "🚀 开始升级记忆系统: $SERVER_IP"

# 1. 升级记忆系统文件
echo "📦 升级记忆系统文件..."
sshpass -p "$SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER_IP << 'REMOTE'
  # 创建目录
  mkdir -p ~/.openclaw/workspace/skills/memory-system
  mkdir -p ~/.openclaw/memory/domains
  mkdir -p ~/.openclaw/cron
  
  echo "✅ 目录已创建"
REMOTE

# 2. 推送新文件
echo "📤 推送新文件..."
sshpass -p "$SERVER_PASSWORD" scp -o StrictHostKeyChecking=no \
  /home/admin/.openclaw/workspace/lingxi-cloud/installer/skills/memory-system/auto-memory.mjs \
  root@$SERVER_IP:~/.openclaw/workspace/skills/memory-system/

sshpass -p "$SERVER_PASSWORD" scp -o StrictHostKeyChecking=no \
  /home/admin/.openclaw/workspace/lingxi-cloud/installer/skills/memory-system/conversation-summary.mjs \
  root@$SERVER_IP:~/.openclaw/workspace/skills/memory-system/

# 3. 推送配置文件
echo "⚙️ 推送配置文件..."
sshpass -p "$SERVER_PASSWORD" scp -o StrictHostKeyChecking=no \
  /home/admin/.openclaw/workspace/lingxi-cloud/installer/config/memory-config.json \
  root@$SERVER_IP:~/.openclaw/workspace/

sshpass -p "$SERVER_PASSWORD" scp -o StrictHostKeyChecking=no \
  /home/admin/.openclaw/workspace/lingxi-cloud/installer/config/HEARTBEAT.md \
  root@$SERVER_IP:~/.openclaw/workspace/

# 4. 推送 Cron 任务
echo "⏰ 推送 Cron 任务..."
sshpass -p "$SERVER_PASSWORD" scp -o StrictHostKeyChecking=no \
  /home/admin/.openclaw/workspace/lingxi-cloud/installer/cron/daily-summary.mjs \
  root@$SERVER_IP:~/.openclaw/cron/

# 5. 更新 openclaw.json
echo "🔧 更新配置..."
sshpass -p "$SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER_IP << 'REMOTE'
  # 添加记忆配置到 openclaw.json
  if [ -f ~/.openclaw/openclaw.json ]; then
    # 备份
    cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak
    
    # 添加记忆配置（如果不存在）
    if ! grep -q "heartbeat" ~/.openclaw/openclaw.json; then
      # 使用 node 添加配置
      node -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('${HOME}/.openclaw/openclaw.json', 'utf8'));
        
        // 添加 heartbeat 配置
        if (!config.agents) config.agents = {};
        if (!config.agents.defaults) config.agents.defaults = {};
        config.agents.defaults.heartbeat = {
          every: '30m',
          target: 'none'
        };
        
        // 添加 channels 配置
        if (!config.channels) config.channels = {};
        if (!config.channels.defaults) config.channels.defaults = {};
        config.channels.defaults.heartbeat = {
          showOk: false,
          showAlerts: false,
          useIndicator: false
        };
        
        fs.writeFileSync('${HOME}/.openclaw/openclaw.json', JSON.stringify(config, null, 2));
        console.log('✅ 配置已更新');
      "
    fi
  fi
  
  # 创建 memory-config.json（如果不存在）
  if [ ! -f ~/.openclaw/workspace/memory-config.json ]; then
    cat > ~/.openclaw/workspace/memory-config.json << 'CONFIG'
{
  "primary": "supermemory",
  "local": { "enabled": true },
  "supermemory": { "enabled": true },
  "syncStrategy": "auto"
}
CONFIG
  fi
  
  echo "✅ 升级完成"
REMOTE

echo "✅ 记忆系统升级完成: $SERVER_IP"
