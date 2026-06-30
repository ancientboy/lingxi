import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:flutter/foundation.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

typedef WebSocketMessageCallback = void Function(Map<String, dynamic> data);

/// 连接状态枚举
enum ConnState {
  disconnected,
  connecting,
  connected,
  reconnecting,
}

class WebSocketService {
  static final WebSocketService _instance = WebSocketService._internal();
  factory WebSocketService() => _instance;
  WebSocketService._internal();

  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  final List<WebSocketMessageCallback> _listeners = [];
  bool _isConnecting = false;
  bool _isConnected = false;
  String? _wsUrl;
  String? _token;
  String? _gatewayToken;
  String? _session;
  String? _sessionPrefix;
  int _requestId = 1;
  final Map<String, Completer<Map<String, dynamic>?>> _pendingResponses = {};

  // ── 连接状态机 ──
  ConnState _connState = ConnState.disconnected;
  ConnState get connState => _connState;

  void _setConnState(ConnState newState) {
    final prev = _connState;
    _connState = newState;
    if (prev != newState) {
      debugPrint('[WS] connState: ${prev.name} -> ${newState.name}');
      _notifyListeners({
        'type': 'event',
        'event': 'conn.state',
        'payload': {'state': newState.name, 'prev': prev.name},
      });
    }
  }

  // ── 心跳 watchdog ──
  static const Duration _heartbeatInterval = Duration(seconds: 25);
  static const Duration _heartbeatWatchdogTimeout = Duration(seconds: 35);
  Timer? _heartbeatTimer;
  Timer? _heartbeatWatchdog;
  DateTime? _lastMessageTime;

  void _startHeartbeat() {
    _stopHeartbeat();
    _lastMessageTime = DateTime.now();

    _heartbeatTimer = Timer.periodic(_heartbeatInterval, (_) {
      if (_channel != null && _isConnected) {
        try {
          _channel!.sink.add(json.encode({'type': 'ping'}));
          debugPrint('[WS] heartbeat ping sent');
        } catch (e) {
          debugPrint('[WS] heartbeat ping error: $e');
        }
      }
    });

    _resetHeartbeatWatchdog();
  }

