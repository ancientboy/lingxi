# 灵犀云 Flutter App 实现总结

## 完成的任务

### 任务 1: 侧边栏历史会话 ✅

**文件**: `widget/side_menu.dart`

**实现内容**:

1. **API 服务**:
   - 在 `api_service.dart` 中移除了 `getSessions()` 方法（改用 WebSocket）
   - 会话列表通过 WebSocket 的 `sessions.list` 请求获取

2. **会话分组显示**:
   - 添加了 `SessionGroup` 枚举: `today`, `last7Days`, `previous`
   - 实现了 `_groupSessionsByDate()` 方法，将会话按时间分组
   - 实现了 `_formatSessionTime()` 方法，格式化时间显示（今天、昨天、前天、几天前）

3. **会话列表对话框** (`_SessionsDialog`):
   - 通过 WebSocket 加载会话列表（最多 50 个）
   - 支持从本地 SharedPreferences 加载备用数据
   - 支持会话时间分组显示：今天、最近7天、更早
   - 点击会话跳转到聊天页面

4. **WebSocket 集成**:
   - 利用现有的 `WebSocketService` 发送 `sessions.list` 请求
   - 监听 WebSocket 响应并处理会话列表
   - 支持会话排序和过滤

### 任务 2: 使用量统计页面 ✅

**文件**: `widget/side_menu.dart`

**实现内容**:

1. **API 调用**:
   - 使用 `ApiService.getUsageStats()` 调用 `/api/usage/stats` 接口
   - 显示真实的 token 使用量数据

2. **数据展示**:
   - 积分余额 (qm) - 从 `appProvider.user?.points`
   - 今日使用 - `data.today.tokens`
   - 本周使用 - `data.week.tokens`
   - 本月使用 - `data.month.tokens`

3. **UI 改进**:
   - 添加加载状态提示
   - 数字格式化（千分位）
   - 错误处理和重试机制

## 技术细节

### WebSocket 会话列表流程

```
用户点击"历史会话"按钮
    ↓
_showSessionsDialog()
    ↓
_loadSessions()
    ↓
WebSocketService.sendRequest('sessions.list', {})
    ↓
WebSocket 消息监听器捕获响应
    ↓
处理 payload.sessions
    ↓
数据分组和排序
    ↓
渲染会话列表对话框
```

### 会话分组逻辑

```dart
enum SessionGroup {
  today,      // 今天创建/更新的会话
  last7Days,  // 最近7天的会话
  previous,   // 更早的会话
}
```

### 文件修改列表

1. `lib/widgets/side_menu.dart`
   - 添加历史会话菜单项
   - 实现 `_showSessionsDialog()` 方法
   - 实现 `_showUsageStatsDialog()` 方法（异步加载）
   - 添加 `_SessionsDialog` 类

2. `lib/services/api_service.dart`
   - 保留 `getUsageStats()` 方法
   - 移除 `getSessions()` 方法（改用 WebSocket）

## 待优化项

1. **会话删除功能**: 目前只是跳转到聊天页面，实际删除会话需要集成 WebSocket 的 `sessions.delete` 请求
2. **本地会话缓存**: 可以在 SharedPreferences 中缓存会话列表，提升切换速度
3. **会话创建**: `_createNewSession()` 方法目前只是显示提示，需要集成 WebSocket 的会话创建逻辑

## 测试建议

1. 测试 WebSocket 连接状态下的会话加载
2. 测试 WebSocket 未连接时的本地缓存加载
3. 测试会话分组显示是否正确（今天、最近7天、更早）
4. 测试点击会话后跳转行为
5. 测试使用量统计数据是否正确显示

## API 参考

### WebSocket `sessions.list` 响应格式

```json
{
  "type": "res",
  "id": "req_1",
  "ok": true,
  "payload": {
    "sessions": [
      {
        "key": "agent:lingxi:xxx:session1",
        "title": "会话标题",
        "updatedAt": "2026-03-04T12:00:00Z"
      }
    ]
  }
}
```

### HTTP `/api/usage/stats` 响应格式

```json
{
  "success": true,
  "data": {
    "today": {
      "tokens": 12345,
      "requests": 10
    },
    "week": {
      "tokens": 123456,
      "requests": 100
    },
    "month": {
      "tokens": 1234567,
      "requests": 1000
    }
  }
}
```
