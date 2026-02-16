# 灵犀云安装包

一键安装你的 AI 团队

## 包含内容

### Agents (8个)
- ⚡ 灵犀 - 队长，智能调度
- 💻 云溪 - 代码女王
- 📊 若曦 - 运营专家
- 💡 紫萱 - 创意天才
- 🎯 梓萱 - 产品女王
- 📝 晓琳 - 知识管理
- 🎧 音韵 - 多媒体专家
- 🏠 智家 - 智能家居

### Skills (3个核心)
- memory-system - 记忆系统
- task-planner - 任务规划
- searxng - 联网搜索

## 安装方式

### 方式1：一键安装
```bash
curl -fsSL https://lingxi.cloud/install.sh | bash
```

### 方式2：手动安装
```bash
# 1. 复制安装包到目标服务器
scp -r installer/ user@server:~/.lingxi-cloud

# 2. 运行安装脚本
cd ~/.lingxi-cloud/scripts
./install.sh
```

## 安装后配置

### 添加团队成员
```bash
./configure-team.sh "coder,ops,inventor"
```

### 访问灵犀
打开浏览器访问: http://localhost:18789

## 目录结构

```
~/.lingxi-cloud/
├── config/
│   └── openclaw.json    # OpenClaw 配置
├── agents/
│   ├── lingxi/SOUL.md
│   ├── coder/SOUL.md
│   └── ...
├── skills/
│   ├── memory-system/
│   ├── task-planner/
│   └── searxng/
├── data/
│   └── memory/          # 用户记忆数据
└── logs/
```

## 常用命令

```bash
# 查看状态
docker ps | grep lingxi

# 查看日志
docker logs lingxi-cloud

# 重启服务
docker restart lingxi-cloud

# 停止服务
docker stop lingxi-cloud
```

## 系统要求

- Docker 20+
- Node.js 18+
- 2GB+ 内存
- 10GB+ 磁盘