  void _resetHeartbeatWatchdog() {
    _heartbeatWatchdog?.cancel();
    _heartbeatWatchdog = Timer(_heartbeatWatchdogTimeout, () {
      if (_isConnected) {
        debugPrint('[WS] heartbeat watchdog timeout, forcing reconnect');
        _forceReconnect();
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    _heartbeatWatchdog?.cancel();
    _heartbeatWatchdog = null;
  }

  void _onMessageReceived() {
    _lastMessageTime = DateTime.now();
    if (_isConnected) {
      _resetHeartbeatWatchdog();
    }
  }

  // ── 指数退避重连 ──
  static const int _maxReconnectAttempts = 20;
  static const Duration _reconnectBaseDelay = Duration(seconds: 1);
  static const Duration _reconnectMaxDelay = Duration(seconds: 30);
  static const double _reconnectFactor = 2.0;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  bool _reconnectEnabled = false;

  Duration _computeReconnectDelay() {
    final exponential = (_reconnectBaseDelay.inSeconds *
        math.pow(_reconnectFactor, _reconnectAttempts)).toInt();
    final clamped = exponential.clamp(
      _reconnectBaseDelay.inSeconds,
      _reconnectMaxDelay.inSeconds,
    );
    // jitter ±500ms
    final jitter = (DateTime.now().millisecondsSinceEpoch % 1000) - 500;
    return Duration(milliseconds: clamped * 1000 + jitter);
  }

  void _scheduleReconnect() {
    if (!_reconnectEnabled) return;
    _reconnectTimer?.cancel();

    if (_reconnectAttempts >= _maxReconnectAttempts) {
      debugPrint('[WS] max reconnect attempts reached ($_maxReconnectAttempts)');
      _notifyListeners({
        'type': 'error',
        'error': '连接失败，请检查网络后手动重试',
        'maxRetriesReached': true,
      });
      return;
    }

    final delay = _computeReconnectDelay();
    _reconnectAttempts++;
    _setConnState(ConnState.reconnecting);
    debugPrint('[WS] reconnect in ${delay.inSeconds}s (attempt=$_reconnectAttempts)');

    _reconnectTimer = Timer(delay, () {
      connect();
    });
  }

  void _forceReconnect() {
    _stopHeartbeat();
    _subscription?.cancel();
    try {
      _channel?.sink.close();
    } catch (_) {}
    _channel = null;
    _isConnected = false;
    _isConnecting = false;
    _failAllPending('connection reset');
    _scheduleReconnect();
  }

  // ── 离线请求队列 ──
  final List<_QueuedRequest> _offlineQueue = [];
  static const int _maxQueueSize = 50;

  void _enqueueOffline(String method, Map<String, dynamic> params,
      {Duration? timeout}) {
    if (_offlineQueue.length >= _maxQueueSize) {
      _offlineQueue.removeAt(0);
    }
    _offlineQueue.add(_QueuedRequest(method, params, timeout: timeout));
    debugPrint('[WS] queued offline request: $method (queue=${_offlineQueue.length})');
  }

  void _flushOfflineQueue() {
    if (!_isConnected || _offlineQueue.isEmpty) return;
    final queue = List<_QueuedRequest>.from(_offlineQueue);
    _offlineQueue.clear();
    for (final req in queue) {
      sendRequest(req.method, req.params);
    }
    debugPrint('[WS] flushed ${queue.length} queued requests');
  }

  // ── Pending 请求失败处理 ──
  void _failAllPending(String reason) {
    final keys = _pendingResponses.keys.toList();
    for (final id in keys) {
      final c = _pendingResponses.remove(id);
      if (c != null && !c.isCompleted) {
        c.completeError(reason);
      }
    }
  }

  // 辅助方法：安全地将任意类型转换为字符串
  String _toString(dynamic value) {
    if (value == null) return '';
    if (value is String) return value;
    if (value is num) return value.toString();
    if (value is bool) return value.toString();
    return value.toString();
  }

  Function? _onInitError;
  void _notifyInitError(Object error) {
    try {
      _onInitError?.call(error);
    } catch (_) {}
  }

  void setOnInitError(Function callback) {
    _onInitError = callback;
  }

  // 连接到 WebSocket
  Future<void> connect() async {
    try {
      if (_isConnected || _isConnecting) {
        debugPrint('[WS] already connected/connecting, skip');
        return;
      }

      // 清理旧连接
      _subscription?.cancel();
      try {
        _channel?.sink.close();
      } catch (_) {}
      _channel = null;
      _subscription = null;

      _isConnecting = true;
      _setConnState(ConnState.connecting);
      _notifyListeners({'type': 'status', 'status': 'connecting'});

      // 确保 ApiService 有 token
      final apiService = ApiService();
      if (apiService.getAuthToken() == null) {
        debugPrint('[WS] no token in ApiService, trying local');
        final prefs = await SharedPreferences.getInstance();
        final token = prefs.getString('lingxi_token');
        if (token != null && token.isNotEmpty) {
          apiService.setAuthToken(token);
        } else {
          debugPrint('[WS] no token locally either');
          _notifyInitError('请先登录');
          _isConnecting = false;
          _setConnState(ConnState.disconnected);
          _notifyListeners({'type': 'error', 'error': '请先登录'});
          return;
        }
      }

      // 从 API 获取 Gateway 连接信息
      if (_wsUrl != null && _token != null && _gatewayToken != null) {
        debugPrint('[WS] using cached Gateway info');
      } else {
        debugPrint('[WS] fetching Gateway connect-info...');
        final response = await apiService.get('/api/gateway/connect-info');
        final data = response.data;

        debugPrint('[WS] Gateway response: $data (statusCode=${response.statusCode})');

        final mode = data?['mode'];
        if (mode == 'free' || (data != null && data['wsUrl'] == null)) {
          debugPrint('[WS] free chat mode (no device)');
          _isConnecting = false;
          _isConnected = false;
          _setConnState(ConnState.disconnected);
          _notifyListeners({
            'type': 'status',
            'status': 'free_mode',
            'message': data?['message'] ?? '免费聊天模式',
          });
          return;
        }

        if (response.statusCode == 403) {
          _isConnecting = false;
          _setConnState(ConnState.disconnected);
          _notifyListeners({
            'type': 'status',
            'status': 'free_mode',
            'message': data?['message'] ?? '请添加设备',
          });
          return;
        }

        if (data != null && data['wsUrl'] != null) {
          _wsUrl = data['wsUrl'];
          _token = data['token'];
          _gatewayToken = data['gatewayToken'];
          _session = data['session'];
          _sessionPrefix = data['sessionPrefix'];
        } else {
          _isConnecting = false;
          _setConnState(ConnState.disconnected);
          final errorText = '获取连接信息失败: ${data?['error'] ?? '未知错误'}';
          _notifyInitError(errorText);
          _notifyListeners({
            'type': 'error',
            'error': errorText,
          });
          return;
        }
      }

      final wsUrl = '$_wsUrl?token=${Uri.encodeComponent(_token!)}';
      debugPrint('[WS] connecting to: $wsUrl');

      try {
        _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
      } catch (e) {
        debugPrint('[WS] connect failed: $e');
        _isConnecting = false;
        _setConnState(ConnState.disconnected);
        _notifyListeners({'type': 'error', 'error': '连接失败: $e'});
        _scheduleReconnect();
        return;
      }

      _subscription = _channel!.stream.listen(
        (dynamic message) async {
          try {
            _messagesReceived++;
            _onMessageReceived();
            String text;
            if (message is String) {
              text = message;
            } else if (message is List<int>) {
              text = utf8.decode(message);
            } else if (message is Uint8List) {
              text = utf8.decode(message);
            } else {
              debugPrint('[WS] unknown message type: ${message.runtimeType}');
              _lastError = '未知消息类型: ${message.runtimeType}';
              return;
            }
            final preview = text.length > 300 ? '${text.substring(0, 300)}...' : text;
            debugPrint('[WS] recv (#$_messagesReceived): $preview');
            final data = json.decode(text) as Map<String, dynamic>;
            _handleMessage(data);
          } catch (e, stack) {
            debugPrint('[WS] parse error: $e\n$stack');
            _lastError = '解析消息失败: $e';
          }
        },
        onError: (error) {
          debugPrint('[WS] stream error: $error');
          _lastError = error.toString();
          _isConnecting = false;
          _isConnected = false;
          _stopHeartbeat();
          _setConnState(ConnState.disconnected);
          _notifyListeners({'type': 'error', 'error': error.toString()});
          _scheduleReconnect();
        },
        onDone: () {
          debugPrint('[WS] closed after $_messagesReceived msgs');
          _lastError = '连接已关闭';
          final wasConnected = _isConnected;
          _isConnecting = false;
          _isConnected = false;
          _stopHeartbeat();
          _failAllPending('connection closed');
          _setConnState(ConnState.disconnected);
          _notifyListeners({'type': 'status', 'status': 'disconnected'});
          if (wasConnected && _reconnectEnabled) {
            _scheduleReconnect();
          }
        },
      );

      debugPrint('[WS] stream subscribed, waiting 750ms before connect msg');
      await Future.delayed(const Duration(milliseconds: 750));
      _sendConnect();
    } catch (e) {
      debugPrint('[WS] connect error: $e');
      _isConnecting = false;
      _setConnState(ConnState.disconnected);
      _notifyInitError(e);
      _notifyListeners({'type': 'error', 'error': e.toString()});
      _scheduleReconnect();
    }
  }

  void _sendConnect() {
    if (_channel == null) return;

    final params = {
      'minProtocol': 3,
      'maxProtocol': 99,
      'client': {
        'id': 'openclaw-control-ui',
        'version': '1.0.0',
        'platform': 'web',
        'mode': 'webchat',
      },
      'role': 'operator',
      'scopes': ['operator.admin', 'operator.read', 'operator.write'],
      'auth': {'token': _gatewayToken},
      'locale': 'zh-CN',
      'userAgent': 'LingxiCloud-Flutter/1.0.0 (Android)',
    };

    final connectMsg = {
      'type': 'req',
      'id': 'req_${_requestId++}',
      'method': 'connect',
      'params': params,
    };

    _channel!.sink.add(json.encode(connectMsg));
  }

  void _handleMessage(Map<String, dynamic> data) {
    final msgType = _toString(data['type']);
    final msgEvent = _toString(data['event']);
    final payloadType = data['payload'] is Map ? _toString(data['payload']?['type']) : '';

    // pong
    if (msgType == 'pong' || (msgType == 'event' && msgEvent == 'pong')) {
      _onMessageReceived();
      return;
    }

    // 检测 hello-ok 认证成功
    final isHelloOk = (msgType == 'res' && data['ok'] == true && payloadType == 'hello-ok') ||
        (msgType == 'event' && msgEvent == 'hello-ok') ||
        (msgType == 'res' && data['ok'] == true && data['payload']?['hello'] != null);

    if (isHelloOk) {
      _isConnected = true;
      _isConnecting = false;
      _reconnectAttempts = 0;
      _reconnectEnabled = true;
      _setConnState(ConnState.connected);
      _notifyListeners({'type': 'connected'});
      _startHeartbeat();
      _flushOfflineQueue();
      return;
    }

    if (msgType == 'res') {
      final id = data['id']?.toString();
      if (id != null && id.isNotEmpty) {
        final c = _pendingResponses.remove(id);
        if (c != null && !c.isCompleted) {
          c.complete(data);
          return;
        }
      }
    }

    _notifyListeners(data);
  }

  void disconnect() {
    _reconnectEnabled = false;
    _reconnectTimer?.cancel();
    _stopHeartbeat();
    _subscription?.cancel();
    try {
      _channel?.sink.close();
    } catch (_) {}
    _channel = null;
    _isConnected = false;
    _isConnecting = false;
    _failAllPending('disconnected');
    _offlineQueue.clear();
    _setConnState(ConnState.disconnected);
  }

  void sendMessage(String content, {String? agentId, String? sessionKey}) {
    if (!_isConnected || _channel == null) {
      debugPrint('[WS] not connected, queueing message');
      final agent = agentId ?? 'main';
      final targetSessionKey = (sessionKey != null && sessionKey.isNotEmpty)
          ? sessionKey
          : '${_sessionPrefix ?? ""}:agent:$agent';
      _enqueueOffline('chat.send', {
        'sessionKey': targetSessionKey,
        'message': content,
        'idempotencyKey': 'msg_${DateTime.now().millisecondsSinceEpoch}',
        'deliver': false,
      });
      return;
    }

    final agent = agentId ?? 'main';
    final targetSessionKey = (sessionKey != null && sessionKey.isNotEmpty)
        ? sessionKey
        : '${_sessionPrefix ?? ""}:agent:$agent';

    final message = {
      'type': 'req',
      'id': 'req_${_requestId++}',
      'method': 'chat.send',
      'params': {
        'sessionKey': targetSessionKey,
        'message': content,
        'idempotencyKey': 'msg_${DateTime.now().millisecondsSinceEpoch}',
        'deliver': false,
      },
    };

    _channel!.sink.add(json.encode(message));
  }

  void sendRequest(String method, Map<String, dynamic> params) {
    if (!_isConnected || _channel == null) {
      debugPrint('[WS] not connected, queueing: $method');
      _enqueueOffline(method, params);
      return;
    }

    final request = {
      'type': 'req',
      'id': '${method.replaceAll('.', '_')}_${DateTime.now().millisecondsSinceEpoch}',
      'method': method,
      'params': params,
    };

    _channel!.sink.add(json.encode(request));
  }

  Future<Map<String, dynamic>?> sendRequestAwait(
    String method,
    Map<String, dynamic> params, {
    Duration timeout = const Duration(seconds: 12),
  }) async {
    if (!_isConnected || _channel == null) {
      // 离线排队 + 等待重连后 flush
      debugPrint('[WS] sendRequestAwait offline, queueing: $method');
      _enqueueOffline(method, params, timeout: timeout);
      return null;
    }
    final reqId = '${method.replaceAll('.', '_')}_${DateTime.now().millisecondsSinceEpoch}';
    final completer = Completer<Map<String, dynamic>?>();
    _pendingResponses[reqId] = completer;
    _channel!.sink.add(json.encode({
      'type': 'req',
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

  void addListener(WebSocketMessageCallback listener) {
    _listeners.add(listener);
  }

  void removeListener(WebSocketMessageCallback listener) {
    _listeners.remove(listener);
  }

  void _notifyListeners(Map<String, dynamic> data) {
    for (final listener in _listeners) {
      try {
        listener(data);
      } catch (e) {
        debugPrint('[WS] listener error: $e');
      }
    }
  }

  bool get isConnected => _isConnected;
  bool get isConnecting => _isConnecting;
  String? get sessionPrefix => _sessionPrefix;

  Map<String, dynamic> getDebugInfo() {
    return {
      'wsUrl': _wsUrl ?? '未获取',
      'session': _session ?? '未获取',
      'sessionPrefix': _sessionPrefix ?? '未获取',
      'hasToken': _token != null && _token!.isNotEmpty,
      'hasGatewayToken': _gatewayToken != null && _gatewayToken!.isNotEmpty,
      'isConnected': _isConnected,
      'isConnecting': _isConnecting,
      'connState': _connState.name,
      'reconnectAttempts': _reconnectAttempts,
      'reconnectEnabled': _reconnectEnabled,
      'lastError': _lastError.isEmpty ? null : _lastError,
      'messagesReceived': _messagesReceived,
      'offlineQueueSize': _offlineQueue.length,
      'pendingRequests': _pendingResponses.length,
      'lastMessageTime': _lastMessageTime?.toIso8601String(),
    };
  }

  void reset() {
    disconnect();
    _reconnectAttempts = 0;
    _wsUrl = null;
    _token = null;
    _gatewayToken = null;
    _session = null;
    _sessionPrefix = null;
  }

  /// 强制重连（App 回前台时调用）
  DateTime? _lastForceReconnect;

  void forceReconnect() {
    final now = DateTime.now();
    if (_lastForceReconnect != null &&
        now.difference(_lastForceReconnect!).inSeconds < 10) {
      debugPrint('[WS] forceReconnect: skip (within 10s)');
      return;
    }
    _lastForceReconnect = now;
    debugPrint('[WS] forceReconnect: reset and reconnect');
    _reconnectTimer?.cancel();
    _stopHeartbeat();
    _subscription?.cancel();
    try {
      _channel?.sink.close();
    } catch (_) {}
    _channel = null;
    _isConnected = false;
    _isConnecting = false;
    _reconnectAttempts = 0;
    _failAllPending('force reconnect');
    _wsUrl = null;
    _token = null;
    _gatewayToken = null;
    connect();
  }

  /// 发送心跳 ping（App 回前台时验证连接是否还活着）
  void ping() {
    if (_channel != null && _isConnected) {
      _channel!.sink.add(json.encode({'type': 'ping'}));
    }
  }

  void clearListeners() {
    _listeners.clear();
  }

  void cancelReconnect() {
    _reconnectTimer?.cancel();
  }

  // 旧字段保留兼容
  String _lastError = '';
  int _messagesReceived = 0;
}

/// 离线队列项
class _QueuedRequest {
  final String method;
  final Map<String, dynamic> params;
  final Duration? timeout;

  _QueuedRequest(this.method, this.params, {this.timeout});
}
