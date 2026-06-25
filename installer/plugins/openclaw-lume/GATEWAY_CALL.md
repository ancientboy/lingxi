# gateway.call 白名单

Lume 插件通过 `gateway.call` 代理本机 OpenClaw Gateway RPC（降级/管理能力）。

## 原生 RPC（优先使用，不经 gateway.call）

- auth, ping, chat.send, chat.abort, chat.history
- sessions.list, sessions.patch, sessions.update, sessions.delete
- device.switch / device.list（由 lingxi-cloud WSS proxy 处理，非插件）

## gateway.call 适用场景

- 插件未原生实现的 Gateway 方法
- management-handlers 中的 MANAGEMENT_METHODS 集合

## Flutter 调用

```dart
await rpcGatewayCall('agents.list', {});
```

Lume 连通时走 `gateway.call`；仅 Gateway 降级时直连 Gateway WS。
