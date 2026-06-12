import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/services/api_service.dart';

typedef LumeMessageCallback = void Function(Map<String, dynamic> data);

/// Lume OpenClaw 插件 WebSocket（18790），与 Gateway 并存，仅用于测试/可选发消息。
class LumeWebSocketService {
  static final LumeWebSocketService _instance = LumeWebSocketService._internal();
  factory LumeWebSocketService() => _instance;
  LumeWebSocketService._internal();

  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  final List<LumeMessageCallback> _listeners = [];
  bool _isConnecting = false;
  bool _isConnected = false;
  String? _wsUrl;
  String? _secret;
  String? _userId;
  String? _sessionPrefix;
  bool _authHandledByProxy = false;
  int _requestId = 1;
  final Map<String, Completer<Map<String, dynamic>?>> _pendingResponses = {};
  Timer? _reconnectTimer;
  Timer? _heartbeatTimer;
  final int _maxReconnectAttempts = 6;
  int _reconnectAttempts = 0;
  String _lastError = '';
  bool _lumeAvailable = true;
  String? _fallbackMessage;

  Future<void> connect() async {
    if (_isConnected || _isConnecting) return;

    _subscription?.cancel();
    _channel?.sink.close();
    _channel = null;
    _subscription = null;
    _isConnecting = true;
    _notify({'type': 'status', 'status': 'connecting'});

    // 🔥 直连 Lume 插件（不再依赖 connect-info 探测）
    String wsUrl;
    String secret;
    _lumeAvailable = true;
    _fallbackMessage = null;

    // 先尝试通过 connect-info 获取（支持多服务器）
    String? fetchedUrl;
    String? fetchedSecret;
    try {
      final prefs = await SharedPreferences.getInstance();
      final jwt = prefs.getString(Constants.storageAccessToken);
      if (jwt != null && jwt.isNotEmpty) {
        ApiService().setAuthToken(jwt);
        debugPrint('🔵 [Lume] 尝试 /api/lume/connect-info...');
        final resp = await ApiService().get('/api/lume/connect-info');
        final data = resp.data;
        debugPrint('🔵 [Lume] connect-info: ${data?.toString().substring(0, 200)}');
        if (data is Map && data['success'] == true && data['data'] is Map) {
          final info = data['data'] as Map;
          final mode = info['mode']?.toString() ?? '';
          _userId = info['userId']?.toString() ?? _userId;
          if (mode == 'lume' && info['wsUrl'] != null) {
            fetchedUrl = info['wsUrl'].toString();
            fetchedSecret = info['secret']?.toString();
            debugPrint('🔵 [Lume] 从 connect-info 获取: $fetchedUrl');
          } else if (mode == 'free') {
            _lumeAvailable = false;
            _isConnecting = false;
            _notify({'type': 'status', 'status': 'unavailable', 'message': '免费用户'});
            return;
          } else if (mode == 'gateway' || info['lumeAvailable'] == false) {
            _lumeAvailable = false;
            _isConnecting = false;
            _notify({
              'type': 'status',
              'status': 'gateway_fallback',
              'message': info['message']?.toString() ?? 'Lume 插件不可用',
            });
            return;
          }
        }
      }
    } catch (e) {
      debugPrint('⚠️ [Lume] connect-info 失败，使用硬编码地址: $e');
    }

    // Fallback: 硬编码 Lume 地址
    wsUrl = fetchedUrl ?? 'wss://lumeword.cn/api/lume-ws';
    secret = fetchedSecret ?? Constants.lumeWsSecret;
    _authHandledByProxy = false;

    debugPrint('🔵 [Lume] 最终连接地址: $wsUrl, authHandled: $_authHandledByProxy');

    if (_userId == null) {
      final token = (await SharedPreferences.getInstance()).getString(Constants.storageAccessToken);
      if (token == null || token.isEmpty) {
        _isConnecting = false;
        _notify({'type': 'error', 'error': '请先登录'});
        return;
      }
      try {
        final parts = token.split('.');
        if (parts.length == 3) {
          final payload = json.decode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1])))) as Map;
          _userId = payload['userId']?.toString() ?? payload['id']?.toString();
        }
      } catch (_) {}
      _userId ??= 'unknown-user';
    }

    _wsUrl = wsUrl;
    _secret = secret;
    debugPrint('🔌 [Lume] 连接 $wsUrl userId=$_userId');

    try {
      _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
    } catch (e) {
      _isConnecting = false;
      _notify({'type': 'error', 'error': 'Lume 连接失败: $e'});
      _scheduleReconnect();
      return;
    }

    _subscription = _channel!.stream.listen(
      (message) {
        try {
          final text = message is String ? message : utf8.decode(message as List<int>);
          final data = json.decode(text) as Map<String, dynamic>;
          _handleMessage(data);
        } catch (e) {
          debugPrint('❌ [Lume] 解析失败: $e');
        }
      },
      onError: (e) {
        _isConnected = false;
        _isConnecting = false;
        _notify({'type': 'error', 'error': e.toString()});
        _scheduleReconnect();
      },
      onDone: () {
        final was = _isConnected;
        _isConnected = false;
        _isConnecting = false;
        _notify({'type': 'status', 'status': 'disconnected'});
        if (was) _scheduleReconnect();
      },
    );

    await Future.delayed(const Duration(milliseconds: 600));
    if (!_authHandledByProxy) {
      _sendAuth();
    }
  }

  void _sendAuth() {
    if (_channel == null) return;
    _channel!.sink.add(json.encode({
      'id': 'auth-${DateTime.now().millisecondsSinceEpoch}',
      'method': 'auth',
      'params': {'token': _secret, 'userId': _userId},
    }));
  }

  void _handleMessage(Map<String, dynamic> data) {
    if (data['type'] == 'res' && data['ok'] == false && !_isConnected) {
      _isConnecting = false;
      _lastError = data['error']?['message']?.toString() ?? 'auth failed';
      debugPrint('❌ [Lume] auth 失败: $_lastError');
      _scheduleReconnect();
      return;
    }
    if (data['type'] == 'res' && data['ok'] == true) {
      final payload = data['payload'];
      if (payload is Map && payload['userId'] != null && !_isConnected) {
        _isConnected = true;
        _isConnecting = false;
        _reconnectAttempts = 0;
        _userId = payload['userId']?.toString() ?? _userId;
        _sessionPrefix = payload['sessionPrefix']?.toString() ?? _sessionPrefix;
        debugPrint('✅ [Lume] auth 成功');
        _notify({'type': 'connected'});
        _startHeartbeat();
        return;
      }
      if (data['payload']?['pong'] == true) return;
    }
    if (data['type'] == 'event' && data['event'] == 'chat') {
      _notify(data);
      return;
    }
    if (data['type'] == 'res' || data['type'] == 'event' || data['type'] == 'error') {
      _notify(data);
      return;
    }
    _notify(data);
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_isConnected && _channel != null) {
        _channel!.sink.add(json.encode({'method': 'ping'}));
      }
    });
  }

  void _scheduleReconnect() {
    if (_reconnectAttempts >= _maxReconnectAttempts) {
      _isConnecting = false;
      _notify({
        'type': 'status',
        'status': 'gateway_fallback',
        'message': 'Lume 重连失败，降级 Gateway',
      });
      return;
    }
    _reconnectAttempts++;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(Duration(seconds: _reconnectAttempts * 3), connect);
  }


  void sendRequest(String method, Map<String, dynamic> params) {
    if (!_isConnected || _channel == null) {
      debugPrint('[Lume] 未连接，无法发送请求: $method');
      return;
    }
    final reqId = '${method.replaceAll('.', '_')}_${DateTime.now().millisecondsSinceEpoch}';
    _channel!.sink.add(json.encode({
      'id': reqId,
      'method': method,
      'params': params,
    }));
    debugPrint('[Lume] 发送请求: $method');
  }

  /// 发送 RPC 并等待 res（用于删除/重命名等需要结果反馈的操作）
  Future<Map<String, dynamic>?> sendRequestAwait(
    String method,
    Map<String, dynamic> params, {
    Duration timeout = const Duration(seconds: 12),
  }) async {
    if (!_isConnected || _channel == null) return null;
    final reqId = '${method.replaceAll('.', '_')}_${DateTime.now().millisecondsSinceEpoch}';
    final completer = Completer<Map<String, dynamic>?>();
    _pendingResponses[reqId] = completer;
    _channel!.sink.add(json.encode({
      'id': reqId,
      'method': method,
      'params': params,
    }));
    try {
      return await completer.future.timeout(timeout, onTimeout: () {
        _pendingResponses.remove(reqId);
        return null;
      });
    } catch (_) {
      _pendingResponses.remove(reqId);
      return null;
    }
  }

  void sendMessage(
    String content, {
    String? agentId,
    String? sessionKey,
    List<Map<String, dynamic>>? attachments,
  }) {
    if (!_isConnected || _channel == null) return;
    final params = <String, dynamic>{'message': content, 'agentId': agentId ?? 'main'};
    if (sessionKey != null && sessionKey.isNotEmpty) params['sessionKey'] = sessionKey;
    if (attachments != null && attachments.isNotEmpty) params['attachments'] = attachments;
    _channel!.sink.add(json.encode({
      'id': 'chat-${DateTime.now().millisecondsSinceEpoch}',
      'method': 'chat.send',
      'params': params,
    }));
  }

  /// 切换设备后重新探测并连接
  Future<void> reconnectForDevice() async {
    disconnect();
    _wsUrl = null;
    _secret = null;
    _authHandledByProxy = false;
    _sessionPrefix = null;
    _reconnectAttempts = 0;
    await connect();
  }

  void disconnect() {
    for (final c in _pendingResponses.values) {
      if (!c.isCompleted) c.complete(null);
    }
    _pendingResponses.clear();
    _reconnectTimer?.cancel();
    _heartbeatTimer?.cancel();
    _subscription?.cancel();
    _channel?.sink.close();
    _channel = null;
    _isConnected = false;
    _isConnecting = false;
  }

  void addListener(LumeMessageCallback cb) => _listeners.add(cb);
  void removeListener(LumeMessageCallback cb) => _listeners.remove(cb);
  void clearListeners() => _listeners.clear();

  void _notify(Map<String, dynamic> data) {
    for (final l in _listeners) {
      l(data);
    }
  }

  bool get isConnected => _isConnected;
  bool get lumeAvailable => _lumeAvailable;
  String? get fallbackMessage => _fallbackMessage;
  bool get isConnecting => _isConnecting;
  String? get sessionPrefix => _sessionPrefix;
  String get channelMode => 'lume';

  Map<String, dynamic> getDebugInfo() => {
    'wsUrl': _wsUrl ?? '未连接',
    'userId': _userId ?? '未知',
    'sessionPrefix': _sessionPrefix ?? '未知',
    'isConnected': _isConnected,
    'isConnecting': _isConnecting,
    'lastError': _lastError.isEmpty ? null : _lastError,
  };
}
