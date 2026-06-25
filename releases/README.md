# 部署包目录

| 子目录 | 用途 |
|--------|------|
| `cloud/` | 付费用户云端 ECS / SSH 部署包（`lingxi-cloud-*.tar.gz`） |
| `local/` | 桌面客户端本机 OpenClaw 资源包（`lume-local-openclaw-*.tar.gz`） |

旧路径 `releases/users/` 已废弃，请勿与云端/本机包混用。

生成方式：

```bash
# 云端
installer/cloud/create-cloud-package.sh <userId> <token> <sessionId>

# 本机
installer/local/create-local-bundle.sh
```
