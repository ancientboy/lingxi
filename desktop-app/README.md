# Lume Desktop

macOS / Windows / Linux 桌面客户端（Flutter）。

## 快速开始（Mac）

```bash
cd desktop-app
flutter pub get
flutter run -d macos
```

## 构建 Mac 应用

```bash
flutter build macos --release
# 产物: build/macos/Build/Products/Release/Lume.app
```

## 架构

- **P0**：原生登录 + WebView 加载 `https://lumeword.cn/chat.html`（与 Web UI 一致）
- 详见 [DESKTOP_PLAN.md](./DESKTOP_PLAN.md)

## 环境变量

```bash
flutter run --dart-define=LUME_API_ORIGIN=http://localhost:3000
```

## 依赖

- Flutter 3.22+ / Dart 3.12+
- macOS 12+（WebView 使用 WKWebView）
