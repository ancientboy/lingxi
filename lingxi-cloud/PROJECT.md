# PROJECT.md - 灵犀云 (LumeCloud)

## 项目概述
AI Agent 团队管理平台。用户订阅后可管理自己的 AI Agent 团队，包括创建/配置 Agent、部署技能模板、定时任务管理等。

## 技术栈
- 后端：Node.js + Express（ESM）
- 前端：原生 HTML/CSS/JS（无框架）
- 数据库：JSON 文件（`backend/data/db.json`）
- 通信：WebSocket RPC 对接 OpenClaw
- 部署：PM2 + 阿里云 ECS
- OpenClaw RPC client.id：`openclaw-control-ui`

## UI 样式规范（强制遵守）

### 参考页面（开发前必须先读）
- `frontend/servers.html` — 设备管理（卡片风格）
- `frontend/agent-workspace.html` — 办公区（管理面板风格）
- `frontend/chat.html` — 聊天页（GPT 风格）
- `frontend/subscription.html` — 订阅页

### 颜色
| 用途 | 颜色 | 说明 |
|------|------|------|
| 页面背景 | `#f5f1eb` | 浅米色 |
| 卡片背景 | `#ffffff` | 白色 |
| 主色（按钮/链接/高亮） | `#667eea` | 紫蓝色 |
| 主色 hover | `#5a6fd6` | 紫蓝色深 |
| 文字主色 | `#2d3748` | 深灰 |
| 文字次要 | `#666` / `#888` | 灰色 |
| 危险色 | `#f5576c` | 红色 |
| 在线/成功状态 | `#43e97b` | 绿色 |
| 边框 | `#ddd` / `rgba(0,0,0,0.06)` | 浅灰 |

### 组件
- 按钮 `.btn-primary`：`background: #667eea; color: #fff; border-radius: 8px;`
- 按钮 `.btn-outline`：`background: #fff; color: #667eea; border: 1px solid #667eea;`
- 按钮 `.btn-danger`：`background: #fff; color: #f5576c; border: 1px solid #f5576c;`
- 卡片：`background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);`
- 顶部栏：`rgba(255,255,255,0.94); backdrop-filter: blur(12px);`
- 输入框：`border: 1px solid #ddd; border-radius: 8px;`
- Toggle switch：active 状态 `#667eea`

### 禁止事项
- **禁止用 emoji 做图标** — 用 SVG 或文字
- **禁止深色背景** — 不用 `#1a1a2e` 等深色
- **禁止用 `#43e97b` 做主色调** — 只用于状态指示（在线/成功）

## 代码规范

### 前端
- 单文件 HTML（CSS + JS 内联）
- 变量声明用 `var`（兼容性）
- 函数用 `async function`
- API 调用必须带 `Authorization: Bearer` token
- 错误处理用 toast（`showToast`），禁止 `alert()`
- 动态数据必须用 `escapeHtml()` 转义
- 动态元素用事件委托（`data-action`），禁止 inline onclick 处理动态数据
- 401 自动清 token 跳转登录

### 后端
- ESM 模块（`import/export`）
- 路由用 `express.Router()`
- 鉴权用 `verifyToken` 中间件
- 响应格式：`{ success: true/false, ... }`
- HTTP 状态码：200(成功), 400(参数错), 401(未登录), 502(RPC错), 504(超时)
- RPC 调用参数名用 `id`（不是 `jobId`），update 用 `{ id, patch: {...} }`

### 数据库
- `getDB()` 获取 db 对象
- 用户信息: `db.users`
- 用户服务器: `db.userServers`
- 活跃服务器: `getActiveServer(db, userId)`

## 目录结构
```
lingxi-cloud/
├── backend/
│   ├── index.js          # 入口 + 路由注册
│   ├── config/           # 配置
│   ├── middleware/        # 中间件（auth.js）
│   ├── routes/           # API 路由
│   ├── utils/            # 工具函数
│   │   ├── db.js         # 数据库
│   │   ├── openclaw-rpc.js  # RPC 调用
│   │   └── activeServer.js  # 活跃服务器
│   ├── data/             # JSON 数据库
│   └── templates/        # 模板文件
├── frontend/
│   ├── index.html        # 登录页
│   ├── chat.html         # 聊天页
│   ├── chat.js           # 聊天页 JS
│   ├── agent-workspace.html  # 办公区
│   ├── servers.html      # 设备管理
│   ├── subscription.html # 订阅页
│   ├── cron.html         # 定时任务
│   └── components/       # 共享组件
│       └── sidebar.html  # 侧边栏
```

## 测试
- 服务运行在 `localhost:3000`
- 前端 JS 语法检查: `node -e "new Function(js)"`
- 后端 JS 语法检查: `node --check file.js`
- 修改后端必须重启: `pkill -f "node index.js"; sleep 2; cd backend && nohup node index.js > /var/log/lingxi-cloud.log 2>&1 &`
- 外网访问: `http://120.55.192.144:3000`

## OpenClaw RPC 注意事项
- `client.id` 必须用 `openclaw-control-ui`（白名单限制）
- cron 参数：`id` 不是 `jobId`，update 用 `{ id, patch }` 不是 `{ jobId, ...spread }`
- RPC 超时：读 10s、写 15s、执行 30s
