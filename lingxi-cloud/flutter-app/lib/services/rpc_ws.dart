import 'package:lingxicloud/services/lume_websocket_service.dart';
import 'package:lingxicloud/services/websocket_service.dart';

/// Lume 主通道；仅 Lume 不可用时走 Gateway 降级
Future<Map<String, dynamic>?> rpcSendAwait(
  String method,
  Map<String, dynamic> params, {
  Duration timeout = const Duration(seconds: 12),
}) async {
  final lume = LumeWebSocketService();
  if (lume.isConnected) {
    return lume.sendRequestAwait(method, params, timeout: timeout);
  }
  final gw = WebSocketService();
  if (gw.isConnected) {
    return gw.sendRequestAwait(method, params, timeout: timeout);
  }
  return null;
}

void rpcSend(String method, Map<String, dynamic> params) {
  final lume = LumeWebSocketService();
  if (lume.isConnected) {
    lume.sendRequest(method, params);
    return;
  }
  final gw = WebSocketService();
  if (gw.isConnected) {
    gw.sendRequest(method, params);
  }
}

bool get rpcConnected =>
    LumeWebSocketService().isConnected || WebSocketService().isConnected;

/// Gateway 管理 RPC：Lume 走 gateway.call 代理，Gateway 直连
Future<Map<String, dynamic>?> rpcGatewayCall(
  String method,
  Map<String, dynamic> params, {
  Duration timeout = const Duration(seconds: 15),
}) async {
  final lume = LumeWebSocketService();
  if (lume.isConnected) {
    return lume.sendRequestAwait('gateway.call', {
      'method': method,
      'params': params,
    }, timeout: timeout);
  }
  final gw = WebSocketService();
  if (gw.isConnected) {
    return gw.sendRequestAwait(method, params, timeout: timeout);
  }
  return null;
}

bool rpcGatewayOk(Map<String, dynamic>? res) =>
    res != null && res['ok'] == true;

/// Gateway RPC 响应 payload
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

/// 发聊天指令（降级用），Lume 优先
/// Lume 插件原生管理 RPC（skills / workflow / native.*）
Future<Map<String, dynamic>?> rpcPluginCall(
  String method,
  Map<String, dynamic> params, {
  Duration timeout = const Duration(seconds: 15),
}) async {
  final lume = LumeWebSocketService();
  if (lume.isConnected) {
    return lume.sendRequestAwait(method, params, timeout: timeout);
  }
  return null;
}

void rpcSendChat(String message, {String? sessionKey}) {
  final lume = LumeWebSocketService();
  if (lume.isConnected) {
    lume.sendMessage(message, sessionKey: sessionKey, agentId: 'lingxi');
    return;
  }
  final gw = WebSocketService();
  if (gw.isConnected) {
    gw.sendRequest('chat.send', {
      'sessionKey': sessionKey ?? 'agent:main:main',
      'message': message,
    });
  }
}
