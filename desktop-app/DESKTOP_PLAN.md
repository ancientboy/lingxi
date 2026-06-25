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
| **P0** | 可编译 macOS 工程 + 登录 + WebView 聊天 | 🔄 进行中 |
| **P1** | `.app` / `.dmg` 发布与 CI | ✅ CI 已有，随 P0 验收后打 tag |
| **P2** | 原生体验增强 | 📋 待做 |
| **P3** | 模块化原生替换聊天 | 📋 待做 |
| **P4** | 本地 OpenClaw | 📋 后期 |

---

## P0 — 可运行壳（当前迭代）

### 交付项

- [x] Flutter `desktop-app/` + 完整 `macos/Runner`
- [x] C1-13 品牌 Logo 资产
- [x] macOS 默认窗口 1200×800、最小 900×620
- [x] Debug 网络 entitlement（WebView 可联网）
- [ ] **邮箱验证码登录**（与 Web 一致）
- [ ] **密码登录**（邮箱/昵称 + 密码）
- [ ] WebView 注入 `lingxi_token` / `lingxi_user`
- [ ] `flutter analyze` 无 error
- [ ] Mac `flutter run -d macos` 全流程：登录 → 聊天 → 退出

### 技术要点

- `AuthService`: `/api/auth/send-code`, `/verify-code`, `/login`, `/verify`
- `WebAppPage`: WKWebView + `localStorage` 注入
- `chat.html?desktop=1` 隐藏 Web 内重复顶栏（若适用）

---

## P1 — 发布

- [x] GitHub Actions `macos-desktop.yml`
- [x] `scripts/build-macos-dmg.sh` → `Lume-mac.dmg`
- [x] AppIcon 全套 PNG（1024→16，C1-13）
- [x] 启动页 Logo 动效（巢室呼吸 + 伙伴探头）
- [ ] 网站 `downloads/version.json` 与 Release 同步
- [ ] 首次启动引导（可选）

---

## P2 — 原生体验增强

- `window_manager`：记住窗口大小、标题栏样式
- 系统通知（新消息，需 Gateway/推送通道）
- 深链 `lume://` 打开会话
- 离线：登录态缓存 + WebView 静态资源降级
- 菜单栏：刷新、打开设置、关于 Lume
- 键盘快捷键（刷新 Cmd+R、退出 Cmd+Q 已有系统菜单）

---

## P3 — 逐步原生化（按模块）

优先级建议：

1. **侧栏会话列表**（原生 List + API）
2. **消息输入框**（原生，WebView 仅消息区或逐步替换）
3. **设置 / 订阅 / Token**（原生 Web 或混合）
4. **Agent 团队 / 办公区**（视 API 成熟度）

旧 144 服务器 `flutter-app/lib/chat_page.dart.bak` 可作参考，按需迁移，**不整包回滚**。

---

## P4 — 本地 OpenClaw（后期）

- 可配置 Gateway 地址（`LUME_API_ORIGIN` / 设备列表）
- 局域网 Gateway WebSocket
- 与云端账号关系、数据同步策略

---

## 仓库结构

```
desktop-app/
  lib/
    config/app_config.dart
    theme/lume_theme.dart
    services/auth_service.dart
    services/auth_storage.dart
    widgets/lume_mark.dart
    pages/login_page.dart      # 原生登录（验证码 + 密码）
    pages/web_app_page.dart    # WebView 主界面
    main.dart
  assets/brand/lume-mark.svg
  macos/
```

---

## 本机构建

```bash
cd desktop-app
flutter pub get
flutter analyze
flutter run -d macos
flutter build macos --release
# 产物: build/macos/Build/Products/Release/Lume.app
bash ../scripts/build-macos-dmg.sh
```

环境变量：`--dart-define=LUME_API_ORIGIN=https://lumeword.cn`

---

## 与旧工程

- 旧 `flutter-app`（144）：源码残缺，仅 APK 可参考
- 新工程包名 `lume_desktop`，独立演进于 `desktop-app/`
