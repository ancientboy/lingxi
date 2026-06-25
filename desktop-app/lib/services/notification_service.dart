import 'dart:convert';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:window_manager/window_manager.dart';

/// macOS system notifications for new assistant replies.
class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;
  String? _lastSessionKey;
  DateTime? _lastNotifyAt;

  Future<void> init() async {
    if (_ready) return;

    const mac = DarwinInitializationSettings();
    const settings = InitializationSettings(macOS: mac);
    await _plugin.initialize(settings);
    _ready = true;
  }

  Future<void> showAssistantReply({
    required String title,
    required String body,
    String? sessionKey,
  }) async {
    if (!_ready || body.trim().isEmpty) return;

    final focused = await windowManager.isFocused();
    if (focused) return;

    final now = DateTime.now();
    if (sessionKey != null &&
        sessionKey == _lastSessionKey &&
        _lastNotifyAt != null &&
        now.difference(_lastNotifyAt!) < const Duration(seconds: 2)) {
      return;
    }
    _lastSessionKey = sessionKey;
    _lastNotifyAt = now;

    final id = (sessionKey?.hashCode ?? body.hashCode).abs() % 100000;

    await _plugin.show(
      id,
      title,
      body,
      const NotificationDetails(
        macOS: DarwinNotificationDetails(),
      ),
    );
  }

  void handleBridgeMessage(String raw) {
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      if (map['type'] != 'assistant_message') return;
      showAssistantReply(
        title: map['title']?.toString() ?? 'Lume',
        body: map['body']?.toString() ?? '',
        sessionKey: map['sessionKey']?.toString(),
      );
    } catch (_) {}
  }
}
