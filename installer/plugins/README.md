# OpenClaw 插件

## openclaw-lume

Lume 通道插件：在 Gateway **18789** 之外监听 **18790**，供灵犀云前端经 `lume-ws` 代理连接设备。

- 来源：144 现网 `/root/.openclaw/workspace/plugins/openclaw-lume`
- 打包：`installer/scripts/copy-lume-plugin.sh`（云端 / 本机 bundle 共用）
- 部署：远程脚本在目标机执行 `npm install --production` 安装 `ws` 依赖
