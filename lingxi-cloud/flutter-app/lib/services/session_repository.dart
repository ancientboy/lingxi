import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:lingxicloud/services/rpc_ws.dart';
import 'package:lingxicloud/services/device_switch_manager.dart';
import 'package:lingxicloud/utils/constants.dart';

class SessionRepository {
  /// WS 拉取 sessions.list（带 epoch 校验）
  static Future<List<Map<String, dynamic>>?> fetchSessionsWs({
    required int epoch,
    int limit = 100,
  }) async {
    if (!DeviceSwitchManager.instance.isEpochValid(epoch)) return null;
    if (!rpcConnected) return null;

    debugPrint('📋 SessionRepository.fetchSessionsWs epoch=$epoch');
    final res = await rpcSendAwait('sessions.list', {
      'includeLastMessage': true,
      'includeDerivedTitles': true,
      'limit': limit,
    }, timeout: const Duration(seconds: 15));

    if (!DeviceSwitchManager.instance.isEpochValid(epoch)) {
      debugPrint('⏭️ 丢弃过期 sessions.list (epoch=$epoch)');
      return null;
    }

    if (res != null && res['ok'] == true && res['payload']?['sessions'] is List) {
      return (res['payload']['sessions'] as List)
          .map((s) => Map<String, dynamic>.from(s as Map))
          .toList();
    }
    return null;
  }

  /// HTTP 备份（Phase 4 — WS 不可用时）
  static Future<List<Map<String, dynamic>>?> fetchSessionsHttp({
    required int epoch,
    int limit = 100,
  }) async {
    if (!DeviceSwitchManager.instance.isEpochValid(epoch)) return null;
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(Constants.storageAccessToken);
      if (token == null || token.isEmpty) return null;
      ApiService().setAuthToken(token);
      final resp = await ApiService().get(
        '/api/lume/sessions',
        queryParameters: {'limit': limit},
      );
      if (!DeviceSwitchManager.instance.isEpochValid(epoch)) return null;
      final data = resp.data;
      if (data is Map && data['success'] == true && data['sessions'] is List) {
        return (data['sessions'] as List)
            .map((s) => Map<String, dynamic>.from(s as Map))
            .toList();
      }
    } catch (e) {
      debugPrint('SessionRepository.fetchSessionsHttp: $e');
    }
    return null;
  }

  /// WS 优先，失败走 HTTP
  static Future<List<Map<String, dynamic>>?> fetchSessions({
    required int epoch,
    int limit = 100,
  }) async {
    var list = await fetchSessionsWs(epoch: epoch, limit: limit);
    list ??= await fetchSessionsHttp(epoch: epoch, limit: limit);
    return list;
  }

  static Future<String> currentServerId() =>
      DeviceSwitchManager.instance.resolveServerId();
}
