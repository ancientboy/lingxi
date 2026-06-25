/**
 * 云端 ECS / SSH 远程部署脚本生成（不含本机桌面安装逻辑）
 */

import {
  OPENCLAW_VERSION,
  NODE_VERSION,
  OPENCLAW_OSS_URL,
  NODE_OSS_URL,
} from './openclaw-deploy-constants.js';

function authProfilesObject(zhipuKey, dashscopeKey) {
  return {
    version: 1,
    profiles: {
      'zhipu:default': {
        type: 'api_key',
        provider: 'zhipu',
        key: zhipuKey || '',
      },
      'alibaba-cloud:default': {
        type: 'api_key',
        provider: 'alibaba-cloud',
        key: dashscopeKey || '',
      },
    },
    lastGood: {
      zhipu: 'zhipu:default',
      'alibaba-cloud': 'alibaba-cloud:default',
    },
  };
}

/**
 * 生成在目标 Linux 服务器上执行的 bash 脚本
 */
export function buildCloudRemoteDeployScript({
  packageFile,
  packageName,
  serverIp,
  useCustomImage,
  zhipuKey,
  dashscopeKey,
}) {
  const authB64 = Buffer.from(JSON.stringify(authProfilesObject(zhipuKey, dashscopeKey))).toString(
    'base64',
  );

  const installSteps = useCustomImage
    ? `
echo "⚡ 使用自定义镜像，跳过 Node / OpenClaw 安装..."
echo "Node: $(node --version 2>/dev/null || echo missing)"
echo "OpenClaw: $(openclaw --version 2>/dev/null || echo missing)"
`
    : `
echo "2️⃣ 安装 Node.js ${NODE_VERSION}..."
if ! node --version 2>/dev/null | grep -q "v22"; then
    apt-get update -qq
    apt-get install -y xz-utils wget
    wget -q '${NODE_OSS_URL}' -O /tmp/node22.tar.xz
    tar -xf /tmp/node22.tar.xz -C /tmp
    cp -r /tmp/node-v${NODE_VERSION}-linux-x64/* /usr/local/
    rm -f /usr/bin/node /usr/bin/npm
    ln -sf /usr/local/bin/node /usr/bin/node
    ln -sf /usr/local/bin/npm /usr/bin/npm
    rm -rf /tmp/node22.tar.xz /tmp/node-v${NODE_VERSION}-linux-x64
fi
echo "Node: $(node --version)"

echo "3️⃣ 配置 git HTTPS..."
git config --global url."https://github.com/".insteadOf git@github.com: 2>/dev/null || true
git config --global url."https://github.com/".insteadOf ssh://git@github.com/ 2>/dev/null || true

echo "4️⃣ 安装 OpenClaw ${OPENCLAW_VERSION}..."
${OPENCLAW_OSS_URL
  ? `wget -q '${OPENCLAW_OSS_URL}' -O /tmp/openclaw.tgz
npm install -g /tmp/openclaw.tgz
rm -f /tmp/openclaw.tgz`
  : `npm install -g openclaw@${OPENCLAW_VERSION}`}
echo "OpenClaw: $(openclaw --version 2>/dev/null || echo install-failed)"
`;

  return `
set -e
cd /root

echo "1️⃣ 解压云端部署包..."
tar -xzf ${packageFile}

${installSteps}

echo "5️⃣ 安装 OpenClaw 配置..."
cd ${packageName}
mkdir -p ~/.openclaw
cp -r .openclaw/* ~/.openclaw/

echo "6️⃣ 写入 allowedOrigins (服务器 IP)..."
SERVER_IP="${serverIp || ''}"
if [ -n "$SERVER_IP" ]; then
python3 << PYEOF
import json, os
ip = "${serverIp || ''}"
config_file = os.path.expanduser("~/.openclaw/openclaw.json")
with open(config_file, "r") as f:
    config = json.load(f)
gateway = config.setdefault("gateway", {})
control = gateway.setdefault("controlUi", {})
origins = control.setdefault("allowedOrigins", [])
for origin in [f"http://{ip}:18789", f"http://{ip}", f"https://{ip}:18789", f"https://lumeword.cn", f"http://lumeword.cn"]:
    if origin and origin not in origins:
        origins.append(origin)
with open(config_file, "w") as f:
    json.dump(config, f, indent=2)
print("allowedOrigins updated")
PYEOF
fi

echo "7️⃣ 写入 auth-profiles.json (平台 API Keys)..."
mkdir -p ~/.openclaw/agents/main/agent
echo '${authB64}' | base64 -d > ~/.openclaw/agents/main/auth-profiles.json
cp ~/.openclaw/agents/main/auth-profiles.json ~/.openclaw/agents/main/agent/auth-profiles.json

echo "8️⃣ 启动 OpenClaw Gateway..."
pkill -f "openclaw gateway" 2>/dev/null || true
sleep 2
cd ~/.openclaw
nohup openclaw gateway > /var/log/openclaw.log 2>&1 &
sleep 4

echo "9️⃣ 检查 Gateway..."
if pgrep -f "openclaw gateway" > /dev/null; then
    echo "✅ OpenClaw Gateway 运行中"
    ss -tlnp | grep 18789 || true
else
    echo "❌ Gateway 启动失败"
    tail -30 /var/log/openclaw.log 2>/dev/null || true
    exit 1
fi

echo "✅ 云端部署完成"
`;
}
