import 'package:lingxicloud/services/lume_websocket_service.dart';
import 'package:lingxicloud/services/websocket_service.dart';

/// Gateway WebSocket 优先；Lume 仅作为可选降级
Future<Map<String, dynamic>?> rpcSendAwait(
  String method,
  Map<String, dynamic> params, {
  Duration timeout = const Duration(seconds: 12),
}) async {
  final gw = WebSocketService();
  if (gw.isConnected) {
    return gw.sendRequestAwait(method, params, timeout: timeout);
  }
  final lume = LumeWebSocketService();
  if (lume.isConnected) {
    return lume.sendRequestAwait(method, params, timeout: timeout);
  }
  return null;
}

void rpcSend(String method, Map<String, dynamic> params) {
  final gw = WebSocketService();
  if (gw.isConnected) {
    gw.sendRequest(method, params);
    return;
  }
  final lume = LumeWebSocketService();
  if (lume.isConnected) {
    lume.sendRequest(method, params);
  }
}

bool get rpcConnected =>
    LumeWebSocketService().isConnected || WebSocketService().isConnected;

/// 发聊天指令（Cron 等），Gateway 优先
void rpcSendChat(String message, {String? sessionKey}) {
  final gw = WebSocketService();
  if (gw.isConnected) {
    gw.sendRequest('chat.send', {
      'sessionKey': sessionKey ?? 'agent:main:main',
      'message': message,
    });
    return;
  }
  final lume = LumeWebSocketService();
  if (lume.isConnected) {
    lume.sendMessage(message, sessionKey: sessionKey, agentId: 'lingxi');
  }
}
