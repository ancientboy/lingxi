import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../models/openclaw_bootstrap.dart';

class OpenClawBootstrapException implements Exception {
  OpenClawBootstrapException(this.message);
  final String message;
  @override
  String toString() => message;
}

class OpenClawBootstrapService {
  Future<OpenClawBootstrap> fetch(String token) async {
    final response = await http.get(
      Uri.parse(AppConfig.openclawBootstrapApi),
      headers: {'Authorization': 'Bearer $token'},
    );

    Map<String, dynamic> body;
    try {
      body = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      if (response.statusCode == 404) {
        throw OpenClawBootstrapException(
          '服务端尚未更新，请稍后重试或联系管理员',
        );
      }
      throw OpenClawBootstrapException('引导配置响应异常');
    }

    if (response.statusCode != 200 || body['success'] != true) {
      throw OpenClawBootstrapException(
        body['error']?.toString() ?? '获取本机 OpenClaw 配置失败',
      );
    }

    return OpenClawBootstrap.fromJson(body);
  }

  Future<void> markComplete({
    required String token,
    required String gatewayToken,
    required String sessionId,
  }) async {
    final response = await http.post(
      Uri.parse(AppConfig.openclawBootstrapCompleteApi),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'gatewayToken': gatewayToken,
        'sessionId': sessionId,
      }),
    );

    if (response.statusCode != 200) {
      try {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        throw OpenClawBootstrapException(
          body['error']?.toString() ?? '登记本机安装状态失败',
        );
      } catch (_) {
        throw OpenClawBootstrapException('登记本机安装状态失败');
      }
    }
  }
}
