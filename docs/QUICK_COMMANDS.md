# 灵犀云 - 常用命令速查

## 🔄 日常更新

```bash
# 同步配置到模板（每次调试后必做！）
cp ~/.openclaw/openclaw-minimal.json backend/templates/openclaw-config.json
for agent in main coder ops inventor pm noter media smart; do
  cp ~/.openclaw/agents/$agent/agent/SOUL.md backend/templates/agents/$agent/
done

# 提交代码
cd ~/workspace/lingxi-cloud
git add -A && git commit -m "feat: 更新说明" && git push
```

## 🚀 服务管理

```bash
# 重启 OpenClaw（配置生效）
openclaw gateway restart

# 重启后端
cd ~/workspace/lingxi-cloud && ./start-dev.sh

# 查看日志
tail -f ~/.openclaw/logs/gateway.log
tail -f /var/log/openclaw.log
```

## 📦 批量更新用户

```bash
# 查看所有服务器
curl http://localhost:3000/api/batch-update/status | jq

# 更新单个用户
curl -X POST http://localhost:3000/api/batch-update/update/gufeng \
  -H "Content-Type: application/json" \
  -d '{"components": ["config", "agents"]}'

# 批量更新所有
curl -X POST http://localhost:3000/api/batch-update/update-all \
  -H "Content-Type: application/json" \
  -d '{"components": ["config", "agents"]}'
```

## 🔧 调试

```bash
# 测试 agent 列表
curl http://localhost:18789/c308f1f0/api/agents/list | jq

# 测试 WebSocket
wscat -c ws://localhost:18789/c308f1f0/ws

# 查看用户数据
cat backend/data/db.json | jq '.users'
```

## 📋 快速检查

```bash
# 检查 OpenClaw 版本
openclaw --version

# 检查 agent 配置
cat ~/.openclaw/openclaw-minimal.json | jq '.agents.list[] | {id, name, agentDir}'

# 检查 SOUL.md
ls -la ~/.openclaw/agents/*/agent/SOUL.md
```
