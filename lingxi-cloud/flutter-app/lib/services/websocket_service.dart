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

/// 认证错误码（借鉴 OpenClaw 智能认证失败处理）
enum AuthErrorCode {
  tokenMissing,
  tokenInvalid,
  tokenMismatch,
  bootstrapTokenInvalid,
  passwordMissing,
  passwordMismatch,
  rateLimited,
  pairingRequired,
  deviceIdentityRequired,
  unknown,
}

/// 认证错误信息
class AuthError {
  final AuthErrorCode code;
  final String message;
  final bool pauseReconnect;
  final bool canRetryWithDeviceToken;
  final String? recommendedNextStep;

  AuthError({
    required this.code,
    required this.message,
    this.pauseReconnect = false,
    this.canRetryWithDeviceToken = false,
    this.recommendedNextStep,
  });
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

  // ── 心跳机制（改进：原生 ping + 应用层 watchdog） ──
  static const Duration _heartbeatInterval = Duration(seconds: 25);
  static const Duration _heartbeatWatchdogTimeout = Duration(seconds: 35);
  // ── 借鉴 OpenClaw: 原生 ping 间隔（当前通过应用层 ping 实现） ──
  Timer? _heartbeatTimer;
  Timer? _heartbeatWatchdog;
  DateTime? _lastMessageTime;
  DateTime? _lastTickTime; // 借鉴 OpenClaw: 追踪服务端 tick
  Timer? _tickWatchdog;    // 借鉴 OpenClaw: tick 超时检测

  void _startHeartbeat() {
    _stopHeartbeat();
    _lastMessageTime = DateTime.now();
    _lastTickTime = DateTime.now();

    // 应用层心跳（保持向后兼容）
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

    // 借鉴 OpenClaw: tick 监控（检测服务端 tick 超时）
    _startTickWatch();
    _resetHeartbeatWatchdog();
  }

  /// 借鉴 OpenClaw: 启动 tick 监控
  void _startTickWatch() {
    _tickWatchdog?.cancel();
    // 使用服务端通告的 tickIntervalMs 或默认值 30s
    final tickIntervalMs = _serverTickIntervalMs ?? 30000;
    final checkInterval = Duration(milliseconds: math.max(tickIntervalMs, 1000));
    final timeoutThreshold = tickIntervalMs * 2; // 2 倍间隔无 tick 则超时

    _tickWatchdog = Timer.periodic(checkInterval, (_) {
      if (!_isConnected || _lastTickTime == null) return;
      final elapsed = DateTime.now().difference(_lastTickTime!).inMilliseconds;
      if (elapsed >= timeoutThreshold) {
        debugPrint('[WS] tick timeout detected (${elapsed}ms > ${timeoutThreshold}ms), forcing reconnect');
        _forceReconnect();
      }
    });
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
    _tickWatchdog?.cancel();
    _tickWatchdog = null;
  }

  void _onMessageReceived() {
    _lastMessageTime = DateTime.now();
    if (_isConnected) {
      _resetHeartbeatWatchdog();
    }
  }

  // ── 服务端配置（借鉴 OpenClaw hello-ok 策略） ──
  int? _serverTickIntervalMs;

  void _handleHelloOk(Map<String, dynamic> payload) {
    // 解析服务端策略
    final policy = payload['policy'] as Map<String, dynamic>?;
    if (policy != null) {
      _serverTickIntervalMs = policy['tickIntervalMs'] as int?;
      debugPrint('[WS] server policy: tickIntervalMs=$_serverTickIntervalMs');
    }
    // 重新启动 tick 监控以应用新配置
    if (_isConnected) {
      _startTickWatch();
    }
  }

  // ── 智能认证失败处理（借鉴 OpenClaw） ──
  bool _reconnectPausedForAuthFailure = false;
  // ignore: prefer_final_fields
  bool _pendingDeviceTokenRetry = false;
  // ignore: prefer_final_fields
  bool _deviceTokenRetryBudgetUsed = false;

