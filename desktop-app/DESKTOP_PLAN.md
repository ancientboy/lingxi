# Lume 原生 Mac 桌面端计划

## 目标

在 **lumeword.cn 云端** 之上，交付可安装的 **原生 Mac 客户端**：

- 原生登录、窗口、菜单、会话管理
- 聊天主界面与 Web **功能一致**（WebView + 原生高频模块）
- 布局对齐 **Web / Cursor**：左会话 · 中聊天 · 右工作台

本地 OpenClaw / 多设备管理 → **P4（后期）**。

---

## 布局（Cursor / Web 三栏）

| 列 | 实现 | 宽度 |
|----|------|------|
| 左 | 原生会话侧栏 | 260px（对齐 Web `--sidebar-w`） |
| 中 | WebView 消息区 + 原生输入框 | 居中 max ~720px |
| 右 | Web 右侧工作台（智能体 / 技能 / 工具） | 300px |

`desktop-app.css` 隐藏 Web 重复左栏与输入栏，保留右侧 rail。

---

## 阶段总览

| 阶段 | 目标 | 状态 |
|------|------|------|
| **P0** | 可编译 macOS + 登录 + WebView | ✅ |
| **P1** | CI / DMG 自动部署 lumeword.cn | ✅ |
| **P2** | 原生体验增强 | ✅ |
| **P3** | 模块化原生替换 | ✅ 核心完成 |
| **P4** | 本地 OpenClaw | 📋 后期 |

---

## P2 — 原生体验增强 ✅

- [x] `window_manager` 窗口记忆
- [x] macOS 菜单与快捷键
- [x] 系统通知（助手回复，窗口未聚焦时）
- [x] 深链 `lume://chat` / `lume://session?key=` / `lume://workspace`
- [x] 会话列表离线缓存

---

## P3 — 逐步原生化 ✅

- [x] 原生侧栏会话列表 + 搜索
- [x] 原生消息输入框 + 模型选择
- [x] 原生设置（订阅状态 / 打开网站 / 退出）
- [x] 办公区 / 技能 / 设备快捷入口 + Web 右侧工作台

---

## 深链示例

```
lume://chat
lume://session?key=agent:lingxi:main:chat_123
lume://workspace
lume://skills
```

---

## 本机构建

```bash
cd desktop-app
flutter pub get
flutter analyze
flutter run -d macos
```

Tag：`git tag desktop-v1.3.0 && git push origin desktop-v1.3.0`
