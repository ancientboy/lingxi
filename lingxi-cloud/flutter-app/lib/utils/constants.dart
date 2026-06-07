import 'package:flutter/material.dart';

class Constants {
  // API 配置
  static const String baseUrl = 'https://lumeword.cn';
  
  // WebSocket 配置
  static const String websocketUrl = 'wss://lumeword.cn/api/ws';
  
  // 本地存储键
  static const String storageAccessToken = 'lingxi_token';
  static const String storageUserId = 'user_id';
  static const String storageUserName = 'user_name';
  static const String storageUserEmail = 'user_email';
  
  // 应用配置
  static const String appName = 'Lume';
  static const String appVersion = '1.0.0';
  static const String appDescription = 'AI Agent 智能助手平台';

  // ===== 设计令牌（对齐 Web 端 chat.css） =====
  
  // 主题色
  static const Color primaryColor = Color(0xFF10a37f);
  static const Color secondaryColor = Color(0xFF0d8a6a);
  static const Color accentSoft = Color(0x1210a37f); // 10a37f12

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
