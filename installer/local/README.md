# Lume 本机 OpenClaw 资源包

供 **Mac/Windows 桌面客户端** 内置或首次启动释放，与云端 SSH 部署 **完全分离**。

## 用途

- 桌面 App 捆绑 `releases/local/lume-local-openclaw-*.tar.gz`
- 首次向导通过 `GET /api/desktop/openclaw-bootstrap`（待实现）下发平台 Key / 用户 Key
- 本机 Gateway 绑定 `127.0.0.1:18789`，Lume 插件 `18790`

## 生成

```bash
cd installer/local
chmod +x create-local-bundle.sh
./create-local-bundle.sh
```

## 不要用于

- 阿里云 ECS 一键部署 → 使用 `installer/cloud/`
- `curl | bash` 服务器脚本 → 使用 `deploy.js` 远程执行逻辑

## 与云端包对比

| | `releases/cloud/` | `releases/local/` |
|--|-------------------|-------------------|
| 命名 | `lingxi-cloud-<userId>-...` | `lume-local-openclaw-...` |
| API Key | 部署时 SSH 注入 | 向导 / bootstrap API |
| openclaw.json | 完整云模板 | `openclaw.local.template.json` |
| SSH | 是 | 否 |
