import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';
import '../models/lume_session.dart';

class SessionService {
  static const _cacheKey = 'lume_desktop_sessions_cache';
  static const _cacheTimeKey = 'lume_desktop_sessions_cache_time';

  Future<List<LumeSession>> fetchSessions(
    String token, {
    bool useCacheOnError = true,
  }) async {
    try {
      final list = await _fetchRemote(token);
      await _writeCache(list);
      return list;
    } on SessionException {
      if (useCacheOnError) {
        final cached = await _readCache();
        if (cached != null && cached.isNotEmpty) return cached;
      }
      rethrow;
    } catch (_) {
      if (useCacheOnError) {
        final cached = await _readCache();
        if (cached != null && cached.isNotEmpty) return cached;
      }
      throw SessionException('加载会话失败');
    }
  }

  Future<List<LumeSession>?> readCachedSessions() => _readCache();

  Future<List<LumeSession>> _fetchRemote(String token) async {
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

  Future<void> _writeCache(List<LumeSession> sessions) async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = sessions.map((s) => s.toJson()).toList();
    await prefs.setString(_cacheKey, jsonEncode(encoded));
    await prefs.setInt(_cacheTimeKey, DateTime.now().millisecondsSinceEpoch);
  }

  Future<List<LumeSession>?> _readCache() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_cacheKey);
    if (raw == null) return null;
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .whereType<Map<String, dynamic>>()
          .map(LumeSession.fromJson)
          .where((s) => s.key.isNotEmpty)
          .toList();
    } catch (_) {
      return null;
    }
  }
}

class SessionException implements Exception {
  SessionException(this.message);
  final String message;
  @override
  String toString() => message;
}
