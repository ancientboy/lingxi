import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';

class AuthSession {
  const AuthSession({required this.token, required this.user});

  final String token;
  final Map<String, dynamic> user;

  String? get displayName {
    final name = user['nickname'] ?? user['name'] ?? user['email'];
    return name?.toString();
  }
}

class AuthStorage {
  static Future<AuthSession?> read() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(AppConfig.tokenKey);
    final userRaw = prefs.getString(AppConfig.userKey);
    if (token == null || token.isEmpty || userRaw == null) return null;
    try {
      final user = jsonDecode(userRaw) as Map<String, dynamic>;
      return AuthSession(token: token, user: user);
    } catch (_) {
      return null;
    }
  }

  static Future<void> write({required String token, required Map<String, dynamic> user}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConfig.tokenKey, token);
    await prefs.setString(AppConfig.userKey, jsonEncode(user));
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConfig.tokenKey);
    await prefs.remove(AppConfig.userKey);
  }
}
