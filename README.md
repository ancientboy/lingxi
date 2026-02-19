# ⚡ 灵犀云

> 一键拥有你的 AI 团队

## 简介

灵犀云让你一键部署一个完整的 AI 团队：
- **8 个专业 Agent**：灵犀（队长）、云溪（代码）、若曦（运营）、紫萱（创意）、梓萱（产品）、晓琳（知识）、音韵（媒体）、智家（智能家居）
- **20+ 预装 Skills**：代码审查、任务规划、联网搜索、记忆系统等
- **智能调度**：灵犀自动识别需求，分配给最合适的 Agent

## 开发环境设置

### 前置要求

- Node.js 18+
- npm 或 pnpm
- 阿里云账号（用于自动创建 ECS）

### 快速开始

```bash
# 1. 克隆代码
git clone https://github.com/ancientboy/lingxi.git
cd lingxi

# 2. 安装依赖
cd backend && npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入阿里云 AccessKey 等配置

# 4. 启动开发服务
npm run dev
```

### 环境变量说明

| 变量 | 说明 | 必填 |
|------|------|------|
| `ALIYUN_ACCESS_KEY_ID` | 阿里云 AccessKey ID | ✅ |
| `ALIYUN_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret | ✅ |
| `SERVER_IP` | 服务器公网 IP | ✅ |
| `JWT_SECRET` | JWT 密钥 | ✅ |
| `MVP_MODE` | MVP 模式（true/false） | ❌ 默认 false |

### 核心功能

- **POST /api/deploy/one-click** - 一键创建 ECS + 部署 OpenClaw
- **POST /api/remote-config/feishu** - 远程配置飞书
- **POST /api/remote-config/wecom** - 远程配置企业微信

## 快速开始

### 方式 1：一键安装（推荐）

```bash
# 下载安装包
git clone https://github.com/openclaw/lingxi-cloud.git
cd lingxi-cloud

# 运行安装脚本
./installer/scripts/install.sh
```

### 方式 2：手动安装

```bash
# 1. 确保已安装 Docker 和 Node.js 18+

# 2. 创建目录
mkdir -p ~/.lingxi-cloud/{config,agents,skills,data}

# 3. 复制配置
cp -r installer/config/* ~/.lingxi-cloud/config/
cp -r installer/agents/* ~/.lingxi-cloud/agents/
cp -r installer/skills/* ~/.lingxi-cloud/skills/

# 4. 启动容器
docker run -d \
  --name lingxi-cloud \
  -p 18789:18789 \
  -v ~/.lingxi-cloud/config:/config \
  -v ~/.lingxi-cloud/agents:/agents \
  -v ~/.lingxi-cloud/skills:/skills \
  -v ~/.lingxi-cloud/data:/data \
  --restart unless-stopped \
  openclaw/openclaw:latest
```

### 访问灵犀

打开浏览器访问：http://localhost:18789

## 包含内容

### Agents (8个)

| Agent | 角色 | 专长 |
|-------|------|------|
| ⚡ 灵犀 | 队长 | 智能调度、任务分配 |
| 💻 云溪 | 代码女王 | 开发、架构、代码审查 |
| 📊 若曦 | 运营专家 | 数据分析、增长策略 |
| 💡 紫萱 | 创意天才 | 创意生成、产品设计 |
| 🎯 梓萱 | 产品女王 | 需求分析、MVP设计 |
| 📝 晓琳 | 知识管理 | 笔记整理、信息归档 |
| 🎧 音韵 | 多媒体专家 | 音视频处理 |
| 🏠 智家 | 智能家居 | 设备控制、自动化 |

### Skills (20+个)

**核心技能：**
- `memory-system` - 记忆系统
- `task-planner` - 任务规划
- `searxng` - 联网搜索

**开发技能：**
- `code-reviewer` - 代码审查
- `fix` - 自动修复
- `frontend-design` - 界面设计
- `fullstack-developer` - 全栈开发

**效率技能：**
- `tasks` - 任务管理
- `healthcheck` - 健康检查
- `weather` - 天气查询

## 项目结构

```
lingxi-cloud/
├── README.md
├── installer/              # 安装包
│   ├── agents/            # 8个 Agent SOUL
│   ├── skills/            # 20+ Skills
│   ├── config/            # 配置模板
│   └── scripts/           # 安装脚本
├── backend/               # 后端服务（可选）
│   ├── routes/
│   └── index.js
├── frontend/              # 前端页面（可选）
└── docs/                  # 文档
    ├── PRD.md
    ├── ARCHITECTURE.md
    └── MVP_PLAN.md
```

## 配置团队

### 添加 Agent

```bash
# 使用配置脚本
./installer/scripts/configure-team.sh "coder,ops,inventor"
```

### 或通过 API

```bash
curl -X POST http://localhost:3000/api/agents/configure \
  -H "Content-Type: application/json" \
  -d '{"instanceId":"lingxi-cloud","agents":["coder","ops"]}'
```

## 常用命令

```bash
# 查看状态
docker ps | grep lingxi

# 查看日志
docker logs lingxi-cloud -f

# 重启服务
docker restart lingxi-cloud

# 停止服务
docker stop lingxi-cloud
```

## 系统要求

- Docker 20+
- Node.js 18+（可选，用于后端服务）
- 内存 2GB+
- 磁盘 5GB+

## 获取更多 Skills

### 从 ClawHub 获取

```bash
# ClawHub 技能市场
https://hub.openclaw.io
```

### 或使用预装 Skills

所有预装 Skills 位于 `installer/skills/` 目录，已覆盖主要场景。

## 开发

```bash
# 启动后端开发服务
cd backend
npm install
npm run dev

# 打包发布
cd ..
./scripts/build-package.sh 1.0.0
```

## License

MIT

## 联系

- 官网：https://lingxi.cloud
- GitHub：https://github.com/openclaw/lingxi-cloud
- 问题反馈：https://github.com/openclaw/lingxi-cloud/issues
