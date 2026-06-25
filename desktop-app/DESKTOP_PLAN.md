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
| **P3+ 原生右侧工作台** | ✅ v1.4.0 |
| P4 本地 OpenClaw | 📋 后期 |

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

Tag：`desktop-v1.4.0`
