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

重新生成 App 图标（C1-13）：

```bash
python3 scripts/generate-macos-icons.py
# 需要: pip install pillow，/tmp/pptr 下已安装 puppeteer
```

## Mac 安装包（CI 自动构建）

GitHub Actions 工作流 **Mac Desktop (DMG)**：

1. **自动构建**：`main` 分支 `desktop-app/` 有变更时，在 macOS runner 上打出 `Lume-mac.dmg`
2. **下载方式**：
   - 登录页「下载 Mac 版」→ `https://lumeword.cn/downloads/Lume-mac.dmg`（部署到生产后）
   - 或 GitHub Releases：`https://github.com/ancientboy/lingxi/releases/latest/download/Lume-mac.dmg`
3. **发布 tag**：推送 `desktop-v1.0.0` 等 tag 会自动创建 Release 并上传 DMG
4. **部署到 lumeword.cn**：`main` 分支构建成功后自动 SCP 上传（需配置 Secrets：`DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_PASSWORD` 或 `DEPLOY_SSH_KEY`）。也可在 Actions 里手动 **Run workflow** 重新部署。

本地打 DMG（可选）：

```bash
bash scripts/build-macos-dmg.sh
```

## 架构

- **P0**：原生登录（邮箱验证码 + 密码）+ WebView `chat.html?desktop=1`
- **品牌**：C1-13 蜂巢巢室 Logo
- 详见 [DESKTOP_PLAN.md](./DESKTOP_PLAN.md)

## 环境变量

```bash
flutter run --dart-define=LUME_API_ORIGIN=http://localhost:3000
```

## 依赖

- Flutter 3.22+ / Dart 3.12+
- macOS 12+（WebView 使用 WKWebView）
