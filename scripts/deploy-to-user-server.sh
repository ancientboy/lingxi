#!/bin/bash

ACR_REGISTRY="crpi-bcyqkynua4upy5gp.cn-hangzhou.personal.cr.aliyuncs.com/lingxi-cloud2026/lingxi-cloud"
IMAGE_TAG="${1:-latest}"
SERVER_IP="${2}"
OPENCLAW_TOKEN="${3}"
OPENCLAW_SESSION="${4}"

SSH_PASSWORD="Lingxi@2026!"

if [ -z "$SERVER_IP" ] || [ -z "$OPENCLAW_TOKEN" ] || [ -z "$OPENCLAW_SESSION" ]; then
    echo "用法: $0 [镜像标签] <服务器IP> <Token> <Session>"
    echo "示例: $0 latest 1.2.3.4 abc123 def456"
    exit 1
fi

echo "🚀 开始部署 lingxi-cloud 到 $SERVER_IP"
echo "📦 镜像: $ACR_REGISTRY:$IMAGE_TAG"
echo "🔑 Token: $OPENCLAW_TOKEN"
echo "🏷️  Session: $OPENCLAW_SESSION"

sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no root@$SERVER_IP << EOF
    set -e
    
    echo "1️⃣ 检查 Docker..."
    if ! command -v docker &> /dev/null; then
        echo "安装 Docker..."
        curl -fsSL https://get.docker.com | sh
        systemctl start docker
        systemctl enable docker
    fi
    
    echo "2️⃣ 停止旧容器..."
    docker stop lingxi-cloud 2>/dev/null || true
    docker rm lingxi-cloud 2>/dev/null || true
    
    echo "3️⃣ 拉取最新镜像..."
    docker pull $ACR_REGISTRY:$IMAGE_TAG
    
    echo "4️⃣ 创建配置目录..."
    mkdir -p /data/lingxi/{config,data,logs}
    
    echo "5️⃣ 生成配置文件..."
    cat > /data/lingxi/config/openclaw.json << 'CONFIG_EOF'
{
  "agents": {
    "defaults": {
      "model": { "primary": "zhipu/glm-5" },
      "workspace": "/workspace",
      "memory": { "enabled": true, "provider": "local", "path": "/data/memory" }
    },
    "list": [{ "id": "lingxi", "default": true, "name": "灵犀", "soul": "/home/node/.openclaw/agents/lingxi/SOUL.md" }]
  },
  "tools": {
    "subagents": { "enabled": true, "tools": { "allow": ["lingxi", "coder", "ops", "inventor", "pm", "noter", "media", "smart"] } },
    "filesystem": { "enabled": true, "paths": ["/workspace", "/data"] },
    "shell": { "enabled": true, "allowed": ["ls", "cat", "grep", "find", "mkdir", "touch"] }
  },
  "skills": { "paths": ["/home/node/.openclaw/skills"] },
  "server": { "port": 18789, "host": "0.0.0.0" },
  "gateway": { "auth": { "token": "TOKEN_PLACEHOLDER" }, "session": { "default": "SESSION_PLACEHOLDER" } }
}
CONFIG_EOF
    
    sed -i "s/TOKEN_PLACEHOLDER/$OPENCLAW_TOKEN/g" /data/lingxi/config/openclaw.json
    sed -i "s/SESSION_PLACEHOLDER/$OPENCLAW_SESSION/g" /data/lingxi/config/openclaw.json
    
    echo "6️⃣ 启动容器..."
    docker run -d \
        --name lingxi-cloud \
        -p 18789:18789 \
        -v /data/lingxi/config:/home/node/.openclaw \
        -v /data/lingxi/data:/home/node/.openclaw/data \
        -v /data/lingxi/logs:/home/node/.openclaw/logs \
        --restart unless-stopped \
        $ACR_REGISTRY:$IMAGE_TAG
    
    echo "7️⃣ 等待服务启动..."
    sleep 10
    
    echo "8️⃣ 检查服务状态..."
    curl -s http://localhost:18789/health || echo "服务启动中..."
    
    echo "✅ 部署完成!"
    echo "🌐 访问地址: http://$SERVER_IP:18789/$OPENCLAW_SESSION?token=$OPENCLAW_TOKEN"
EOF

echo ""
echo "🎉 部署成功!"
echo "访问地址: http://$SERVER_IP:18789/$OPENCLAW_SESSION?token=$OPENCLAW_TOKEN"
