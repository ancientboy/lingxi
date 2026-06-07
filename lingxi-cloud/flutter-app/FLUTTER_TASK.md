# Flutter 办公区 + 文件管理器 需求文档

## 项目信息
- **项目路径**: `/root/.openclaw/workspace/lingxi-cloud/flutter-app`
- **Flutter SDK**: `/opt/flutter/bin/flutter`（用 admin 用户运行，不用 root）
- **后端 API 基地址**: 从 `lib/services/api_service.dart` 获取 `ApiService.baseUrl`

## 需要新增的页面

### 1. 办公区页面 `lib/pages/workspace_page.dart`

**功能**: 展示用户的 AI 团队成员 + 设备管理入口

**API 端点**:
- `GET /api/agent-workspace/team` — 获取团队成员列表
- 返回格式: `{ team: { name, members: [{ id, name, role, avatar, description }] } }`

**UI 设计**:
- 顶部：团队名称卡片（渐变背景）
- 中部：成员网格（2列），每个成员显示头像emoji、名字、角色标签
- 底部：设备管理入口按钮 → 跳转到 `ServersPage`

**参考 Web 版**: `frontend/agent-workspace.html`

### 2. 设备管理页面 `lib/pages/servers_page.dart`

**功能**: 查看、添加、切换用户的服务器设备

**API 端点**:
- `GET /api/agent-workspace/servers` — 获取服务器列表
- 返回格式: `{ servers: [{ id, name, ip, status, openclawPort, createdAt }] }`
- `POST /api/agent-workspace/servers/activate` — 切换活跃设备
- 请求: `{ serverId: "xxx" }` 
- **注意**: 激活后需要通知 WebSocket 重新连接（类似 web 端的 device-switched 逻辑）

**UI 设计**:
- 顶部 Appbar：标题 "设备管理"，返回按钮
- 服务器列表（ListView），每个服务器显示：
  - 服务器名称 + IP
  - 状态指示灯（绿色=在线，灰色=离线）
  - 右侧"激活"按钮或"当前设备"标签
- 底部：添加设备按钮（可选，后续做）

**参考 Web 版**: `frontend/servers.html`

### 3. 文件管理器页面 `lib/pages/file_explorer_page.dart`

**功能**: 浏览当前活跃设备上的文件系统（只读）

**API 端点**:
- `GET /api/file-explorer/list?path=/root` — 列出目录
- 返回格式: `{ path: "/root", files: [{ name, path, isDir, size, perms, owner, date }] }`
- `GET /api/file-explorer/get?path=/root/file.txt` — 读取文件内容
- 返回格式: `{ path, content, size }`

**UI 设计**:
- 顶部：当前路径面包屑（可点击跳转上级目录）
- 文件列表（ListView）：
  - 📁 文件夹：黄色图标 + 名称 + `/`
  - 📄 文件：灰色图标 + 名称 + 文件大小
  - 第一项永远是 `..`（返回上级）
- 点击文件夹 → 进入子目录
- 点击文件 → 跳转到文件查看页
- 右上角刷新按钮

### 4. 文件查看页面 `lib/pages/file_viewer_page.dart`

**功能**: 只读查看文件内容

**UI 设计**:
- 顶部：文件名 + 返回按钮
- 中部：代码风格展示（等宽字体，可滚动）
- 限制：超过 5MB 的文件提示"文件太大"

## 侧边栏菜单修改 `lib/widgets/side_menu.dart`

在"功能"区块中添加两个菜单项（放在"技能库"之后）：

```dart
_MenuItem(
  icon: Icons.business_outlined,
  title: '办公区',
  onTap: () {
    Navigator.of(context).pop();
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const WorkspacePage()),
    );
  },
),
_MenuItem(
  icon: Icons.folder_outlined,
  title: '文件管理器',
  onTap: () {
    Navigator.of(context).pop();
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const FileExplorerPage()),
    );
  },
),
```

## API Service 扩展 `lib/services/api_service.dart`

在 ApiService 类中添加以下方法：

```dart
// 办公区
Future<Map<String, dynamic>?> getTeam() async { ... }

// 设备管理
Future<Map<String, dynamic>?> getServers() async { ... }
Future<bool> activateServer(String serverId) async { ... }

// 文件管理器
Future<Map<String, dynamic>?> listFiles(String path) async { ... }
Future<Map<String, dynamic>?> getFile(String path) async { ... }
```

## 样式规范
- 主色: `Constants.primaryColor`（紫色）
- 背景色: 浅灰 `Color(0xFFF5F5F5)`
- 卡片: 白色背景 + 圆角 12 + 轻阴影
- 字体: 系统默认
- 图标: Material Icons
- 深色模式: 暂不需要

## 重要注意事项
1. 所有 API 请求需要带 `Authorization: Bearer <token>` header（参考现有 api_service.dart 的做法）
2. token 从 `SharedPreferences` 获取，key 是 `lingxi_token`
3. 不要用 root 用户运行 flutter 命令，用 `admin` 用户：`su - admin -c "/opt/flutter/bin/flutter build apk --release"`
4. 切换设备后，需要更新 `SharedPreferences` 中的服务器信息，并通知 WebSocket 重连
5. 文件管理器的路径要 `Uri.encodeComponent` 编码后传给 API
6. 错误处理：网络错误显示 SnackBar 提示

## 参考文件
- 侧边栏: `lib/widgets/side_menu.dart`
- API 服务: `lib/services/api_service.dart`
- 聊天页（WebSocket 参考）: `lib/pages/chat_page.dart`
- 订阅页（UI 参考）: `lib/pages/subscription_page.dart`
- 设置页（UI 参考）: `lib/pages/settings_page.dart`
