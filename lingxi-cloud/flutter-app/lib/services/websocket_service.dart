import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:flutter/foundation.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/services.dart';

typedef WebSocketMessageCallback = void Function(Map<String, dynamic> data);

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
  Timer? _reconnectTimer;
  final int _maxReconnectAttempts = 5;
  int _reconnectAttempts = 0;
  Function? _onInitError;
  String _lastError = '';
  int _messagesReceived = 0;

  // 辅助方法：安全地将任意类型转换为字符串
  String _toString(dynamic value) {
    if (value == null) return '';
    if (value is String) return value;
    if (value is num) return value.toString();
    if (value is bool) return value.toString();
    return value.toString();
  }

  // 设置初始化错误回调
  void setOnInitError(Function callback) {
    _onInitError = callback;
  }

  // 连接到 WebSocket
  Future<void> connect() async {
    try {
      if (_isConnected || _isConnecting) {
        debugPrint('🔌 WebSocket 已连接或正在连接，跳过');
        return;
      }
    
      // 清理旧连接
      _subscription?.cancel();
      _channel?.sink.close();
      _channel = null;
      _subscription = null;
      
      _isConnecting = true;
      _notifyListeners({'type': 'status', 'status': 'connecting'});
      
      // 确保 ApiService 有 token
      final apiService = ApiService();
      if (apiService.getAuthToken() == null) {
        debugPrint('⚠️ ApiService 没有 token，尝试从本地加载');
        final prefs = await SharedPreferences.getInstance();
        final token = prefs.getString('lingxi_token');
        if (token != null && token.isNotEmpty) {
          apiService.setAuthToken(token);
          debugPrint('✅ 已从本地加载 token: ${token.substring(0, 20)}...');
        } else {
          debugPrint('❌ 本地也没有 token，无法连接');
          _isConnecting = false;
          _notifyListeners({'type': 'error', 'error': '请先登录'});
          return;
        }
      }
      
      // 从 API 获取 Gateway 连接信息
      debugPrint('🔌 正在获取 Gateway 连接信息...');
      final response = await apiService.get('/api/gateway/connect-info');
      final data = response.data;
      
      debugPrint('🔌 Gateway 响应: $data');
      
      if (data != null && data['wsUrl'] != null) {
        _wsUrl = data['wsUrl'];
        _token = data['token'];
        _gatewayToken = data['gatewayToken'];
        _session = data['session'];
        _sessionPrefix = data['sessionPrefix'];
        
        debugPrint('🔌 WebSocket URL: $_wsUrl');
        debugPrint('🔌 Session: $_session');
        debugPrint('🔌 Session Prefix: $_sessionPrefix');
      } else {
        debugPrint('❌ 获取 Gateway 信息失败: $data');
        _isConnecting = false;
        _notifyListeners({'type': 'error', 'error': '获取连接信息失败: ${data['error'] ?? '未知错误'}'});
        return;
      }
      
      final wsUrl = '${_wsUrl}?token=${Uri.encodeComponent(_token!)}';
      debugPrint('🔌 连接 WebSocket: $wsUrl');
      
      try {
        _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
        debugPrint('🔌 WebSocket 连接请求已发送');
      } catch (e, stack) {
        debugPrint('❌ WebSocket 连接失败: $e');
        _isConnecting = false;
        _notifyListeners({'type': 'error', 'error': '连接失败: $e'});
        _scheduleReconnect();
        return;
      }
      
      _subscription = _channel!.stream.listen(
        (dynamic message) async {
          try {
            _messagesReceived++;
            String text;
            if (message is String) {
              text = message;
            } else if (message is List<int>) {
              text = utf8.decode(message);
            } else if (message is Uint8List) {
              text = utf8.decode(message);
            } else {
              debugPrint('❌ 未知消息类型: ${message.runtimeType}');
              _lastError = '未知消息类型: ${message.runtimeType}';
              return;
            }
            debugPrint('📥 收到原始消息 (#$_messagesReceived): ${text.length > 300 ? text.substring(0, 300) + '...' : text}');
            final data = json.decode(text) as Map<String, dynamic>;
            _handleMessage(data);
          } catch (e, stack) {
            debugPrint('❌ 解析消息失败: $e\nStack: $stack');
            _lastError = '解析消息失败: $e';
          }
        },
        onError: (error) {
          debugPrint('❌ WebSocket error: $error');
          _lastError = error.toString();
          _isConnecting = false;
          _isConnected = false;
          _notifyListeners({'type': 'error', 'error': error.toString()});
          _scheduleReconnect();
        },
        onDone: () {
          debugPrint('🔌 WebSocket connection closed after receiving $_messagesReceived messages');
          _lastError = '连接已关闭';
          _isConnecting = false;
          _isConnected = false;
          _notifyListeners({'type': 'status', 'status': 'disconnected'});
          _scheduleReconnect();
        },
      );
      
      debugPrint('🔌 WebSocket stream 已订阅，等待 750ms 后发送 connect 消息');
      await Future.delayed(const Duration(milliseconds: 750));
      _sendConnect();
      
    } catch (e, stack) {
      debugPrint('❌ WebSocket connect error: $e');
      _isConnecting = false;
      _notifyListeners({'type': 'error', 'error': e.toString()});
      _scheduleReconnect();
    }
  }

  void _sendConnect() {
    if (_channel == null) return;
    
    final params = {
      'minProtocol': 3,
      'maxProtocol': 3,
      'client': {
        'id': 'openclaw-control-ui',
        'version': '1.0.0',
        'platform': 'web',
        'mode': 'webchat'
      },
      'role': 'operator',
      'scopes': ['operator.admin', 'operator.read', 'operator.write'],
      'auth': {'token': _gatewayToken},
      'locale': 'zh-CN',
      'userAgent': 'LingxiCloud-Flutter/1.0.0 (Android)',
    };
    
    debugPrint('📤 Connect params: $params');
    
    final connectMsg = {
      'type': 'req',
      'id': 'req_${_requestId++}',
      'method': 'connect',
      'params': params,
    };
    
    debugPrint('📤 发送 connect 消息');
    _channel!.sink.add(json.encode(connectMsg));
  }

  void _handleMessage(Map<String, dynamic> data) {
    final msgType = _toString(data['type']);
    final msgEvent = _toString(data['event']);
    final payloadType = data['payload'] is Map ? _toString(data['payload']?['type']) : '';
    
    debugPrint('📥 收到消息: type=$msgType, event=$msgEvent, payloadType=$payloadType, ok=${data['ok']}');
    
    // 检测 hello-ok 认证成功（多种格式兼容）
    final isHelloOk = (data['type'] == 'res' && data['ok'] == true && payloadType == 'hello-ok') ||
                      (data['type'] == 'event' && msgEvent == 'hello-ok') ||
                      (data['type'] == 'res' && data['ok'] == true && data['payload']?['hello'] != null);
    
    if (isHelloOk) {
      _isConnected = true;
      _isConnecting = false;
      _reconnectAttempts = 0;
      debugPrint('✅ WebSocket 认证成功 (detected via: type=$msgType, event=$msgEvent, payloadType=$payloadType)');
      _notifyListeners({'type': 'connected'});
      return;
    }
    
    _notifyListeners(data);
  }

  void _scheduleReconnect() {
    if (_reconnectAttempts >= _maxReconnectAttempts) {
      debugPrint('Max reconnect attempts reached');
      return;
    }
    
    _reconnectAttempts++;
    final delay = Duration(seconds: _reconnectAttempts * 2);
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, () {
      debugPrint('Reconnecting... (attempt $_reconnectAttempts)');
      connect();
    });
  }

  void disconnect() {
    _reconnectTimer?.cancel();
    _subscription?.cancel();
    _channel?.sink.close();
    _channel = null;
    _isConnected = false;
    _isConnecting = false;
  }

  void sendMessage(String content, {String? agentId, String? sessionKey}) {
    if (!_isConnected || _channel == null) {
      debugPrint('WebSocket 未连接，无法发送消息');
      return;
    }

    final agent = agentId ?? 'main';
    final targetSessionKey = '${_sessionPrefix}:agent:$agent';

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

    debugPrint('📤 发送消息到 $targetSessionKey');
    _channel!.sink.add(json.encode(message));
  }
  
  void sendRequest(String method, Map<String, dynamic> params) {
    if (!_isConnected || _channel == null) {
      debugPrint('WebSocket 未连接，无法发送请求');
      return;
    }
    
    final request = {
      'type': 'req',
      'id': '${method.replaceAll('.', '_')}_${DateTime.now().millisecondsSinceEpoch}',
      'method': method,
      'params': params,
    };
    
    debugPrint('📤 发送请求: $method');
    _channel!.sink.add(json.encode(request));
  }

  void addListener(WebSocketMessageCallback listener) {
    _listeners.add(listener);
  }

  void removeListener(WebSocketMessageCallback listener) {
    _listeners.remove(listener);
  }

  void _notifyListeners(Map<String, dynamic> data) {
    for (final listener in _listeners) {
      listener(data);
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
      'reconnectAttempts': _reconnectAttempts,
      'lastError': _lastError.isEmpty ? null : _lastError,
      'messagesReceived': _messagesReceived,
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

  void clearListeners() {
    _listeners.clear();
  }
  
  void cancelReconnect() {
    _reconnectTimer?.cancel();
  }
}
