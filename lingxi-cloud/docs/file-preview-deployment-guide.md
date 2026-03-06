# ✅ 文件预览功能部署完成！

## 🎉 部署状态

### 已部署的服务器

| 服务器 | IP | 文件服务 | 状态 |
|--------|-----|---------|------|
| 主服务器 | 120.55.192.144 | ✅ 9876 | 运行中 |
| Paul 服务器 | 120.26.33.181 | ✅ 9876 | 运行中 |

---

## 📝 功能说明

### 文件预览功能已集成到灵犀云

1. **自动识别** - Agent 生成文件后,前端自动识别文件路径
2. **自动预览** - 图片直接显示,PDF 支持预览
3. **文件下载** - 提供下载按钮

---

## 🔧 部署方案

### 方案 1: 新部署的实例 (自动部署) ✅

**修改的文件:**
- `backend/routes/deploy.js` - 添加了文件服务部署

**功能:**
- 新实例部署时,自动安装并启动文件服务
- 端口: 9876
- 自动启动: PM2 管理

**使用:**
```bash
# 不需要额外操作,新部署的实例会自动包含文件服务
```

---

### 方案 2: 已部署的实例 (手动部署) ✅

**脚本位置:**
```
/home/admin/.openclaw/workspace/lingxi-cloud/deploy/deploy-file-server-existing.sh
```

**使用方法:**
```bash
cd /home/admin/.openclaw/workspace/lingxi-cloud/deploy

# 部署到指定服务器
./deploy-file-server-existing.sh <服务器IP> [密码]

# 示例
./deploy-file-server-existing.sh 120.26.33.181
./deploy-file-server-existing.sh 120.26.33.181 "MyPassword"
```

**脚本功能:**
1. ✅ 创建文件服务脚本 (`/opt/openclaw-file-server/index.js`)
2. ✅ 安装 Express (如果未安装)
3. ✅ 安装 PM2 (如果未安装)
4. ✅ 启动文件服务 (端口 9876)
5. ✅ 保存 PM2 配置 (自动启动)

---

## 🧪 测试方法

### 1. 测试文件服务

```bash
# 测试健康检查
curl http://120.26.33.181:9876/health

# 预期返回:
{
  "status": "ok",
  "port": 9876,
  "workspace": "/root/.openclaw/workspace",
  "exists": true,
  "timestamp": "2026-03-06T06:03:30.508Z"
}
```

### 2. 测试文件访问

```bash
# 预览文件
curl 'http://120.26.33.181:9876/preview?path=test-document.pdf&token=lingxi-file-server-2026'

# 下载文件
curl 'http://120.26.33.181:9876/download?path=test-document.pdf&token=lingxi-file-server-2026'
```

### 3. 测试前端

1. 强制刷新浏览器 (Ctrl+Shift+R)
2. 让 Agent 生成文件
3. 查看文件预览

---

## 📋 文件服务 API

### 健康检查
```
GET /health
返回: { status: "ok", ... }
```

### 文件列表
```
GET /list?path=/
返回: { files: [...] }
```

### 文件预览
```
GET /preview?path=file.pdf&token=xxx
返回: 文件流 (inline)
```

### 文件下载
```
GET /download?path=file.pdf&token=xxx
返回: 文件流 (attachment)
```

### 静态文件
```
GET /files/file.pdf?token=xxx
返回: 文件流
```

---

## 🎯 前端工作流程

```
1. Agent 生成文件并返回消息
   "文件已生成：/root/.openclaw/workspace/test.pdf"

2. 前端识别文件路径
   extractFiles(text) → [{ path: "...", name: "test.pdf" }]

3. 获取用户服务器信息
   GET /api/user/server → { serverIp: "120.26.33.181", fileServerToken: "xxx" }

4. 生成预览 URL
   getFileUrl(path, options) → "http://120.26.33.181:9876/preview?path=test.pdf&token=xxx"

5. 浏览器加载文件
   <img src="..." /> 或 <embed src="..." />
```

---

## 🚀 下一步

### 对于已部署的实例

使用部署脚本:
```bash
cd /home/admin/.openclaw/workspace/lingxi-cloud/deploy
./deploy-file-server-existing.sh <服务器IP>
```

### 对于新实例

不需要额外操作,自动包含文件服务 ✅

---

## 📊 总结

### ✅ 已完成

1. **文件服务部署**
   - 主服务器 ✅
   - Paul 服务器 ✅
   - 自动部署脚本 ✅

2. **前端功能**
   - 自动识别文件路径 ✅
   - 清理 Markdown 符号 ✅
   - 生成预览 URL ✅
   - 文件预览和下载 ✅

3. **后端 API**
   - `/api/user/server` - 返回服务器信息 ✅
   - JWT 认证 ✅

### 🎯 特点

- **简单部署** - 一键脚本
- **自动启动** - PM2 管理
- **安全可靠** - Token 认证
- **跨域支持** - CORS 配置
- **自动集成** - 新实例自动包含

---

**部署完成！文件预览功能已上线！** 🚀
