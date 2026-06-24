# Lume 桌面端开发计划

## 背景

- 144 服务器上旧 `flutter-app` **源码已残缺**（无 `pubspec.yaml` / `main.dart`，无完整 `macos/Runner`），但 **Android APK 仍可打包**（`lume-v1.9.4.apk`）。
- Web 端已统一为 Lume 新视觉（墨绿 `#3d6b62`）。
- **本期范围**：连接 **lumeword.cn 云端**；本地 OpenClaw 设备管理放到后期。

## 技术路线

| 阶段 | 目标 | 说明 |
|------|------|------|
| **P0（当前）** | 可编译的 macOS 工程 + 登录 + 主界面 | Flutter `desktop-app/`，WebView 加载与 Web 一致的 `chat.html` |
| **P1** | Mac `.app` / `.dmg` 发布 | 在你本机 `flutter build macos`，CI/Codemagic 可选 |
| **P2** | 原生体验增强 | 窗口管理、深链、离线缓存、系统通知 |
| **P3** | 逐步原生替换 | 从 6000 行旧 `chat_page.dart` 备份中按需迁移模块 |
| **P4（后期）** | 本地 OpenClaw | 多服务器、Gateway WS、设备切换 |

**P0 采用 WebView 壳**：与浏览器 UI 100% 一致，避免在源码丢失情况下重写整套原生聊天。

## 仓库结构

```
desktop-app/
  lib/
    config/app_config.dart      # API / Web 根地址
    theme/lume_theme.dart       # 与 Web token 对齐
    services/auth_service.dart  # 登录、token 持久化
    pages/login_page.dart       # 原生登录
    pages/web_app_page.dart     # WebView 主界面
    main.dart
  macos/                        # 完整 Runner.xcodeproj（可 build macos）
  windows/ linux/               # 后续可编桌面版
```

## P0 验收标准

- [ ] `flutter pub get` / `dart analyze` 无错误
- [ ] Mac 上 `flutter run -d macos` 可启动
- [ ] 邮箱+密码登录 lumeword.cn
- [ ] 登录后进入聊天页，session / 发消息与 Web 一致
- [ ] 退出登录返回原生登录页

## Mac 本机构建

```bash
cd desktop-app
flutter pub get
flutter run -d macos          # 调试
flutter build macos           # 产物: build/macos/Build/Products/Release/lume_desktop.app
```

## 与旧移动端工程关系

- 旧包名 `lingxicloud`、备份在 144 `flutter-app/lib/*.bak`。
- 新桌面工程包名 `lume_desktop`，稳定后可考虑合并或作为 `desktop-app` 子目录独立演进。
