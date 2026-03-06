# 🎯 Paul 服务器文件预览部署指南

## 当前状态

✅ **前端已完成** - 自动识别文件路径并预览
✅ **主服务器已部署** - 120.55.192.144:9876
⏳ **Paul 服务器待部署** - 120.26.33.181:9876

---

## 部署步骤

### 方法 1: 使用部署脚本（推荐）

**需要：Paul 服务器的密码**

```bash
# 在主服务器 (120.55.192.144) 执行
cd /home/admin/.openclaw/workspace/lingxi-cloud/deploy

# 替换 <Paul密码> 为实际密码
./deploy-file-server-user.sh 120.26.33.181 root <Paul密码>
```

### 方法 2: 手动部署

**步骤 1: 登录 Paul 的服务器**
```bash
ssh root@120.26.33.181
```

**步骤 2: 创建文件服务脚本**
```bash
cat > /root/file-server.js << 'EOF'
/**
 * OpenClaw 文件服务 - 自动检测 workspace
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 9876;

// 自动检测 workspace 目录
const WORKSPACE_DIR = fs.existsSync('/root/.openclaw/workspace')
  ? '/root/.openclaw/workspace'
  : path.join(__dirname, 'workspace');

console.log(`🚀 文件服务启动: ${PORT}`);
console.log(`📂 Workspace: ${WORKSPACE_DIR}`);

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT, workspace: WORKSPACE_DIR });
});

// 静态文件
app.use('/files', express.static(WORKSPACE_DIR, {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.pdf': 'application/pdf'
    };
    if (types[ext]) res.setHeader('Content-Type', types[ext]);
  }
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 文件服务运行中: http://0.0.0.0:${PORT}`);
});
EOF
```

**步骤 3: 安装依赖**
```bash
cd /root
npm install express
```

**步骤 4: 启动服务**
```bash
pm2 start /root/file-server.js --name file-server
pm2 save
```

**步骤 5: 验证**
```bash
# 检查服务状态
pm2 list | grep file-server

# 测试健康检查
curl http://localhost:9876/health

# 应该返回
# {"status":"ok","port":9876,"workspace":"/root/.openclaw/workspace"}
```

---

## 验证部署

### 1. 检查文件服务
```bash
curl http://120.26.33.181:9876/health
```

### 2. 测试文件访问
```bash
# 在 Paul 服务器创建测试文件
ssh root@120.26.33.181
echo "test" > /root/.openclaw/workspace/test.txt

# 测试访问
curl http://120.26.33.181:9876/files/test.txt
```

### 3. 测试前端预览
1. 用 Paul 的账号登录灵犀云
2. 发送消息: "生成一个测试图片"
3. 如果 Agent 返回文件路径，应该自动显示预览

---

## 常见问题

### Q: 文件服务启动失败？
```bash
# 检查日志
pm2 logs file-server

# 检查端口占用
netstat -tlnp | grep 9876
```

### Q: 无法访问文件？
```bash
# 检查防火墙
sudo ufw status
sudo ufw allow 9876

# 检查 workspace 目录
ls -la /root/.openclaw/workspace
```

### Q: 前端显示"无法预览"？
检查浏览器控制台，可能是：
- 服务器 IP 未正确获取
- 文件服务未启动
- CORS 配置问题

---

## Paul 服务器信息

- **IP**: 120.26.33.181
- **文件服务端口**: 9876
- **OpenClaw 端口**: 18789
- **Token**: ca99665538f9b146cd035831d8dbea2e

---

## 需要帮助？

如果部署过程中遇到问题，告诉我具体的错误信息，我会帮你解决！
