# 部署到其他服务器指南

## 问题：配置文件中的硬编码路径

当你从其他服务器拷贝配置文件后，可能会遇到路径问题，因为配置文件中包含硬编码的路径。

### 常见问题

**1. OpenClaw 配置文件路径错误**
```
配置文件: ~/.openclaw/openclaw.json
错误路径: /home/admin/.openclaw/workspace
正确路径: /home/你的用户名/.openclaw/workspace
```

**2. 症状**
- OpenClaw Gateway 无法启动
- Agent 无法加载
- 报错: "directory not found" 或 "permission denied"

### 解决方案

#### 方法 1：使用 OpenClaw 向导重新初始化（推荐）

```bash
# 1. 备份当前配置
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.backup

# 2. 运行 OpenClaw 向导
openclaw onboard

# 3. 根据提示重新配置
# - 选择模型提供商
# - 配置工作目录
# - 设置 Agent

# 4. 重启 Gateway
openclaw gateway restart
```

#### 方法 2：手动修改配置文件

```bash
# 1. 获取当前用户名
echo $USER
# 输出: 你的用户名

# 2. 替换配置文件中的硬编码路径
sed -i "s|/home/admin|~|g" ~/.openclaw/openclaw.json

# 或者使用当前用户名
sed -i "s|/home/admin|/home/$USER|g" ~/.openclaw/openclaw.json

# 3. 验证修改
cat ~/.openclaw/openclaw.json | grep workspace

# 4. 重启 Gateway
openclaw gateway restart
```

#### 方法 3：重新创建基础配置

```bash
# 1. 完全重置 OpenClaw
rm -rf ~/.openclaw

# 2. 重新运行安装向导
openclaw onboard

# 3. 从灵犀云项目复制 Agent 配置
cd /path/to/lingxi-cloud
cp -r installer/agents/* ~/.openclaw/agents/
cp -r installer/config/* ~/.openclaw/
```

### 灵犀云后端配置

**文件: `lingxi-cloud/backend/.env`**

检查以下配置是否需要修改：

```bash
# 端口（确保未被占用）
PORT=3000

# 实例存储目录（确保有写入权限）
INSTANCES_DIR=/data/lingxi-instances  # 或使用: ~/.lingxi-instances

# OpenClaw 镜像
OPENCLAW_IMAGE=openclaw/openclaw:latest

# 阿里云配置（如果使用一键部署）
ALIYUN_ACCESS_KEY_ID=your_key
ALIYUN_ACCESS_KEY_SECRET=your_secret
```

### 快速诊断

```bash
# 检查 OpenClaw 配置
openclaw config validate

# 检查 Gateway 状态
openclaw gateway status

# 查看 Gateway 日志
tail -f ~/.openclaw/logs/gateway.log

# 测试 Gateway 连接
curl http://localhost:18789/health
```

### 联系支持

如果以上方法都无法解决问题，请提供：

1. 错误日志: `tail -100 ~/.openclaw/logs/gateway.log`
2. 配置文件: `cat ~/.openclaw/openclaw.json`
3. 系统信息: `uname -a && node --version`
