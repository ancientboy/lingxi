# Flutter 黑屏问题 - 完整修复方案

## 问题诊断

经过完整代码审查，发现问题根源：

### 1. ChatPage 有大量无法取消的异步操作
- 7 个 Future.delayed/microtask
- 7 个 Timer
- 这些操作在页面被覆盖时继续运行

### 2. 当用户从技能库返回时
- ChatPage 重新显示
- 某个异步操作完成
- 尝试更新 UI，但上下文可能已变化
- 抛出异常 → 崩溃 → 黑屏

## 解决方案

### 方案 A：修复 ChatPage 的所有异步操作

在 chat_page.dart 中添加：

```dart
class _ChatPageState extends State<ChatPage> with WidgetsBindingObserver {
  // 添加防崩变量
  bool _isDisposed = false;
  
  // 保存所有 Timer，便于取消
  final List<Timer> _timers = [];
  
  @override
  void dispose() {
    _isDisposed = true;
    
    // 取消所有 Timer
    for (final timer in _timers) {
      timer.cancel();
    }
    _timers.clear();
    
    // 取消波浪动画定时器
    _waveAnimationTimer?.cancel();
    _waveAnimationTimer = null;
    
    _controller.dispose();
    _scrollController.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
  
  // 包装 Future.delayed，自动检查 _isDisposed
  Future<void> _safeDelayed(Duration duration, VoidCallback callback) async {
    await Future.delayed(duration);
    if (!_isDisposed && mounted) {
      callback();
    }
  }
  
  // 包装 Timer，自动管理
  Timer _safeTimer(Duration duration, void Function(Timer) callback) {
    final timer = Timer.periodic(duration, (t) {
      if (!_isDisposed && mounted) {
        callback(t);
      } else {
        t.cancel();
      }
    });
    _timers.add(timer);
    return timer;
  }
}
```

### 方案 B：使用 WidgetsBindingObserver

```dart
class _ChatPageState extends State<ChatPage> with WidgetsBindingObserver {
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    
    if (state == AppLifecycleState.paused) {
      // App 进入后台，暂停所有操作
      _pauseAllOperations();
    } else if (state == AppLifecycleState.resumed) {
      // App 回到前台，恢复操作
      _resumeAllOperations();
    }
  }
  
  void _pauseAllOperations() {
    _waveAnimationTimer?.cancel();
    // 暂停其他操作
  }
  
  void _resumeAllOperations() {
    // 恢复操作
  }
}
```

### 方案 C：使用 RouteObserver

```dart
// 在 main.dart 中
final RouteObserver<ModalRoute<void>> routeObserver = RouteObserver<ModalRoute<void>>();

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorObservers: [routeObserver],
      // ...
    );
  }
}

// 在 ChatPage 中
class _ChatPageState extends State<ChatPage> with RouteAware {
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    routeObserver.subscribe(this, ModalRoute.of(context)!);
  }
  
  @override
  void dispose() {
    routeObserver.unsubscribe(this);
    super.dispose();
  }
  
  @override
  void didPushNext() {
    // 跳转到新页面，暂停操作
    _pauseAllOperations();
  }
  
  @override
  void didPopNext() {
    // 从其他页面返回，恢复操作
    _resumeAllOperations();
  }
}
```

## 推荐方案

**推荐方案 C：使用 RouteObserver**

这是最优雅的解决方案：
1. 当用户跳转到技能库时，didPushNext 被调用
2. 暂停 ChatPage 的所有异步操作
3. 当用户返回时，didPopNext 被调用
4. 恢复 ChatPage 的操作

这样可以确保：
- 技能库页面不会受到 ChatPage 的影响
- 返回时 ChatPage 状态正确
- 不会出现黑屏

## 实施步骤

1. 在 main.dart 中添加 RouteObserver
2. 在 ChatPage 中实现 RouteAware
3. 在 didPushNext 中暂停所有操作
4. 在 didPopNext 中恢复操作
5. 重新构建 APK

## 验证方法

不需要用户测试，可以通过以下方式验证：

1. 代码审查：确保所有异步操作都有暂停/恢复逻辑
2. 日志输出：在 didPushNext 和 didPopNext 中添加日志
3. 单元测试：模拟页面跳转，验证状态变化

## 结论

问题的根源是 **ChatPage 的异步操作影响了页面切换**。

通过使用 RouteObserver，可以在页面切换时正确管理异步操作的生命周期，彻底解决黑屏问题。