  /// 解析认证错误并决定是否暂停重连
  AuthError _parseAuthError(Map<String, dynamic> errorData) {
    final code = errorData['code']?.toString() ?? 'UNKNOWN';
    final message = errorData['message']?.toString() ?? 'Unknown error';
    final details = errorData['details'] as Map<String, dynamic>?;

    final authCode = _mapErrorCode(code, details);
    final pauseReconnect = _shouldPauseReconnect(authCode, details);
    final canRetry = details?['canRetryWithDeviceToken'] == true;
    final nextStep = details?['recommendedNextStep']?.toString();

    return AuthError(
      code: authCode,
      message: message,
      pauseReconnect: pauseReconnect,
      canRetryWithDeviceToken: canRetry,
      recommendedNextStep: nextStep,
    );
  }

  AuthErrorCode _mapErrorCode(String code, Map<String, dynamic>? details) {
    final detailCode = details?['code']?.toString();
    switch (detailCode ?? code) {
      case 'AUTH_TOKEN_MISSING':
      case 'TOKEN_MISSING':
        return AuthErrorCode.tokenMissing;
      case 'AUTH_TOKEN_INVALID':
      case 'TOKEN_INVALID':
        return AuthErrorCode.tokenInvalid;
      case 'AUTH_TOKEN_MISMATCH':
      case 'TOKEN_MISMATCH':
        return AuthErrorCode.tokenMismatch;
      case 'AUTH_BOOTSTRAP_TOKEN_INVALID':
      case 'BOOTSTRAP_TOKEN_INVALID':
        return AuthErrorCode.bootstrapTokenInvalid;
      case 'AUTH_PASSWORD_MISSING':
      case 'PASSWORD_MISSING':
        return AuthErrorCode.passwordMissing;
      case 'AUTH_PASSWORD_MISMATCH':
      case 'PASSWORD_MISMATCH':
        return AuthErrorCode.passwordMismatch;
      case 'AUTH_RATE_LIMITED':
      case 'RATE_LIMITED':
        return AuthErrorCode.rateLimited;
      case 'PAIRING_REQUIRED':
        return AuthErrorCode.pairingRequired;
      case 'DEVICE_IDENTITY_REQUIRED':
      case 'CONTROL_UI_DEVICE_IDENTITY_REQUIRED':
        return AuthErrorCode.deviceIdentityRequired;
      default:
        return AuthErrorCode.unknown;
    }
  }

  /// 借鉴 OpenClaw: 智能决定是否暂停重连
  bool _shouldPauseReconnect(AuthErrorCode code, Map<String, dynamic>? details) {
    switch (code) {
      case AuthErrorCode.tokenMissing:
      case AuthErrorCode.tokenInvalid:
      case AuthErrorCode.bootstrapTokenInvalid:
      case AuthErrorCode.passwordMissing:
      case AuthErrorCode.passwordMismatch:
      case AuthErrorCode.rateLimited:
      case AuthErrorCode.deviceIdentityRequired:
        return true; // 暂停重连，等待用户操作
      case AuthErrorCode.pairingRequired:
        // 借鉴 OpenClaw: bootstrap node 可以等待重试
        final hasBootstrapToken = _gatewayToken != null && _gatewayToken!.isNotEmpty;
        final reason = details?['reason']?.toString();
        final pause = details?['pauseReconnect'] as bool?;
        final recommendedStep = details?['recommendedNextStep']?.toString();
        
        if (hasBootstrapToken && 
            reason == 'not-paired' && 
            (pause == false || recommendedStep == 'wait_then_retry')) {
          return false; // 可以继续重试
        }
        return true;
      case AuthErrorCode.tokenMismatch:
        // 借鉴 OpenClaw: 如果可以用 device token 重试，不暂停
        return _deviceTokenRetryBudgetUsed && !_pendingDeviceTokenRetry;
      default:
        return false;
    }
  }

  // ── 指数退避重连（改进：更温和的起始延迟） ──
  static const int _maxReconnectAttempts = 20;
  static const Duration _reconnectBaseDelay = Duration(milliseconds: 500); // 借鉴 OpenClaw: 更温和
  static const Duration _reconnectMaxDelay = Duration(seconds: 15); // 借鉴 OpenClaw: 更保守的上限
  static const double _reconnectFactor = 1.7; // 借鉴 OpenClaw: 更平缓的增长
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  bool _reconnectEnabled = false;

