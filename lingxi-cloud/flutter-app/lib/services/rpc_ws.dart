import 'package:lingxicloud/services/lume_websocket_service.dart';
import 'package:lingxicloud/services/websocket_service.dart';

/// Lume 优先；均不可用返回 null
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

/// 发聊天指令（Cron 等），Lume 优先
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
