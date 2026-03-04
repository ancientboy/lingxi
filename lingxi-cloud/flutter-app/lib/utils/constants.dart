import 'package:flutter/material.dart';

class Constants {
  // API 配置
  static const String baseUrl = 'http://120.55.192.144:3000';
  
  // WebSocket 配置
  static const String websocketUrl = 'ws://120.55.192.144:3000/ws';
  
  // 本地存储键
  static const String storageAccessToken = 'lingxi_token';
  static const String storageUserId = 'user_id';
  static const String storageUserName = 'user_name';
  static const String storageUserEmail = 'user_email';
  
  // 应用配置
  static const String appName = '灵犀云';
  static const String appVersion = '1.0.0';
  static const String appDescription = 'AI Agent 智能助手平台';
  
  // UI 配置 - 灵犀云主题色（绿色）
  static const Color primaryColor = Color(0xFF10a37f);
  static const Color secondaryColor = Color(0xFF0d8a6a);
  static const Color backgroundColor = Color(0xFFF8FAFC);
  static const Color surfaceColor = Colors.white;
  static const Color errorColor = Color(0xFFEF4444);
  static const Color textPrimaryColor = Color(0xFF1F2937);
  static const Color textSecondaryColor = Color(0xFF6B7280);
  static const Color textLightColor = Color(0xFF9CA3AF);
  
  // 其他常量
  static const int pageSize = 20;
  static const int maxMessageLength = 4000;
  static const Duration animationDuration = Duration(milliseconds: 300);
}
