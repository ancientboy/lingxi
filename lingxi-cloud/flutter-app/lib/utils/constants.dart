import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class Constants {
  // API 配置
  static const String baseUrl = 'https://lumeword.cn';
  
  // WebSocket 配置
  static const String websocketUrl = 'wss://lumeword.cn/api/ws';

  // Lume OpenClaw 插件 WebSocket（订阅用户直连）
  static const String lumeWsUrl = 'ws://120.55.192.144:18790';
  static const String lumeWsSecret = 'lume-secret-2026';
  
  // 本地存储键
  static const String storageAccessToken = 'lingxi_token';
  static const String storageUserId = 'user_id';
  static const String storageUserName = 'user_name';
  static const String storageUserEmail = 'user_email';
  static const String storageAccentTheme = 'lingxi_accent_theme';
  static const String storageLumeTestMode = 'lingxi_lume_test_mode';
  
  // 应用配置
  static const String appName = 'Lume';
  static const String appVersion = '1.0.0';
  static const String appDescription = 'AI Agent 智能助手平台';

  // ===== 主题色管理 =====
  static const Color _green = Color(0xFF10a37f);
  static const Color _greenH = Color(0xFF0d8a6a);
  static const Color _hermes = Color(0xFFE87040);
  static const Color _hermesH = Color(0xFFD45A2A);

  // 当前主题色（动态）
  static const Color primaryColor = _green;
  static const Color secondaryColor = _greenH;
  static final ValueNotifier<Color> primaryColorNotifier = ValueNotifier(_green);
  static final ValueNotifier<Color> secondaryColorNotifier = ValueNotifier(_greenH);

  // 主题名列表
  static const List<Map<String, String>> accentThemes = [
    {'key': 'default', 'name': '翡翠绿'},
    {'key': 'hermes', 'name': '爱马仕橙'},
  ];

  // 切换主题色
  static Future<void> setAccentTheme(String key) async {
    final isHermes = key == 'hermes';
    primaryColorNotifier.value = isHermes ? _hermes : _green;
    secondaryColorNotifier.value = isHermes ? _hermesH : _greenH;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(storageAccentTheme, key);
  }

  // 初始化主题色
  static Future<void> initAccentTheme() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(storageAccentTheme) ?? 'default';
    await setAccentTheme(saved);
  }

  // 获取当前主题 key
  static Future<String> getAccentKey() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(storageAccentTheme) ?? 'default';
  }

  // ===== 设计令牌（对齐 Web 端 chat.css） =====

  // 背景色
  static const Color backgroundColor = Color(0xFFF7F7F8);    // --bg-main
  static const Color surfaceColor = Colors.white;             // --bg-white
  static const Color bgSidebar = Color(0xFFF9FAFB);           // --bg-sidebar
  static const Color bgHover = Color(0xFFF3F3F4);             // --bg-hover
  static const Color bgBubbleUser = Color(0xFFF0F0F1);        // --bg-bubble-user
  static const Color bgBubbleBot = Colors.white;              // --bg-bubble

  // 文字色
  static const Color textPrimaryColor = Color(0xFF1A1A2E);    // --text-primary
  static const Color textSecondaryColor = Color(0xFF6B7280);  // --text-secondary
  static const Color textTertiaryColor = Color(0xFF9CA3AF);   // --text-tertiary
  static const Color textPlaceholderColor = Color(0xFF9CA3AF); // placeholder
  static const Color textLightColor = Color(0xFF9CA3AF);      // alias for textTertiaryColor (backward compat)
  
  // 边框
  static const Color borderDefault = Color(0xFFE5E5E5);
  static const Color borderLight = Color(0xFFF0F0F1);

  // 功能色
  static const Color errorColor = Color(0xFFEF4444);
  
  // 圆角（对齐 Web --radius-*）
  static const double radiusSm = 8.0;
  static const double radiusMd = 12.0;
  static const double radiusLg = 20.0;
  static const double radiusXl = 24.0;
  
  // 字体（对齐 Web font-family 栈）
  static const String fontFamilyIOS = 'SF Pro Text';
  static const String fontFamilyAndroid = 'Roboto';
  
  // 其他常量
  static const int pageSize = 20;
  static const int maxMessageLength = 4000;
  static const Duration animationDuration = Duration(milliseconds: 300);
}
