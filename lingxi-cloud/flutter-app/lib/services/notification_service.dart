import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/foundation.dart';

/// 本地通知服务
/// 用于在 App 后台时显示 OpenClaw 定时任务通知
class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;

  /// 初始化通知服务
  Future<void> initialize() async {
    if (_initialized) return;

    try {
      // Android 初始化设置
      const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');

      // iOS 初始化设置
      const iosSettings = DarwinInitializationSettings(
        requestAlertPermission: true,
        requestBadgePermission: true,
        requestSoundPermission: true,
      );

      const initSettings = InitializationSettings(
        android: androidSettings,
        iOS: iosSettings,
      );

      await _notifications.initialize(
        initSettings,
        onDidReceiveNotificationResponse: _onNotificationTapped,
      );

      _initialized = true;
      debugPrint('✅ 通知服务初始化成功');
    } catch (e) {
      debugPrint('❌ 通知服务初始化失败: $e');
    }
  }

  /// 请求通知权限（Android 13+ 必需）
  Future<bool> requestPermission() async {
    try {
      // Android 权限请求
      final androidPlugin = _notifications.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();

      if (androidPlugin != null) {
        final granted = await androidPlugin.requestNotificationsPermission();
        debugPrint('📱 Android 通知权限: ${granted == true ? "已授权" : "未授权"}');
        return granted ?? false;
      }

      // iOS 权限请求
      final iosPlugin = _notifications.resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin>();

      if (iosPlugin != null) {
        final granted = await iosPlugin.requestPermissions(
          alert: true,
          badge: true,
          sound: true,
        );
        debugPrint('📱 iOS 通知权限: ${granted == true ? "已授权" : "未授权"}');
        return granted ?? false;
      }

      return false;
    } catch (e) {
      debugPrint('❌ 请求通知权限失败: $e');
      return false;
    }
  }

  /// 显示通知
  Future<void> showNotification({
    required int id,
    required String title,
    required String body,
    String? payload,
  }) async {
    try {
      // Android 通知详情
      const androidDetails = AndroidNotificationDetails(
        'lume_channel',  // 通道 ID
        'Lume 通知',      // 通道名称
        channelDescription: '来自 OpenClaw 的消息通知',
        importance: Importance.high,
        priority: Priority.high,
        showWhen: true,
        enableVibration: true,
        enableLights: true,
      );

      // iOS 通知详情
      const iosDetails = DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
      );

      const notificationDetails = NotificationDetails(
        android: androidDetails,
        iOS: iosDetails,
      );

      await _notifications.show(
        id,
        title,
        body,
        notificationDetails,
        payload: payload,
      );

      debugPrint('🔔 通知已显示: $title - $body');
    } catch (e) {
      debugPrint('❌ 显示通知失败: $e');
    }
  }

  /// 点击通知的回调
  void _onNotificationTapped(NotificationResponse response) {
    debugPrint('👆 用户点击了通知: ${response.payload}');
    // TODO: 可以在这里处理点击通知后的跳转逻辑
  }

  /// 取消指定通知
  Future<void> cancel(int id) async {
    await _notifications.cancel(id);
    debugPrint('🗑️ 已取消通知: $id');
  }

  /// 取消所有通知
  Future<void> cancelAll() async {
    await _notifications.cancelAll();
    debugPrint('🗑️ 已取消所有通知');
  }
}
