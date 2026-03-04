import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/models/message.dart';
import 'package:lingxicloud/services/websocket_service.dart';
import 'package:lingxicloud/services/api_service.dart';

class ChatProvider with ChangeNotifier {
  List<Message> _messages = [];
  Message? _loadingMessage;
  String? _selectedAgentId;
  bool _isSending = false;
  List<Map<String, dynamic>> _availableAgents = [];

  List<Message> get messages => _messages;
  Message? get loadingMessage => _loadingMessage;
  String? get selectedAgentId => _selectedAgentId;
  bool get isSending => _isSending;
  List<Map<String, dynamic>> get availableAgents => _availableAgents;

  // 初始化聊天
  Future<void> initChat() async {
    try {
      final response = await ApiService().get('/api/agents');
      _availableAgents = List<Map<String, dynamic>>.from(response.data);
      notifyListeners();
    } catch (e) {
      print('Load agents error: $e');
    }
  }

  // 切换选择的 Agent
  void selectAgent(String? agentId) {
    _selectedAgentId = agentId;
    notifyListeners();
  }

  // 加载历史消息
  Future<void> loadHistory({String? agentId}) async {
    try {
      final response = await ApiService().get(
        '/api/messages',
        queryParameters: {'agentId': agentId ?? _selectedAgentId},
      );

      _messages = (response.data as List)
          .map((e) => Message.fromJson(e))
          .toList();
      notifyListeners();
    } catch (e) {
      print('Load history error: $e');
    }
  }

  // 发送消息
  Future<void> sendMessage(String content) async {
    if (_selectedAgentId == null) {
      throw Exception('请选择一个 Agent');
    }

    _isSending = true;
    notifyListeners();

    // 创建用户消息（提到try外面以便catch可以访问）
    final userMessage = Message(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: 'user',
      content: content,
      createdAt: DateTime.now(),
      agentId: _selectedAgentId,
    );

    try {
      _messages.add(userMessage);
      notifyListeners();

      // 发送到服务器
      final response = await ApiService().post(
        '/api/messages',
        data: {
          'content': content,
          'agentId': _selectedAgentId,
        },
      );

      // 服务器返回的消息
      final serverMessage = Message.fromJson(response.data);
      _messages.removeWhere((m) => m.id == userMessage.id);
      _messages.add(serverMessage);
      
      notifyListeners();
    } catch (e) {
      // 恢复消息列表
      _messages.removeWhere((m) => m.id == userMessage.id);
      notifyListeners();
      throw e;
    } finally {
      _isSending = false;
      notifyListeners();
    }
  }

  // 通过 WebSocket 接收消息
  void addWebSocketListener(void Function(Map<String, dynamic>) callback) {
    WebSocketService().addListener(callback);
  }

  // 移除 WebSocket 监听器
  void removeWebSocketListener(void Function(Map<String, dynamic>) callback) {
    WebSocketService().removeListener(callback);
  }

  // 清空聊天记录
  void clearMessages() {
    _messages = [];
    notifyListeners();
  }

  // 创建加载中的消息
  void startLoading() {
    _loadingMessage = Message(
      id: 'loading',
      role: 'assistant',
      content: '',
      createdAt: DateTime.now(),
      agentId: _selectedAgentId,
    );
    notifyListeners();
  }

  // 更新加载中的消息
  void updateLoadingMessage(String content) {
    if (_loadingMessage != null) {
      _loadingMessage = _loadingMessage!.copyWith(content: content);
      notifyListeners();
    }
  }

  // 完成加载
  void completeLoading() {
    if (_loadingMessage != null) {
      _messages.add(_loadingMessage!);
      _loadingMessage = null;
      notifyListeners();
    }
  }
}
