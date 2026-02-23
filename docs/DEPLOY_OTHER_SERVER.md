# 部署到其他服务器指南

## 快速修复

如果你从其他服务器拷贝了配置文件后遇到问题，运行：

```bash
# 下载并运行修复脚本
curl -fsSL https://lingxi.cloud/fix-config.sh | bash
```

或手动运行：

```bash
cd /path/to/lingxi-cloud
bash installer/scripts/fix-config.sh
```

---

## 常见问题

### 问题 1：路径错误

**症状：**
- OpenClaw Gateway 无法启动
- 报错: "directory not found"
- 报错: "permission denied"

**原因：** 配置文件包含源服务器的硬编码路径

**解决：**
```bash
# 方法 1: 运行修复脚本
bash scripts/fix-config.sh

# 方法 2: 手动替换
# 将 /home/admin 替换为当前用户目录
sed -i "s|/home/admin|$HOME|g" ~/.openclaw/openclaw.json
```

---

### 问题 2：disconnected (1008): control ui requires HTTPS

**症状：**
- WebSocket 连接失败
- 报错: "control ui requires HTTPS or localhost"

**原因：** OpenClaw Control UI 要求安全上下文

**解决方案：**

**方案 A: SSH 端口转发（推荐）**
```bash
# 在本地电脑运行
ssh -L 18789:localhost:18789 用户名@服务器IP -N

# 然后访问
http://localhost:18789/会话ID/?token=你的token
```

**方案 B: 启用 TLS**
```bash
# 修改配置
nano ~/.openclaw/openclaw.json

# 添加 TLS 配置
"gateway": {
  "tls": {
    "enabled": true,
    "cert": "/path/to/cert.pem",
    "key": "/path/to/key.pem"
  }
}
```

---

### 问题 3：无效插件配置

**症状：**
- 报错: "plugin not found: alibaba-cloud-auth"

**解决：**
```bash
# 移除无效插件
python3 -c "
import json
with open('$HOME/.openclaw/openclaw.json', 'r') as f:
    config = json.load(f)
if 'plugins' in config:
    del config['plugins']
with open('$HOME/.openclaw/openclaw.json', 'w') as f:
    json.dump(config, f, indent=2)
print('✓ 已修复')
"
```

---

### 问题 4：CORS 配置错误

**症状：**
- 前端无法连接 WebSocket
- 报错: "origin not allowed"

**解决：**
```bash
# 更新 allowedOrigins 为当前服务器 IP
SERVER_IP=$(curl -s ifconfig.me)
sed -i "s|http://[0-9.]*:3000|http://$SERVER_IP:3000|g" ~/.openclaw/openclaw.json
```

---

## 一键部署时的自动处理

灵犀云的一键部署脚本会自动：

1. **检测当前用户** - 使用 `$HOME` 而不是硬编码路径
2. **获取服务器 IP** - 自动配置 CORS
3. **生成唯一会话** - 避免冲突
4. **验证配置** - 确保格式正确

```bash
# 一键部署
curl -fsSL https://lingxi.cloud/install.sh | bash
```

---

## 诊断命令

```bash
# 检查配置
openclaw config validate

# 检查 Gateway 状态
openclaw gateway status

# 查看日志
tail -f ~/.openclaw/logs/gateway.log

# 检查端口
netstat -tlnp | grep 18789

# 测试连接
curl http://localhost:18789/health
```
