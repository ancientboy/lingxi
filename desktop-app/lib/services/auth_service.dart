import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import 'auth_storage.dart';

class AuthException implements Exception {
  AuthException(this.message);
  final String message;
  @override
  String toString() => message;
}

class SendCodeResult {
  SendCodeResult({required this.retryAfter});
  final int retryAfter;
}

class AuthService {
  Future<SendCodeResult> sendEmailCode(String email) async {
    final response = await http.post(
      Uri.parse(AppConfig.sendCodeApi),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email.trim().toLowerCase()}),
    );

    Map<String, dynamic> body;
    try {
      body = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw AuthException('服务器响应异常');
    }

    if (response.statusCode == 429) {
      throw AuthException(
        body['error']?.toString() ?? '发送过于频繁，请稍后再试',
      );
    }

    if (response.statusCode != 200 || body['success'] != true) {
      throw AuthException(body['error']?.toString() ?? '发送验证码失败');
    }

    return SendCodeResult(retryAfter: body['retryAfter'] as int? ?? 60);
  }

  Future<AuthSession> verifyEmailCode({
    required String email,
    required String code,
    String? inviteCode,
  }) async {
    final response = await http.post(
      Uri.parse(AppConfig.verifyCodeApi),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email.trim().toLowerCase(),
        'code': code.trim(),
        if (inviteCode != null && inviteCode.trim().isNotEmpty)
          'inviteCode': inviteCode.trim(),
      }),
    );

    return _sessionFromAuthResponse(response);
  }

  Future<AuthSession> loginWithPassword({
    required String identifier,
    required String password,
  }) async {
    final trimmed = identifier.trim();
    final payload = isValidEmail(trimmed)
        ? {'email': trimmed, 'password': password}
        : {'nickname': trimmed, 'password': password};

    final response = await http.post(
      Uri.parse(AppConfig.loginApi),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );

    return _sessionFromAuthResponse(response);
  }

  Future<AuthSession> _sessionFromAuthResponse(http.Response response) async {
    Map<String, dynamic> body;
    try {
      body = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw AuthException('服务器响应异常');
    }

    if (response.statusCode != 200 || body['success'] != true) {
      throw AuthException(body['error']?.toString() ?? '登录失败');
    }

    final token = body['token']?.toString();
    final user = body['user'] as Map<String, dynamic>?;
    if (token == null || token.isEmpty || user == null) {
      throw AuthException('登录响应不完整');
    }

    final session = AuthSession(token: token, user: user);
    await AuthStorage.write(token: token, user: user);
    return session;
  }

  Future<AuthSession?> restoreSession() => AuthStorage.read();

  Future<void> logout() => AuthStorage.clear();

  Future<bool> verifyToken(String token) async {
    final response = await http.get(
      Uri.parse(AppConfig.verifyApi),
      headers: {'Authorization': 'Bearer $token'},
    );
    if (response.statusCode != 200) return false;
    try {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return body['valid'] == true;
    } catch (_) {
      return false;
    }
  }

  static bool isValidEmail(String value) {
    return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value);
  }
}
