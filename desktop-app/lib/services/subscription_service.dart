import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class SubscriptionInfo {
  const SubscriptionInfo({
    required this.plan,
    required this.status,
    this.expiresAt,
    this.serverOnline = false,
  });

  final String plan;
  final String status;
  final String? expiresAt;
  final bool serverOnline;

  factory SubscriptionInfo.fromJson(Map<String, dynamic> json) {
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
