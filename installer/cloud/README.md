# Lume 云端 OpenClaw 部署

面向 **付费订阅用户** 的阿里云 ECS / SSH 远程部署，与桌面对本机包分离。

## 目录

| 路径 | 说明 |
|------|------|
| `create-cloud-package.sh` | 生成 `releases/cloud/lingxi-cloud-*.tar.gz` |
| `README.md` | 本文件 |

## 生成包

```bash
export ZHIPU_API_KEY=...
export DASHSCOPE_API_KEY=...
export OPENCLAW_VERSION=2026.6.9

./create-cloud-package.sh <userId> <gatewayToken> <sessionId>
```

## 运行时

- 后端：`POST /api/deploy/one-click`（需付费订阅）
- 远程脚本：`backend/utils/cloud-deploy-remote.js` 生成并 SSH 执行
- 配置模板：`installer/config/openclaw.json`

## 与本机包区别

| | 云端 `installer/cloud/` | 本机 `installer/local/` |
|--|-------------------------|-------------------------|
| 用途 | ECS / 用户 VPS SSH | Mac 桌面内置 / 向导 bootstrap |
| Key | 平台 Key 远程注入 | 登录后 API 下发或用户自填 |
| 部署 | `deploy.js` + SSH | 桌面 App 进程管理 |
