# Lume 原生 Mac 桌面端计划

## 目标

在 **lumeword.cn 云端** 之上，交付可安装的 **原生 Mac 客户端**：

- 原生登录、窗口、菜单、会话管理
- 聊天主界面与 Web **功能一致**（P0–P2 用 WebView 加载 `chat.html`）
- 逐步把高频模块做成原生 UI（P3+）

本地 OpenClaw / 多设备管理 → **P4（后期）**。

---

## 阶段总览

| 阶段 | 目标 | 状态 |
|------|------|------|
| **P0** | 可编译 macOS 工程 + 登录 + WebView 聊天 | ✅ 完成 |
| **P1** | `.app` / `.dmg` 发布与 CI | 🔄 待打 tag `desktop-v1.1.0` |
| **P2** | 原生体验增强 | 🔄 部分完成 |
| **P3** | 模块化原生替换聊天 | 🔄 侧栏已原生 |
| **P4** | 本地 OpenClaw | 📋 后期 |

---

## P0 — 可运行壳 ✅

- [x] Flutter `desktop-app/` + 完整 `macos/Runner`
- [x] C1-13 品牌 Logo、启动页动效
- [x] 邮箱验证码 + 密码登录
- [x] WebView 注入 token / user
- [x] `dart analyze` / `flutter test` 通过

---

## P1 — 发布

- [x] GitHub Actions `macos-desktop.yml`
- [x] `scripts/build-macos-dmg.sh`
- [x] AppIcon C1-13 全套 PNG
- [x] `frontend/downloads/version.json` → 1.1.0
- [ ] 推送 tag `desktop-v1.1.0` 触发 Release + 上传 DMG

---

## P2 — 原生体验增强

- [x] `window_manager`：记住窗口大小
- [x] macOS 菜单：About Lume、Refresh (⌘R)、Quit (⌘Q)
- [x] `desktop-app.css`：隐藏 Web 重复侧栏与输入栏
- [x] 原生消息输入框（Enter / ⌘Enter 发送）
- [x] 侧栏搜索、用户区、设置页（⌘,）
- [x] 窗口标题跟随当前会话
- [x] 菜单：新对话 (⌘N)
- [ ] 系统通知（新消息）
- [ ] 深链 `lume://`
- [ ] 离线缓存

---

## P3 — 逐步原生化

- [x] **原生侧栏会话列表**（`/api/lume-ws/sessions`）
- [x] 点击会话 → `switchSession()` JS 桥接
- [x] 新对话 → `createNewSession()` JS 桥接
- [x] **原生消息输入框**（`lumeDesktopSend` 桥接）
- [x] 原生设置页（账号 / 打开网站 / 退出）
- [ ] 原生设置 / 订阅页（完整）
- [ ] Agent 团队 / 办公区

---

## P4 — 本地 OpenClaw（后期）

- 可配置 Gateway 地址
- 局域网 Gateway WebSocket
- 与云端账号关系

---

## 仓库结构

```
desktop-app/lib/
  main.dart                 # window_manager + PlatformMenuBar
  pages/
    splash_page.dart
    login_page.dart
    desktop_shell_page.dart # 原生侧栏 + WebView
  widgets/
    web_chat_view.dart
    session_sidebar.dart
    chat_composer.dart
    settings_sheet.dart
    lume_animated_mark.dart
  services/
    auth_service.dart
    session_service.dart
    window_state_service.dart
```

---

## 本机构建

```bash
cd desktop-app
flutter pub get
flutter analyze
flutter run -d macos
flutter build macos --release
bash ../scripts/build-macos-dmg.sh
```

Tag 发布：`git tag desktop-v1.1.0 && git push origin desktop-v1.1.0`
