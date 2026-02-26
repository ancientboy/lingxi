# 灵犀云 - 更新与发布 SOP

> 标准操作流程，确保产品迭代高效、稳定

---

## 📁 项目结构

```
lingxi-cloud/
├── frontend/                    # 前端代码
│   ├── index.html              # 首页（登录/注册）
│   ├── chat.html               # 聊天页面
│   ├── team.html               # 团队选择页面
│   └── assets/
│       ├── css/chat.css        # 样式
│       └── js/chat.js          # 核心逻辑 ⭐
│
├── backend/                     # 后端代码
│   ├── index.js                # 入口
│   ├── routes/
│   │   ├── auth.js             # 认证
│   │   ├── deploy.js           # 一键部署 ⭐
│   │   ├── batch-update.js     # 批量更新 ⭐
│   │   ├── gateway.js          # Gateway 连接
│   │   └── ...
│   └── templates/               # 部署模板 ⭐
│       ├── openclaw-config.json # OpenClaw 配置模板
│       ├── agents_config.json  # Agent 配置
│       └── agents/             # Agent 角色定义
│           ├── main/SOUL.md    # 灵犀
│           ├── coder/SOUL.md   # 云溪
│           └── ...
│
├── installer/                   # 安装包资源
│   ├── config/openclaw.json    # 离线配置
│   ├── agents/                 # Agent 配置
│   └── skills/                 # Skills 集合
│
├── releases/                    # 用户部署包
│   ├── packages/               # OpenClaw 离线包
│   └── users/                  # 用户专属包
│
└── docs/                        # 文档
```

---

## 🔧 核心配置文件

### 1. OpenClaw 配置模板
**文件**: `backend/templates/openclaw-config.json`

包含：
- 模型配置（智谱 GLM-5）
- Agent 列表及 agentDir
- Gateway 配置
- 占位符：`{{TOKEN}}`, `{{SESSION_ID}}`

### 2. Agent 角色定义
**文件**: `backend/templates/agents/*/SOUL.md`

每个 agent 有独立的性格和专长：
- `main` - 灵犀（队长，智能调度）
- `coder` - 云溪（代码专家）
- `ops` - 若曦（数据分析）
- `inventor` - 紫萱（创意设计）
- `pm` - 梓萱（产品设计）
- `noter` - 晓琳（知识管理）
- `media` - 音韵（多媒体）
- `smart` - 智家（效率工具）

### 3. 前端核心逻辑
**文件**: `frontend/assets/js/chat.js`

- Agent 切换逻辑
- WebSocket 通信
- 会话管理

---

## 🔄 开发调试流程

### Step 1: 修改配置

```bash
# 1. 修改 OpenClaw 配置（本地调试）
vim ~/.openclaw/openclaw-minimal.json

# 2. 修改前端代码
vim frontend/assets/js/chat.js

# 3. 修改后端代码
vim backend/routes/xxx.js
```

### Step 2: 本地测试

```bash
# 重启 OpenClaw（配置生效）
openclaw gateway restart

# 重启后端（代码生效）
cd ~/workspace/lingxi-cloud
./start-dev.sh
```

### Step 3: 验证功能

访问 http://localhost:3000 测试

### Step 4: 同步到模板

```bash
# 重要！把调试好的配置同步到部署模板
cp ~/.openclaw/openclaw-minimal.json backend/templates/openclaw-config.json
cp -r ~/.openclaw/agents/*/SOUL.md backend/templates/agents/*/
```

---

## 🚀 发布更新流程

### Step 1: 更新版本号

```bash
# 创建版本文件
cat > installer/VERSION.json << EOF
{
  "configVersion": "2.1.2",
  "openclawVersion": "2026.2.17",
  "updatedAt": "$(date -Iseconds)"
}
EOF
```

### Step 2: 提交代码

```bash
git add -A
git commit -m "feat: 更新说明"
git push origin main
```

### Step 3: 更新部署包（可选）

```bash
# 如果有 OpenClaw 离线包更新
cd installer
./create-user-package.sh
```

---

## 📦 批量更新用户服务器

### API 接口

#### 1. 查看所有服务器状态
```bash
GET /api/batch-update/status
```

#### 2. 更新单个用户
```bash
POST /api/batch-update/update/:userId
Body: {
  "components": ["config", "agents", "skills"]
}
```

#### 3. 批量更新所有用户
```bash
POST /api/batch-update/update-all
Body: {
  "components": ["config", "agents"]
}
```

### 更新组件说明

| 组件 | 说明 | 更新内容 |
|------|------|----------|
| `config` | OpenClaw 配置 | openclaw.json |
| `agents` | Agent 配置 | SOUL.md, TEAM.md 等 |
| `skills` | Skills 技能 | installer/skills/ |

### 使用示例

```bash
# 更新古风的服务器
curl -X POST http://localhost:3000/api/batch-update/update/gufeng \
  -H "Content-Type: application/json" \
  -d '{"components": ["config", "agents"]}'

# 批量更新所有用户
curl -X POST http://localhost:3000/api/batch-update/update-all \
  -H "Content-Type: application/json" \
  -d '{"components": ["config", "agents"]}'
```

---

## 🎯 更新场景对照表

| 场景 | 需要更新 | 更新方式 |
|------|----------|----------|
| 新增 Agent | 模板 + SOUL.md | 批量更新 agents |
| 修改 Agent 性格 | SOUL.md | 批量更新 agents |
| 调整模型配置 | openclaw.json | 批量更新 config |
| 前端 UI 修改 | chat.js/chat.html | 用户重新部署 |
| 后端 API 修改 | routes/*.js | 重启后端服务 |
| 新增 Skills | installer/skills/ | 批量更新 skills |

---

## ⚠️ 注意事项

### 1. 配置同步

每次调试完成后，**必须**把配置同步到模板：

```bash
# 同步 OpenClaw 配置
cp ~/.openclaw/openclaw-minimal.json backend/templates/openclaw-config.json

# 同步 Agent 配置
for agent in main coder ops inventor pm noter media smart; do
  cp ~/.openclaw/agents/$agent/agent/SOUL.md backend/templates/agents/$agent/
done
```

### 2. 敏感信息

- ❌ 不要把 API Key 提交到 Git
- ✅ 使用占位符 `{{ZHIPU_API_KEY}}`
- ✅ 在部署时动态替换

### 3. 版本管理

- 每次重大更新都要更新版本号
- 保留历史版本的部署包
- 记录更新日志

---

## 📋 检查清单

### 发布前检查

- [ ] 本地测试通过
- [ ] 配置已同步到模板
- [ ] 版本号已更新
- [ ] 代码已提交到 Git
- [ ] 敏感信息已清理

### 批量更新后检查

- [ ] 所有服务器状态正常
- [ ] 用户功能正常
- [ ] 日志无错误

---

## 🆘 故障排查

### 问题：用户服务器更新失败

```bash
# 1. 检查 SSH 连接
ssh root@<IP>

# 2. 查看服务状态
systemctl status openclaw

# 3. 查看日志
tail -100 /var/log/openclaw.log

# 4. 手动恢复
cp -r ~/.openclaw.bak.* ~/.openclaw
systemctl restart openclaw
```

### 问题：Agent 切换不生效

```bash
# 检查 agentDir 配置
cat ~/.openclaw/openclaw.json | grep agentDir

# 检查 SOUL.md 是否存在
ls ~/.openclaw/agents/*/SOUL.md

# 重启 OpenClaw
openclaw gateway restart
```

---

_最后更新: 2026-02-21_