  Duration _computeReconnectDelay() {
    // 借鉴 OpenClaw: 350 * 1.7^attempt, max 8000
    // 灵犀云改进: 500 * 1.7^attempt, max 15000 + jitter
    final exponential = (_reconnectBaseDelay.inMilliseconds *
        math.pow(_reconnectFactor, _reconnectAttempts)).toInt();
    final clamped = exponential.clamp(
      _reconnectBaseDelay.inMilliseconds,
      _reconnectMaxDelay.inMilliseconds,
    );
    // jitter ±500ms
    final jitter = (DateTime.now().millisecondsSinceEpoch % 1000) - 500;
    return Duration(milliseconds: clamped + jitter);
  }

  void _scheduleReconnect() {
    if (!_reconnectEnabled) return;
    
    // 如果认证失败暂停重连，不调度
    if (_reconnectPausedForAuthFailure) {
      debugPrint('[WS] reconnect paused due to auth failure');
      return;
    }
    
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
    debugPrint('[WS] reconnect in ${delay.inMilliseconds}ms (attempt=$_reconnectAttempts)');

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

  // ── 连接管理（改进：原子性连接替换） ──
  Future<void> connect() async {
    try {
      if (_isConnected || _isConnecting) {
        debugPrint('[WS] already connected/connecting, skip');
        return;
      }

      // 清理旧连接（借鉴 OpenClaw: 异步关闭旧连接）
      await _cleanupOldConnection();

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

  /// 借鉴 OpenClaw: 原子性清理旧连接
  Future<void> _cleanupOldConnection() async {
    _reconnectTimer?.cancel();
    _stopHeartbeat();
    _subscription?.cancel();
    _subscription = null;
    
    final oldChannel = _channel;
    _channel = null;
    
    // 异步关闭旧连接，不阻塞新连接建立
    if (oldChannel != null) {
      Future.microtask(() {
        try {
          oldChannel.sink.close();
        } catch (_) {}
      });
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
    final payload = data['payload'];
    final payloadType = payload is Map ? _toString(payload['type']) : '';

    // pong / tick 事件
    if (msgType == 'pong' || (msgType == 'event' && msgEvent == 'pong')) {
      _onMessageReceived();
      return;
    }

    // 借鉴 OpenClaw: 追踪服务端 tick
    if (msgType == 'event' && msgEvent == 'tick') {
      _lastTickTime = DateTime.now();
      return;
    }

    // 检测 hello-ok 认证成功
    final isHelloOk = (msgType == 'res' && data['ok'] == true && payloadType == 'hello-ok') ||
        (msgType == 'event' && msgEvent == 'hello-ok') ||
        (msgType == 'res' && data['ok'] == true && payload?['hello'] != null);

    if (isHelloOk) {
      _isConnected = true;
      _isConnecting = false;
      _reconnectAttempts = 0;
      _reconnectPausedForAuthFailure = false;
      _reconnectEnabled = true;
      _setConnState(ConnState.connected);
      _notifyListeners({'type': 'connected'});
      _handleHelloOk(payload is Map<String, dynamic> ? payload : <String, dynamic>{});
      _startHeartbeat();
      _flushOfflineQueue();
      return;
    }

    // 处理认证错误（借鉴 OpenClaw 智能认证失败处理）
    if (msgType == 'res' && data['ok'] == false) {
      final error = data['error'] as Map<String, dynamic>?;
      if (error != null) {
        final authError = _parseAuthError(error);
        if (authError.pauseReconnect) {
          debugPrint('[WS] auth failure, pausing reconnect: ${authError.code}');
          _reconnectPausedForAuthFailure = true;
          _notifyListeners({
            'type': 'error',
            'error': authError.message,
            'authError': {
              'code': authError.code.name,
              'pauseReconnect': true,
            },
          });
          return;
        }
      }
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
    _reconnectPausedForAuthFailure = false;
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
      'reconnectPausedForAuthFailure': _reconnectPausedForAuthFailure,
      'lastError': _lastError.isEmpty ? null : _lastError,
      'messagesReceived': _messagesReceived,
      'offlineQueueSize': _offlineQueue.length,
      'pendingRequests': _pendingResponses.length,
      'lastMessageTime': _lastMessageTime?.toIso8601String(),
      'lastTickTime': _lastTickTime?.toIso8601String(),
      'serverTickIntervalMs': _serverTickIntervalMs,
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
    _serverTickIntervalMs = null;
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
    _reconnectPausedForAuthFailure = false;
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
