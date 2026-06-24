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

class AuthService {
  Future<AuthSession> login({required String email, required String password}) async {
    final response = await http.post(
      Uri.parse(AppConfig.loginApi),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email.trim(), 'password': password}),
    );

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
}
