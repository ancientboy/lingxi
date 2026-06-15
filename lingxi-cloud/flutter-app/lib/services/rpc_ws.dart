import 'package:lingxicloud/services/lume_websocket_service.dart';

/// Lume 唯一实时 RPC 通道
Future<Map<String, dynamic>?> rpcSendAwait(
  String method,
  Map<String, dynamic> params, {
  Duration timeout = const Duration(seconds: 12),
}) async {
  final lume = LumeWebSocketService();
  if (!lume.isConnected) return null;
  return lume.sendRequestAwait(method, params, timeout: timeout);
}

void rpcSend(String method, Map<String, dynamic> params) {
  final lume = LumeWebSocketService();
  if (!lume.isConnected) return;
  lume.sendRequest(method, params);
}

bool get rpcConnected => LumeWebSocketService().isConnected;

/// 管理 RPC：经 Lume gateway.call 代理到 OpenClaw
Future<Map<String, dynamic>?> rpcGatewayCall(
  String method,
  Map<String, dynamic> params, {
  Duration timeout = const Duration(seconds: 15),
}) async {
  final lume = LumeWebSocketService();
  if (!lume.isConnected) return null;
  return lume.sendRequestAwait('gateway.call', {
    'method': method,
    'params': params,
  }, timeout: timeout);
}

bool rpcGatewayOk(Map<String, dynamic>? res) =>
    res != null && res['ok'] == true;

Map<String, dynamic>? rpcGatewayPayload(Map<String, dynamic>? res) {
  if (!rpcGatewayOk(res)) return null;
  final p = res!['payload'];
  if (p is Map<String, dynamic>) return p;
  if (p is Map) return Map<String, dynamic>.from(p);
  return null;
}

String? rpcGatewayError(Map<String, dynamic>? res) {
  if (res == null) return '未连接服务器';
  if (res['ok'] == true) return null;
  final err = res['error'];
  if (err is Map) return err['message']?.toString() ?? err.toString();
  return err?.toString() ?? '请求失败';
}

Future<Map<String, dynamic>?> rpcPluginCall(
  String method,
  Map<String, dynamic> params, {
  Duration timeout = const Duration(seconds: 15),
}) async {
  final lume = LumeWebSocketService();
  if (!lume.isConnected) return null;
  return lume.sendRequestAwait(method, params, timeout: timeout);
}

void rpcSendChat(String message, {String? sessionKey}) {
  final lume = LumeWebSocketService();
  if (!lume.isConnected) return;
  lume.sendMessage(message, sessionKey: sessionKey, agentId: 'lingxi');
}
