import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../models/lume_session.dart';

class SessionService {
  Future<List<LumeSession>> fetchSessions(String token) async {
    final uri = Uri.parse('${AppConfig.sessionsApi}?limit=100');
    final response = await http.get(
      uri,
      headers: {'Authorization': 'Bearer $token'},
    );

    if (response.statusCode == 401) {
      throw SessionException('登录已过期');
    }

    Map<String, dynamic> body;
    try {
      body = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw SessionException('会话列表响应异常');
    }

    if (response.statusCode != 200 || body['success'] != true) {
      throw SessionException(
        body['error']?.toString() ?? '加载会话失败',
      );
    }

    final raw = body['sessions'] as List<dynamic>? ?? [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(LumeSession.fromJson)
        .where((s) => s.key.isNotEmpty)
        .toList();
  }
}

class SessionException implements Exception {
  SessionException(this.message);
  final String message;
  @override
  String toString() => message;
}
