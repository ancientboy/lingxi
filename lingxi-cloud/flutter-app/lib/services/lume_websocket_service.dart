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

  // ── 离线消息队列 ──
  final List<Map<String, dynamic>> _offlineQueue = [];
  static const int _maxOfflineQueue = 20;
  DateTime? _lastDisconnectTime;
  Completer<bool>? _authCompleter;  // 🔧 等 auth 握手完成

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
        debugPrint('🔵 [Lume] connect-info raw: ${data?.toString().substring(0, 300)}');
        if (data is Map && data['success'] == true && data['data'] is Map) {
          final info = data['data'] as Map;
          final mode = info['mode']?.toString() ?? '';
          debugPrint('🔵 [Lume] connect-info mode=$mode wsUrl=${info['wsUrl']?.toString().substring(0, 80)}');
          _userId = info['userId']?.toString() ?? _userId;
          if (mode == 'lume' && info['wsUrl'] != null) {
            fetchedUrl = info['wsUrl'].toString();
            fetchedSecret = info['secret']?.toString();
            _authHandledByProxy = info['authHandled'] == true;
            debugPrint('🔵 [Lume] 从 connect-info 获取: $fetchedUrl authHandled=$_authHandledByProxy');
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
    if (fetchedUrl == null) {
      _authHandledByProxy = false;
    }

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

    // 确保 WSS URL 带 JWT（connect-info 已含 token；fallback 需补全）
    if (_authHandledByProxy && !wsUrl.contains('token=')) {
      final jwt = (await SharedPreferences.getInstance()).getString(Constants.storageAccessToken);
      if (jwt != null && jwt.isNotEmpty) {
        final sep = wsUrl.contains('?') ? '&' : '?';
        wsUrl = '$wsUrl${sep}token=${Uri.encodeComponent(jwt)}';
      }
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
        _authCompleter?.complete(false);
        _notify({'type': 'error', 'error': e.toString()});
        _scheduleReconnect();
      },
      onDone: () {
        final was = _isConnected;
        _isConnected = false;
        _isConnecting = false;
        if (was) _lastDisconnectTime = DateTime.now();
        _authCompleter?.complete(false);
        _notify({'type': 'status', 'status': 'disconnected'});
        if (was) _scheduleReconnect();
      },
    );

    await Future.delayed(const Duration(milliseconds: 600));
    if (!_authHandledByProxy) {
      _sendAuth();
    }

    // proxy authHandled：等 proxy 转发 auth 成功
    if (!_isConnected && _authHandledByProxy) {
      _authCompleter = Completer<bool>();
      try {
        await _authCompleter!.future.timeout(
          const Duration(seconds: 12),
          onTimeout: () => false,
        );
      } catch (_) {}
      _authCompleter = null;
    }

    // 🔧 等 auth 握手完成（最多 10 秒），确保 connect() 返回时 isConnected 已就绪
    if (!_isConnected && !_authHandledByProxy) {
      _authCompleter = Completer<bool>();
      try {
        final authOk = await _authCompleter!.future.timeout(
          const Duration(seconds: 10),
          onTimeout: () => false,
        );
        debugPrint('🔵 [Lume] auth 等待结果: $authOk, isConnected=$_isConnected');
      } catch (e) {
        debugPrint('⚠️ [Lume] auth 等待异常: $e');
      }
      _authCompleter = null;
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
    if (data["type"] == "res") {
      final id = data["id"]?.toString();
      if (id != null && id.isNotEmpty) {
        final c = _pendingResponses.remove(id);
        if (c != null && !c.isCompleted) {
          c.complete(data);
          return;
        }
      }
    }

    if (data['type'] == 'res' && data['ok'] == false && !_isConnected) {
      _isConnecting = false;
      _lastError = data['error']?['message']?.toString() ?? 'auth failed';
      debugPrint('❌ [Lume] auth 失败: $_lastError');
      // 🔧 通知 connect() 的 auth 等待完成
      if (_authCompleter != null && !_authCompleter!.isCompleted) {
        _authCompleter!.complete(false);
      }
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
        // 🔧 通知 connect() 的 auth 等待完成
        if (_authCompleter != null && !_authCompleter!.isCompleted) {
          _authCompleter!.complete(true);
        }
        _notify({'type': 'connected'});
        _startHeartbeat();
        // 重连成功后 flush 离线队列
        _flushOfflineQueue();
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
    final params = <String, dynamic>{'message': content, 'agentId': agentId ?? 'main'};
    if (sessionKey != null && sessionKey.isNotEmpty) params['sessionKey'] = sessionKey;
    if (attachments != null && attachments.isNotEmpty) params['attachments'] = attachments;

    if (!_isConnected || _channel == null) {
      // 离线队列：缓存消息，重连后 flush
      if (_offlineQueue.length < _maxOfflineQueue) {
        _offlineQueue.add({'params': params, 'timestamp': DateTime.now().millisecondsSinceEpoch});
        debugPrint('📥 [Lume] 离线队列缓存消息 (${_offlineQueue.length}/$_maxOfflineQueue)');
      } else {
        debugPrint('⚠️ [Lume] 离线队列已满，丢弃消息');
      }
      return;
    }
    _sendChat(params);
  }

  void _sendChat(Map<String, dynamic> params) {
    _channel!.sink.add(json.encode({
      'id': 'chat-${DateTime.now().millisecondsSinceEpoch}',
      'method': 'chat.send',
      'params': params,
    }));
  }

  /// 重连成功后 flush 离线队列
  void _flushOfflineQueue() {
    if (_offlineQueue.isEmpty) return;
    debugPrint('📤 [Lume] Flush 离线队列: ${_offlineQueue.length} 条消息');
    final queued = List<Map<String, dynamic>>.from(_offlineQueue);
    _offlineQueue.clear();
    for (final item in queued) {
      final params = item['params'] as Map<String, dynamic>;
      // 加小延迟避免服务端过载
      Future.delayed(Duration(milliseconds: 200), () {
        if (_isConnected && _channel != null) {
          _sendChat(params);
        } else {
          // 又断了，放回队列
          _offlineQueue.add(item);
        }
      });
    }
  }

  /// 切换设备后重新探测并连接
  Future<void> reconnectForDevice() async {
    disconnect();
    _wsUrl = null;
    _secret = null;
    _authCompleter?.complete(false);
    _authCompleter = null;
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

  /// 🔥 热切换设备 — 不断开 WS，proxy 内部切换后端
  /// 返回 true 表示切换成功
  Future<bool> deviceSwitch(String serverId, {Duration timeout = const Duration(seconds: 15)}) async {
    if (!_isConnected) {
      debugPrint('⚠️ [Lume] deviceSwitch: 未连接，无法热切换');
      return false;
    }
    try {
      final res = await sendRequestAwait('device.switch', {
        'serverId': serverId,
      }, timeout: timeout);
      final ok = res != null && res['ok'] == true;
      if (ok) {
        debugPrint('✅ [Lume] device.switch 成功: ${res?['payload']}');
      } else {
        debugPrint('❌ [Lume] device.switch 失败: ${res}');
      }
      return ok;
    } catch (e) {
      debugPrint('❌ [Lume] deviceSwitch 异常: $e');
      return false;
    }
  }

  /// 查询用户设备列表
  Future<List<Map<String, dynamic>>> deviceList({Duration timeout = const Duration(seconds: 10)}) async {
    if (!_isConnected) return [];
    try {
      final res = await sendRequestAwait('device.list', {}, timeout: timeout);
      if (res != null && res['ok'] == true && res['payload']?['servers'] is List) {
        return (res!['payload']['servers'] as List)
            .map((s) => Map<String, dynamic>.from(s as Map))
            .toList();
      }
    } catch (e) {
      debugPrint('❌ [Lume] deviceList 异常: $e');
    }
    return [];
  }

  Map<String, dynamic> getDebugInfo() => {
    'wsUrl': _wsUrl ?? '未连接',
    'userId': _userId ?? '未知',
    'sessionPrefix': _sessionPrefix ?? '未知',
    'isConnected': _isConnected,
    'isConnecting': _isConnecting,
    'lastError': _lastError.isEmpty ? null : _lastError,
  };
}
