import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class SubscriptionInfo {
  const SubscriptionInfo({
    required this.plan,
    required this.status,
    this.expiresAt,
    this.serverOnline = false,
    this.hasServer = false,
  });

  final String plan;
  final String status;
  final String? expiresAt;
  final bool serverOnline;
  final bool hasServer;

  factory SubscriptionInfo.fromJson(Map<String, dynamic> json) {
    // GET /api/subscription/status 格式
    if (json.containsKey('subscribed') || json.containsKey('hasServer')) {
      final subscribed = json['subscribed'] == true;
      final plan = (json['plan'] ?? 'free').toString();
      final hasServer = json['hasServer'] == true;
      final serverStatus = json['serverStatus']?.toString();
      final online = serverStatus == 'running';

      return SubscriptionInfo(
        plan: subscribed && plan != 'free' ? plan : 'free',
        status: subscribed ? 'active' : 'inactive',
        serverOnline: online,
        hasServer: hasServer,
      );
    }

    // 旧格式兼容
    final sub = json['subscription'] as Map<String, dynamic>? ?? json;
    final server = json['server'] as Map<String, dynamic>?;
    final serverStatus = server?['status'] ?? server?['state'];
    final online = server?['online'] == true ||
        serverStatus == 'running' ||
        serverStatus == 'active';

    return SubscriptionInfo(
      plan: (sub['plan'] ?? 'free').toString(),
      status: (sub['status'] ?? 'active').toString(),
      expiresAt: sub['expiresAt']?.toString(),
      serverOnline: online,
      hasServer: server != null,
    );
  }

  String get planLabel {
    switch (plan) {
      case 'pro':
        return 'Pro';
      case 'team':
        return 'Team';
      case 'enterprise':
        return 'Enterprise';
      default:
        return 'Free';
    }
  }
}

class SubscriptionService {
  Future<SubscriptionInfo?> fetchStatus(String token) async {
    final uri = Uri.parse('${AppConfig.apiOrigin}/api/subscription/status');
    final response = await http.get(
      uri,
      headers: {'Authorization': 'Bearer $token'},
    );
    if (response.statusCode != 200) return null;

    try {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (body['success'] != true) return null;
      final data = body['data'] as Map<String, dynamic>? ?? body;
      return SubscriptionInfo.fromJson(data);
    } catch (_) {
      return null;
    }
  }
}
