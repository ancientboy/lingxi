# 灵犀云 开发任务清单

> 版本：v1.0
> 更新时间：2026-02-17

---

## 状态说明

- ⬜ 未开始
- 🔄 进行中
- ✅ 已完成
- ❌ 暂缓

---

## Day 1：基础搭建

### 环境准备

- ✅ 安装 Node.js 18+
- ⬜ 安装 PostgreSQL（改用 SQLite/JSON）
- ✅ 安装 Docker
- ⬜ 准备阿里云短信 AccessKey（改用邀请码）

### 项目初始化

- ✅ 创建项目目录
- ✅ 安装依赖 (express, jsonwebtoken)
- ✅ 后端服务运行 (http://localhost:3000)

### 数据库

- ✅ 使用 JSON 文件存储
- ✅ 创建用户数据结构
- ✅ 创建邀请码数据结构
- ✅ 创建 Agent 配置数据结构

### 后端 API

- ✅ 健康检查接口 `GET /health`
- ✅ 邀请码注册/登录 `POST /api/auth/register`
- ✅ Token 验证 `GET /api/auth/verify`
- ✅ 生成邀请码 `POST /api/admin/invite-codes/generate`
- ✅ 实例分配 `POST /api/instance/assign`

### 前端页面

- ✅ 完整的星空科技风落地页
- ✅ 邀请码注册弹窗
- ✅ Agent 选择卡片
- ✅ 部署进度动画
- ✅ 成功页面

---

## Day 2：团队配置 + 新用户引导

### 灵犀新用户引导

- ⬜ 更新 SOUL.md - 添加新用户判断逻辑
- ⬜ 更新记忆系统 - onboarding 标记
- ⬜ 编写引导话术
- ⬜ 编写推荐规则

### Agent 动态配置

- ✅ 实现 Agent 配置接口
- ✅ 实现 OpenClaw 配置更新
- ✅ 实现实例重启 + 状态监控
- ✅ MVP 模式：复用现有 OpenClaw 实例

---

## Day 3：打磨上线

### 测试

- ✅ 注册流程测试
- ✅ Token 验证测试
- ⬜ 完整流程测试

### 部署

- ⬜ 配置 Nginx
- ⬜ 配置 HTTPS
- ⬜ 启动后端服务（PM2）
- ⬜ 开放注册

---

## 可用邀请码

```
LINGXI-681145E7  (已使用)
LINGXI-EDB46B8C
LINGXI-62EF5057
LINGXI-7291FA25
LINGXI-44CB3E03
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/auth/register` | POST | 邀请码注册/登录 |
| `/api/auth/verify` | GET | 验证Token |
| `/api/instance/assign` | POST | 分配实例 |
| `/api/admin/invite-codes/generate` | POST | 生成邀请码 |
| `/api/admin/invite-codes` | GET | 查看邀请码 |

## 快速测试

```bash
# 生成邀请码
curl -X POST http://localhost:3000/api/admin/invite-codes/generate \
  -H "Content-Type: application/json" \
  -H "x-admin-key: lingxi-admin-2026" \
  -d '{"count": 5}'

# 注册
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"inviteCode": "LINGXI-EDB46B8C", "nickname": "测试用户"}'

# 分配实例
curl -X POST http://localhost:3000/api/instance/assign \
  -H "Content-Type: application/json" \
  -d '{"userId": "用户ID", "agents": ["lingxi", "coder", "ops"]}'
```

---

*更新者：灵犀团队*
