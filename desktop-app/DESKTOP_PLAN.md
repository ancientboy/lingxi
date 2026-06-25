# Lume 原生 Mac 桌面端计划

## 布局（Cursor / Web 三栏 — 全原生侧栏）

| 列 | 实现 | 宽度 |
|----|------|------|
| 左 | **原生**会话侧栏 | 260px |
| 中 | WebView 消息 + **原生**输入框 | ~720px 居中 |
| 右 | **原生**工作台（工具 / 智能体 / 快捷技能） | 300px（可收起） |

Web 左右重复栏已隐藏；工具视图（办公区 / 技能库等）仍在中间 WebView 内嵌展示。

---

## 阶段

| 阶段 | 状态 |
|------|------|
| P0–P1 登录 / CI / 自动部署 | ✅ |
| P2 通知 / 深链 / 离线缓存 | ✅ |
| P3 原生输入 / 设置 / 模型 | ✅ |
| P3+ 原生右侧工作台 | ✅ v1.4.0 |
| **P4 本地 OpenClaw** | 🚧 v1.5.0 最小闭环 |

---

## P4 本地 OpenClaw（对照 OneClaw）

### 架构

```
自动模式：探测 127.0.0.1:18790 → 有则本机直连，否则云端 WSS
本机模式：ws://127.0.0.1:18790 + Lume auth (userId + secret)
云端模式：wss://lumeword.cn/api/lume-ws → 活跃设备 18790
```

### P4.1 最小闭环（v1.5.0）✅

- [x] `LocalOpenClawService` — TCP 探测 18790（Lume）、18789（Gateway）
- [x] `ConnectionMode` — auto / local / cloud + SharedPreferences
- [x] 设置页 — 连接模式、本机状态、OpenClaw 安装引导
- [x] Web 注入 `localStorage` + `lume-rpc.js` 本机直连分支

### P4.2 安装向导（后续）

- [ ] 检测 `openclaw` CLI / Gateway 进程
- [ ] 一键运行 `openclaw.ai/install.sh` 或内置脚本
- [ ] Lume 插件安装与配置说明
- [ ] 首次本机连接成功引导

### P4.3 Gateway 生命周期（后续，学 OneClaw）

- [ ] 内置或捆绑 Node + OpenClaw Gateway 子进程
- [ ] LaunchAgent / 开机自启
- [ ] Gateway 健康检查与自动重启

### P4.4 macOS 权限（后续）

- [ ] 屏幕录制 / 辅助功能 / 文件访问说明页
- [ ] 权限状态检测与跳转系统设置

### P4.5 本机设备登记（后续）

- [ ] 本机 OpenClaw 登记为云端「设备」
- [ ] 多设备列表中与云端设备并列展示

---

## P3+ 原生工作台（v1.4.0）

- [x] 原生 `WorkspacePanel`：工具入口、智能体列表、快捷技能
- [x] JS 桥接：`lumeDesktopSwitchAgent` / `SendQuick` / `GetTeamState`
- [x] 隐藏 Web `#rightSidebar`，margin 归零
- [x] 办公区 / 技能 / 设备等仍用 Web `switchView` 嵌入中间区域

---

## 深链

```
lume://chat
lume://session?key=...
lume://workspace
```

---

## 构建

```bash
cd desktop-app && flutter pub get && flutter run -d macos
```

Tag：`desktop-v1.5.0`
