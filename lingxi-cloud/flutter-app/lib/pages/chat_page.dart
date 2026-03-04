import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/models/message.dart';
import 'package:lingxicloud/pages/subscription_page.dart';
import 'package:lingxicloud/pages/skills_page.dart';
import 'package:lingxicloud/pages/login_page.dart';
import 'package:lingxicloud/services/websocket_service.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';

class ChatPage extends StatefulWidget {
  const ChatPage({super.key});

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  String _currentAgent = 'lingxi';
  bool _wsConnected = false;
  String _wsStatus = '连接中...';
  String _wsError = '';
  List<Message> _messages = [];
  bool _isGenerating = false;
  List<Map<String, dynamic>> _sessions = [];
  String? _currentSessionKey;

  final _agents = {
    'lingxi': {'name': '灵犀', 'icon': Icons.auto_awesome, 'role': '总管'},
    'coder': {'name': '云溪', 'icon': Icons.code, 'role': '编程'},
    'ops': {'name': '若曦', 'icon': Icons.bar_chart, 'role': '运维'},
    'inventor': {'name': '紫萱', 'icon': Icons.lightbulb, 'role': '发明'},
    'pm': {'name': '梓萱', 'icon': Icons.track_changes, 'role': '产品'},
    'noter': {'name': '晓琳', 'icon': Icons.note, 'role': '笔记'},
    'media': {'name': '音韵', 'icon': Icons.palette, 'role': '媒体'},
    'smart': {'name': '智家', 'icon': Icons.home, 'role': '智家'},
  };

  @override
  void initState() {
    super.initState();
    
    debugPrint('📋 ChatPage initState 开始');
    
    // 捕获异步错误
    _loadSessions().catchError((e, stack) {
      debugPrint('❌ 加载会话失败: $e\nStack: $stack');
    });
    
    // 捕获 WebSocket 初始化错误
    Future.microtask(() async {
      try {
        debugPrint('📋 开始初始化 WebSocket');
        // 先清理旧 listener，避免重复注册
        WebSocketService().clearListeners();
        _initWebSocket();
        debugPrint('✅ WebSocket 初始化完成');
      } catch (e, stack) {
        debugPrint('❌ WebSocket 初始化异常: $e\nStack: $stack');
        if (mounted) {
          setState(() {
            _wsStatus = '连接初始化失败';
            _wsError = e.toString();
          });
        }
      }
    });
    
    debugPrint('📋 ChatPage initState 完成');
  }

  Future<void> _loadSessions() async {
    final prefs = await SharedPreferences.getInstance();
    final sessionsJson = prefs.getString('chat_sessions');
    if (sessionsJson != null) {
      final List<dynamic> decoded = json.decode(sessionsJson);
      setState(() {
        _sessions = decoded.cast<Map<String, dynamic>>();
      });
    }
  }

  Future<void> _saveSessions() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('chat_sessions', json.encode(_sessions));
  }

  void _createNewSession() {
    final newSession = {
      'key': 'session_${DateTime.now().millisecondsSinceEpoch}',
      'title': '新对话',
      'createdAt': DateTime.now().toIso8601String(),
      'updatedAt': DateTime.now().toIso8601String(),
    };
    setState(() {
      _sessions.insert(0, newSession);
      _currentSessionKey = newSession['key'];
      _messages.clear();
    });
    _saveSessions();
  }

  void _switchSession(String sessionKey) {
    setState(() {
      _currentSessionKey = sessionKey;
      _messages.clear();
    });
    Navigator.pop(context);
    _loadMessageHistory(sessionKey);
  }

  void _deleteSession(String sessionKey) {
    setState(() {
      _sessions.removeWhere((s) => s['key'] == sessionKey);
      if (_currentSessionKey == sessionKey) {
        _currentSessionKey = null;
        _messages.clear();
      }
    });
    _saveSessions();
  }

  void _initWebSocket() {
    final ws = WebSocketService();
    
    // 先清理旧 listener，避免重复注册
    ws.clearListeners();
    
    ws.addListener((data) {
      if (!mounted) return;
      
      debugPrint('🔔 收到 WebSocket 消息: ${data['type']}');
      
      if (data['type'] == 'status') {
        final status = data['status'];
        setState(() {
          _wsConnected = status == 'connected';
          _wsStatus = status == 'connecting' ? '连接中...' 
                    : status == 'connected' ? '已连接' 
                    : status == 'disconnected' ? '已断开' : '连接失败';
        });
        return;
      }
      
      if (data['type'] == 'connected') {
        setState(() {
          _wsConnected = true;
          _wsStatus = '已连接';
        });
        debugPrint('✅ WebSocket 已连接');
        
        // 异步加载会话，添加错误处理
        Future.microtask(() async {
          try {
            await Future.delayed(const Duration(milliseconds: 500));
            _loadSessionsFromServer();
          } catch (e, stack) {
            debugPrint('❌ 加载会话列表失败: $e\nStack: $stack');
          }
        });
        return;
      }
      
      if (data['type'] == 'error') {
        setState(() {
          _wsConnected = false;
          _wsError = data['error']?.toString() ?? '未知错误';
          _wsStatus = '连接失败';
        });
        debugPrint('❌ WebSocket 错误: ${data['error']}');
        return;
      }
      
      if (data['type'] == 'res' && data['ok'] == true && data['payload']?['sessions'] != null) {
        final sessions = data['payload']?['sessions'] as List?;
        if (sessions != null) {
          debugPrint('📋 收到 ${sessions.length} 个会话');
          setState(() {
            _sessions = sessions.map((s) {
              final map = s is Map ? s as Map<String, dynamic> : {};
              return {
                'key': (map['key'] ?? '').toString(),
                'title': (map['title'] ?? '新对话').toString(),
                'updatedAt': map['updatedAt'],
              };
            }).toList();
            _sessions.sort((a, b) {
              final timeA = a['updatedAt'] != null ? (a['updatedAt'] is int ? a['updatedAt'] as int : DateTime.tryParse(a['updatedAt'].toString())?.millisecondsSinceEpoch ?? 0) : 0;
              final timeB = b['updatedAt'] != null ? (b['updatedAt'] is int ? b['updatedAt'] as int : DateTime.tryParse(b['updatedAt'].toString())?.millisecondsSinceEpoch ?? 0) : 0;
              return timeB.compareTo(timeA);
            });
          });
        }
        return;
      }
      
      // 处理历史消息响应
      if (data['type'] == 'res' && data['id']?.toString().contains('chat_history') == true) {
        debugPrint('📚 收到历史消息响应：ok=${data['ok']}');
        if (data['ok'] == true && data['payload'] != null) {
          try {
            final messages = data['payload']?['messages'] as List? ?? data['payload']?['transcript'] as List?;
            if (messages != null && messages.isNotEmpty) {
              debugPrint('✅ 加载了 ${messages.length} 条历史消息');
              setState(() {
                _messages = messages.map((m) {
                  final map = m is Map ? m as Map<String, dynamic> : {};
                  final messageId = map['id']?.toString() ?? map['runId']?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString();
                  final createdAt = _parseDateTime(map['createdAt'] ?? map['created_at']);
                  return Message(
                    id: messageId,
                    role: _toString(map['role'] ?? 'assistant'),
                    content: _extractText(map) ?? _toString(map['content']),
                    createdAt: createdAt,
                    agentId: _currentAgent,
                  );
                }).toList();
              });
              _scrollToBottom();
            }
          } catch (e) {
            debugPrint('❌ 解析历史消息失败: $e');
          }
        }
        return;
      }
      
      if (data['type'] == 'event' && data['event'] == 'connect.challenge') {
        debugPrint('⚠️ 收到设备认证挑战，继续等待 hello-ok');
        return;
      }
      
      if (data['type'] == 'res' && data['ok'] == false) {
        final errorMsg = data['error']?.toString() ?? '认证失败';
        debugPrint('❌ 认证失败: $errorMsg');
        setState(() {
          _wsError = errorMsg;
          _wsStatus = '认证失败';
        });
        return;
      }
      
      if (data['type'] == 'event' && data['event'] == 'chat') {
        final payload = data['payload'] as Map<String, dynamic>?;
        if (payload == null) return;
        
        final state = payload['state'];
        final runId = _toString(payload['runId']);
        
        if (state == 'delta') {
          final text = _extractText(payload['message']);
          if (text != null && runId != null) {
            setState(() {
              final existingIndex = _messages.indexWhere((m) => m.id == runId);
              if (existingIndex >= 0) {
                _messages[existingIndex] = Message(
                  id: runId,
                  role: 'assistant',
                  content: text,
                  createdAt: DateTime.now(),
                  agentId: _currentAgent,
                );
              } else {
                _messages.add(Message(
                  id: runId,
                  role: 'assistant',
                  content: text,
                  createdAt: DateTime.now(),
                  agentId: _currentAgent,
                ));
              }
            });
            _scrollToBottom();
          }
        } else if (state == 'final') {
          setState(() => _isGenerating = false);
        } else if (state == 'error') {
          setState(() {
            _isGenerating = false;
            _messages.add(Message(
              id: DateTime.now().millisecondsSinceEpoch.toString(),
              role: 'assistant',
              content: '❌ 错误: ${payload['errorMessage'] ?? '未知错误'}',
              createdAt: DateTime.now(),
              agentId: _currentAgent,
            ));
          });
        }
      }
    });
    
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (ws.isConnected || ws.isConnecting) {
        debugPrint('🔌 WebSocket 已连接或正在连接');
        return;
      }
      
      debugPrint('📋 开始连接 WebSocket...');
      try {
        await ws.connect();
      } catch (e) {
        debugPrint('❌ WebSocket 连接失败: $e');
        if (mounted) {
          setState(() => _wsStatus = '连接失败');
        }
      }
    });
  }

  String? _extractText(dynamic message) {
    if (message == null) return null;
    if (message is String) return message;
    if (message is Map) {
      if (message['text'] != null) return message['text']?.toString();
      if (message['content'] != null) {
        final content = message['content'];
        if (content is String) return content;
        if (content is List) {
          return content
              .where((block) => block is Map && block['type'] == 'text')
              .map((block) => block['text']?.toString() ?? '')
              .join('');
        }
      }
    }
    return null;
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _loadSessionsFromServer() {
    try {
      final ws = WebSocketService();
      if (!ws.isConnected) {
        debugPrint('⚠️ WebSocket 未连接，无法加载会话列表');
        return;
      }
      debugPrint('📋 发送 sessions.list 请求');
      ws.sendRequest('sessions.list', {});
    } catch (e, stack) {
      debugPrint('❌ _loadSessionsFromServer 异常: $e\nStack: $stack');
    }
  }

  void _loadMessageHistory(String sessionKey) {
    try {
      final ws = WebSocketService();
      if (!ws.isConnected) {
        debugPrint('⚠️ WebSocket 未连接，无法加载历史消息');
        return;
      }
      debugPrint('📚 发送 chat.history 请求，sessionKey: $sessionKey');
      ws.sendRequest('chat.history', {
        'sessionKey': sessionKey,
        'limit': 10,
      });
      // 历史消息响应在 _initWebSocket 的主 listener 中处理
    } catch (e, stack) {
      debugPrint('❌ _loadMessageHistory 异常: $e\nStack: $stack');
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    try {
      WebSocketService().clearListeners();
      debugPrint('✅ WebSocket 监听器已清理');
    } catch (e) {
      debugPrint('❌ 清理 WebSocket 监听器失败: $e');
    }
    super.dispose();
  }

  void _sendMessage() {
    final text = _controller.text.trim();
    if (text.isEmpty || _isGenerating) return;

    _controller.clear();
    
    setState(() {
      _messages.add(Message(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        role: 'user',
        content: text,
        createdAt: DateTime.now(),
        agentId: _currentAgent,
      ));
      _isGenerating = true;
      
      if (_messages.length == 1 && _sessions.isNotEmpty) {
        _sessions[0]['title'] = text.length > 20 ? text.substring(0, 20) + '...' : text;
        _saveSessions();
      }
    });
    
    _scrollToBottom();

    final ws = WebSocketService();
    if (ws.isConnected) {
      ws.sendMessage(text, agentId: _currentAgent);
    } else {
      setState(() {
        _messages.add(Message(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          role: 'assistant',
          content: '❌ 连接未建立，请稍候重试',
          createdAt: DateTime.now(),
          agentId: _currentAgent,
        ));
        _isGenerating = false;
      });
    }
  }

  String _toString(dynamic value) {
    if (value == null) return '';
    if (value is String) return value;
    if (value is num) return value.toString();
    if (value is bool) return value.toString();
    return value.toString();
  }

  DateTime _parseDateTime(dynamic value) {
    if (value == null) return DateTime.now();
    if (value is DateTime) return value;
    if (value is int) return DateTime.fromMillisecondsSinceEpoch(value);
    if (value is String) {
      final parsed = DateTime.tryParse(value);
      return parsed ?? DateTime.now();
    }
    return DateTime.now();
  }

  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.of(context).size.width > 768;
    final isDarkMode = Provider.of<AppProvider>(context).isDarkMode;
    
    // 添加错误边界包装
    return Scaffold(
        key: _scaffoldKey,
        appBar: _buildAppBar(isWide),
        drawer: isWide ? null : Drawer(child: _buildSidebar(isDarkMode)),
        body: Row(
          children: [
            if (isWide) _buildSidebar(isDarkMode),
            Expanded(child: _buildMainContent()),
          ],
        ),
      );
  }

  PreferredSizeWidget _buildAppBar(bool isWide) {
    final isDarkMode = Provider.of<AppProvider>(context).isDarkMode;
    return AppBar(
      leading: IconButton(
        icon: const Icon(Icons.menu),
        onPressed: () {
          if (!isWide) _scaffoldKey.currentState?.openDrawer();
        },
      ),
      title: Row(children: [
        Icon(Icons.auto_awesome, color: Constants.primaryColor),
        const SizedBox(width: 8),
        const Text('灵犀云'),
      ]),
      actions: [
        _buildConnectionIndicator(),
        _buildAgentSelector(),
        IconButton(
          icon: Icon(isDarkMode ? Icons.light_mode : Icons.dark_mode),
          onPressed: () {
            Provider.of<AppProvider>(context, listen: false).toggleTheme();
          },
        ),
      ],
    );
  }

  Widget _buildConnectionIndicator() {
    final color = _wsConnected ? Colors.green : Colors.orange;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 8),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: color.shade100, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 4),
        Text(_wsStatus, style: TextStyle(color: color, fontSize: 12)),
      ]),
    );
  }

  void _showConnectionDebug() {
    final ws = WebSocketService();
    final debugInfo = ws.getDebugInfo();
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.info_outline, color: Constants.primaryColor),
            SizedBox(width: 8),
            Text('连接调试'),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildDebugItem('状态', _wsStatus, _wsConnected ? Colors.green : Colors.orange),
              _buildDebugItem('已连接', _wsConnected ? '是' : '否', _wsConnected ? Colors.green : Colors.red),
              _buildDebugItem('正在连接', ws.isConnecting ? '是' : '否', ws.isConnecting ? Colors.orange : Colors.grey),
              if (debugInfo['lastError'] != null && debugInfo['lastError'].toString().isNotEmpty)
                _buildDebugItem('最后错误', debugInfo['lastError'].toString(), Colors.red),
              _buildDebugItem('收到消息数', '${debugInfo['messagesReceived'] ?? 0}', Colors.grey),
              const Divider(),
              _buildDebugItem('WS URL', debugInfo['wsUrl'] ?? '未获取', Colors.blue),
              _buildDebugItem('Session', debugInfo['session'] ?? '未获取', Colors.blue),
              _buildDebugItem('Session前缀', debugInfo['sessionPrefix'] ?? '未获取', Colors.blue),
              _buildDebugItem('JWT Token', debugInfo['hasToken'] == true ? '已获取' : '未获取', 
                debugInfo['hasToken'] == true ? Colors.green : Colors.red),
              _buildDebugItem('Gateway Token', debugInfo['hasGatewayToken'] == true ? '已获取' : '未获取',
                debugInfo['hasGatewayToken'] == true ? Colors.green : Colors.red),
              _buildDebugItem('重连次数', '${debugInfo['reconnectAttempts'] ?? 0}', Colors.grey),
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 8),
              const Text('连接步骤:', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('1. 检查登录状态 (JWT Token)'),
              const Text('2. 调用 /api/gateway/connect-info'),
              const Text('3. 获取 WS URL 和 Gateway Token'),
              const Text('4. 建立 WebSocket 连接'),
              const Text('5. 等待 750ms'),
              const Text('6. 发送 connect 认证消息'),
              const Text('7. 等待 hello-ok 响应'),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () async {
                    Navigator.pop(context);
                    setState(() {
                      _wsStatus = '重新连接中...';
                      _wsError = '';
                    });
                    ws.reset();
                    try {
                      await ws.connect();
                    } catch (e) {
                      setState(() {
                        _wsStatus = '连接失败';
                        _wsError = e.toString();
                      });
                    }
                  },
                  icon: const Icon(Icons.refresh),
                  label: const Text('重新连接'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Constants.primaryColor,
                    foregroundColor: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('关闭')),
        ],
      ),
    );
  }

  Widget _buildDebugItem(String label, String value, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(width: 100, child: Text('$label:', style: const TextStyle(fontWeight: FontWeight.w500))),
          Expanded(child: Text(value, style: TextStyle(color: color))),
        ],
      ),
    );
  }

  Widget _buildAgentSelector() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 8),
      child: DropdownButton<String>(
        value: _currentAgent,
        underline: const SizedBox(),
        items: _agents.entries.map((e) {
          final agent = e.value;
          final name = _toString(agent['name']);
          return DropdownMenuItem(value: e.key, child: Text(name));
        }).toList(),
        onChanged: (v) => setState(() => _currentAgent = v!),
      ),
    );
  }

  Widget _buildSidebar(bool isDarkMode) {
    final bgColor = isDarkMode ? const Color(0xFF202123) : const Color(0xFFF7F7F8);
    final textColor = isDarkMode ? Colors.white : Colors.black87;
    final subTextColor = isDarkMode ? Colors.white54 : Colors.black54;
    final iconColor = Constants.primaryColor;
    
    return Container(
      color: bgColor,
      width: 260,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(Icons.auto_awesome, color: iconColor, size: 24),
                const SizedBox(width: 12),
                Text('灵犀云', style: TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: OutlinedButton.icon(
              onPressed: _createNewSession,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('新对话'),
              style: OutlinedButton.styleFrom(
                foregroundColor: textColor,
                side: BorderSide(color: isDarkMode ? Colors.white30 : Colors.black26),
                minimumSize: const Size(double.infinity, 44),
              ),
            ),
          ),
          const SizedBox(height: 8),
          
          Expanded(
            child: _sessions.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text('暂无对话历史', style: TextStyle(color: subTextColor, fontSize: 13)),
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    children: _buildSessionGroups(isDarkMode),
                  ),
          ),
          
          Divider(color: isDarkMode ? Colors.white10 : Colors.black12, height: 1),
          _buildToolItem(Icons.people_outline, '我的团队', () => _showTeamDialog(), isDarkMode),
          _buildToolItem(Icons.message_outlined, '飞书配置', () => _showComingSoon('飞书配置'), isDarkMode),
          _buildToolItem(Icons.business_outlined, '企业微信', () => _showComingSoon('企业微信配置'), isDarkMode),
          _buildToolItem(Icons.extension_outlined, '技能库', () {
            Navigator.pop(context);
            Navigator.push(context, MaterialPageRoute(builder: (_) => const SkillsPage()));
          }, isDarkMode),
          
          Divider(color: isDarkMode ? Colors.white10 : Colors.black12, height: 1),
          _buildUserFooter(isDarkMode),
        ],
      ),
    );
  }


  List<Widget> _buildSessionGroups(bool isDarkMode) {
    final now = DateTime.now();
    final today = <Map<String, dynamic>>[];
    final week = <Map<String, dynamic>>[];
    final older = <Map<String, dynamic>>[];
    
    for (final session in _sessions) {
      final updatedAt = session['updatedAt'] != null 
          ? DateTime.tryParse(session['updatedAt']) ?? now
          : now;
      final daysAgo = now.difference(updatedAt).inDays;
      
      if (daysAgo < 1) today.add(session);
      else if (daysAgo < 7) week.add(session);
      else older.add(session);
    }
    
    final widgets = <Widget>[];
    
    if (today.isNotEmpty) widgets.add(_buildSessionGroup('今天', today, isDarkMode));
    if (week.isNotEmpty) widgets.add(_buildSessionGroup('最近 7 天', week, isDarkMode));
    if (older.isNotEmpty) widgets.add(_buildSessionGroup('更早', older, isDarkMode));
    
    return widgets;
  }

  Widget _buildSessionGroup(String title, List<Map<String, dynamic>> sessions, bool isDarkMode) {
    final subTextColor = isDarkMode ? Colors.white54 : Colors.black54;
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 12, 8, 4),
          child: Text(title, style: TextStyle(color: subTextColor, fontSize: 12, fontWeight: FontWeight.w500)),
        ),
        ...sessions.map((session) => _buildSessionItem(session, isDarkMode)),
      ],
    );
  }

  Widget _buildSessionItem(Map<String, dynamic> session, bool isDarkMode) {
    final isActive = session['key'] == _currentSessionKey;
    final bgColor = isDarkMode 
        ? (isActive ? Colors.white10 : Colors.transparent)
        : (isActive ? Colors.black.withOpacity(0.05) : Colors.transparent);
    final textColor = isDarkMode ? Colors.white : Colors.black87;
    final iconColor = isDarkMode ? Colors.white54 : Colors.black45;
    
    return Container(
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        dense: true,
        leading: Icon(Icons.chat_outlined, color: iconColor, size: 18),
        title: Text(
          session['title'] ?? '新对话',
          style: TextStyle(color: textColor, fontSize: 14),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: IconButton(
          icon: Icon(Icons.close, color: iconColor, size: 16),
          onPressed: () => _deleteSession(session['key']),
        ),
        onTap: () => _switchSession(session['key']),
      ),
    );
  }

  Widget _buildToolItem(IconData icon, String title, VoidCallback onTap, bool isDarkMode) {
    final textColor = isDarkMode ? Colors.white : Colors.black87;
    
    return ListTile(
      dense: true,
      leading: Icon(icon, color: Constants.primaryColor, size: 20),
      title: Text(title, style: TextStyle(color: textColor, fontSize: 14)),
      onTap: () {
        Navigator.pop(context);
        onTap();
      },
    );
  }

  Widget _buildUserFooter(bool isDarkMode) {
    return Consumer<AppProvider>(
      builder: (context, appProvider, child) {
        final user = appProvider.user;
        final textColor = isDarkMode ? Colors.white : Colors.black87;
        final subTextColor = isDarkMode ? Colors.white54 : Colors.black54;
        
        return InkWell(
          onTap: () => _showUserMenuBottomSheet(appProvider, isDarkMode),
          child: Container(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 14,
                  backgroundColor: Constants.primaryColor,
                  child: Text(
                    user?.nickname.isNotEmpty == true
                        ? user!.nickname.substring(0, 1).toUpperCase()
                        : 'U',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    user?.nickname ?? '用户',
                    style: TextStyle(color: textColor, fontSize: 14),
                  ),
                ),
                Text(
                  '💎 ${user?.points ?? 0}',
                  style: TextStyle(color: subTextColor, fontSize: 12),
                ),
                const SizedBox(width: 8),
                Icon(Icons.more_horiz, color: subTextColor, size: 20),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showUserMenuBottomSheet(AppProvider appProvider, bool isDarkMode) {
    final bgColor = isDarkMode ? const Color(0xFF2A2B32) : Colors.white;
    final textColor = isDarkMode ? Colors.white : Colors.black87;
    
    showModalBottomSheet(
      context: context,
      backgroundColor: bgColor,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(Icons.bar_chart_outlined, color: textColor),
              title: Text('使用量统计', style: TextStyle(color: textColor)),
              onTap: () async {
                Navigator.pop(context);
                await _showUsageStatsDialog(appProvider);
              },
            ),
            ListTile(
              leading: Icon(Icons.star_outline, color: textColor),
              title: Text('我的订阅', style: TextStyle(color: textColor)),
              onTap: () async {
                Navigator.pop(context);
                Navigator.pop(context);
                await Navigator.push(context, MaterialPageRoute(builder: (_) => const SubscriptionPage()));
              },
            ),
            const Divider(height: 1),
            ListTile(
              leading: Icon(Icons.lock_outline, color: textColor),
              title: Text('修改密码', style: TextStyle(color: textColor)),
              onTap: () {
                Navigator.pop(context);
                _showPasswordChangeDialog();
              },
            ),
            ListTile(
              leading: Icon(Icons.info_outline, color: textColor),
              title: Text('关于', style: TextStyle(color: textColor)),
              onTap: () async {
                Navigator.pop(context);
                showAboutDialog(
                  context: context,
                  applicationName: Constants.appName,
                  applicationVersion: Constants.appVersion,
                );
              },
            ),
            ListTile(
              leading: Icon(Icons.logout, color: Colors.red),
              title: const Text('退出登录', style: TextStyle(color: Colors.red)),
              onTap: () async {
                Navigator.pop(context);
                Navigator.pop(context);
                await appProvider.logout();
                if (mounted) {
                  Navigator.of(context).pushAndRemoveUntil(
                    MaterialPageRoute(builder: (_) => const LoginPage()),
                    (route) => false,
                  );
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showComingSoon(String feature) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(feature),
        content: const Text('此功能即将上线，敬请期待！'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('知道了')),
        ],
      ),
    );
  }

  void _showTeamDialog() {
    final appProvider = Provider.of<AppProvider>(context, listen: false);
    List<String> myAgents = List.from(appProvider.user?.agents ?? ['lingxi']);
    
    final allAgents = {
      'lingxi': {'name': '灵犀', 'icon': Icons.auto_awesome, 'role': '队长 · 智能调度'},
      'coder': {'name': '云溪', 'icon': Icons.code, 'role': '编程开发'},
      'ops': {'name': '若曦', 'icon': Icons.bar_chart, 'role': '数据分析'},
      'inventor': {'name': '紫萱', 'icon': Icons.lightbulb, 'role': '创意发明'},
      'pm': {'name': '梓萱', 'icon': Icons.track_changes, 'role': '产品经理'},
      'noter': {'name': '晓琳', 'icon': Icons.note, 'role': '笔记整理'},
      'media': {'name': '音韵', 'icon': Icons.palette, 'role': '媒体设计'},
      'smart': {'name': '智家', 'icon': Icons.home, 'role': '智能家居'},
    };
    
    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          final availableAgents = allAgents.keys.where((id) => !myAgents.contains(id)).toList();
          
          return AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.people_outline, color: Constants.primaryColor),
                SizedBox(width: 8),
                Text('我的团队'),
              ],
            ),
            content: SizedBox(
              width: 350,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('已添加成员', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    const SizedBox(height: 8),
                    ...myAgents.map((agentId) {
                      final agent = allAgents[agentId] ?? {'name': agentId, 'icon': Icons.smart_toy, 'role': 'AI助手'};
                      final isRequired = agentId == 'lingxi';
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          dense: true,
                          leading: CircleAvatar(
                            backgroundColor: Constants.primaryColor.withOpacity(0.1),
                            child: Icon(agent['icon'] as IconData, color: Constants.primaryColor, size: 20),
                          ),
                          title: Text(_toString(agent['name'])),
                          subtitle: Text(_toString(agent['role']), style: const TextStyle(fontSize: 12)),
                          trailing: isRequired 
                            ? Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: Constants.primaryColor,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Text('队长', style: TextStyle(color: Colors.white, fontSize: 12)),
                              )
                            : IconButton(
                                icon: const Icon(Icons.remove_circle_outline, color: Colors.red),
                                onPressed: () async {
                                  final newAgents = myAgents.where((id) => id != agentId).toList();
                                  if (newAgents.isEmpty) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(content: Text('至少保留一个团队成员')),
                                    );
                                    return;
                                  }
                                  final success = await ApiService().updateMyAgents(
                                    appProvider.user!.id,
                                    newAgents,
                                  );
                                  if (success && appProvider.user != null) {
                                    final updatedUser = appProvider.user!.copyWith(agents: newAgents);
                                    appProvider.setUser(updatedUser);
                                    setState(() {
                                      myAgents = newAgents;
                                    });
                                  }
                                },
                              ),
                        ),
                      );
                    }),
                    
                    if (availableAgents.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      const Text('可添加成员', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: availableAgents.map((agentId) {
                          final agent = allAgents[agentId]!;
                          return ActionChip(
                            avatar: Icon(agent['icon'] as IconData, size: 16, color: Constants.primaryColor),
                            label: Text(_toString(agent['name'])),
                            onPressed: () async {
                              final newAgents = [...myAgents, agentId];
                              final success = await ApiService().updateMyAgents(
                                appProvider.user!.id,
                                newAgents,
                              );
                              if (success && appProvider.user != null) {
                                final updatedUser = appProvider.user!.copyWith(agents: newAgents);
                                appProvider.setUser(updatedUser);
                                setState(() {
                                  myAgents = newAgents;
                                });
                              }
                            },
                          );
                        }).toList(),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('关闭')),
            ],
          );
        },
      ),
    );
  }

  Future<void> _showPasswordChangeDialog() async {
    final currentPasswordController = TextEditingController();
    final newPasswordController = TextEditingController();
    final confirmPasswordController = TextEditingController();
    
    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('修改密码'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: currentPasswordController,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: '当前密码',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: newPasswordController,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: '新密码',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: confirmPasswordController,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: '确认新密码',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (newPasswordController.text != confirmPasswordController.text) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('两次密码不一致')));
                return;
              }
              if (newPasswordController.text.length < 6) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('密码长度至少6位')));
                return;
              }
              
              try {
                final result = await ApiService().changePassword(
                  currentPassword: currentPasswordController.text,
                  newPassword: newPasswordController.text,
                );
                final success = result['success'] == true;
                if (success) {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('密码修改成功')));
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('密码修改失败')));
                }
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('修改失败: $e')));
              }
            },
            child: const Text('确认'),
          ),
        ],
      ),
    );
  }

  Future<void> _showUsageStatsDialog(AppProvider appProvider) async {
    // 显示加载中
    showDialog(
      context: context,
      barrierDismissible: true,  // 允许点击外部关闭
      builder: (ctx) => const Center(child: CircularProgressIndicator()),
    );
    
    Map<String, dynamic>? usageData;
    try {
      usageData = await ApiService().getUsageStats();
    } catch (e) {
      debugPrint('❌ 获取使用量统计失败: $e');
    }
    
    // 关闭加载中（使用 Navigator.of 而不是 context，避免 context 失效问题）
    if (mounted) {
      Navigator.of(context, rootNavigator: true).pop();
    }
    
    if (!mounted) return;
    
    String formatTokens(dynamic n) {
      if (n == null) return '0';
      final numValue = n is num ? n : num.tryParse(n.toString()) ?? 0;
      if (numValue >= 1000000) return '${(numValue / 1000000).toStringAsFixed(1)}M';
      if (numValue >= 1000) return '${(numValue / 1000).toStringAsFixed(1)}K';
      return numValue.toString();
    }
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.bar_chart_outlined, color: Constants.primaryColor),
            SizedBox(width: 8),
            Text('使用量统计'),
          ],
        ),
        content: SingleChildScrollView(
          child: SizedBox(
            width: 350,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Constants.primaryColor.withOpacity(0.1), Constants.primaryColor.withOpacity(0.05)],
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('💎 积分余额', style: TextStyle(fontWeight: FontWeight.bold)),
                          Text(
                            '${usageData?['credits']?['total'] ?? appProvider.user?.points ?? 0}',
                            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Constants.primaryColor),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: (usageData?['quota']?['percent'] ?? 0) / 100,
                          backgroundColor: Colors.grey.shade200,
                          valueColor: const AlwaysStoppedAnimation(Constants.primaryColor),
                          minHeight: 8,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildUsageRow('总积分', '${usageData?['credits']?['total'] ?? appProvider.user?.points ?? 0}'),
                      _buildUsageRow('充值积分', '${usageData?['credits']?['balance'] ?? appProvider.user?.points ?? 0}'),
                      _buildUsageRow('今日免费', '${usageData?['credits']?['freeRemaining'] ?? 100} / ${usageData?['credits']?['freeDaily'] ?? 100}'),
                      _buildUsageRow('预计可用', '约 ${formatTokens((usageData?['credits']?['total'] ?? 0) / 0.3 * 1000)} tokens'),
                    ],
                  ),
                ),
                
                const SizedBox(height: 16),
                const Text('📈 Token 使用量', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                
                Row(
                  children: [
                    Expanded(child: _buildTokenCard('今日', formatTokens(usageData?['today']?['tokens']), '${usageData?['today']?['requests'] ?? 0} 次')),
                    const SizedBox(width: 8),
                    Expanded(child: _buildTokenCard('本周', formatTokens(usageData?['week']?['tokens']), '${usageData?['week']?['requests'] ?? 0} 次')),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: _buildTokenCard('本月', formatTokens(usageData?['month']?['tokens']), '${usageData?['month']?['requests'] ?? 0} 次')),
                    const SizedBox(width: 8),
                    Expanded(child: _buildTokenCard('总计', formatTokens(usageData?['totalTokens']), '${usageData?['totalRequests'] ?? 0} 次')),
                  ],
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('关闭')),
        ],
      ),
    );
  }
  
  Widget _buildUsageRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: Colors.grey)),
          Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
  
  Widget _buildTokenCard(String label, String tokens, String requests) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
          const SizedBox(height: 4),
          Text(tokens, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          Text(requests, style: const TextStyle(fontSize: 11, color: Colors.grey)),
        ],
      ),
    );
  }

  Widget _buildMainContent() {
    final isDarkMode = Provider.of<AppProvider>(context, listen: false).isDarkMode;
    
    try {
      return Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.chat_bubble_outline, size: 64, color: Colors.grey.shade400),
                        const SizedBox(height: 16),
                        Text(
                          '开始与 ${_agents[_currentAgent]?['name'] ?? 'AI'} 对话',
                          style: TextStyle(color: Colors.grey.shade600),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.only(bottom: 16),
                    itemCount: _messages.length,
                    itemBuilder: (context, i) => _MessageBubble(
                      content: _messages[i].content,
                      isUser: _messages[i].role == 'user',
                      agentId: _messages[i].agentId ?? _currentAgent,
                      agents: _agents,
                      isDarkMode: isDarkMode,
                    ),
                  ),
          ),
          if (_isGenerating)
            Container(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Constants.primaryColor),
                  ),
                  const SizedBox(width: 12),
                  Text('AI 正在思考...', style: TextStyle(color: isDarkMode ? const Color(0xFFECECF1) : Colors.grey)),
                ],
              ),
            ),
          Container(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 8,
              bottom: MediaQuery.of(context).viewInsets.bottom > 0
                  ? 8
                  : MediaQuery.of(context).padding.bottom + 16,
            ),
            decoration: BoxDecoration(
              color: isDarkMode ? const Color(0xFF343541) : Colors.white,
              boxShadow: isDarkMode 
                ? null
                : [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, -2))],
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  IconButton(
                    icon: Icon(Icons.attach_file, color: isDarkMode ? const Color(0xFFECECF1) : null),
                    onPressed: () async {
                      final picker = ImagePicker();
                      final XFile? file = await picker.pickImage(source: ImageSource.gallery);
                      if (file != null) {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('图片上传功能开发中')));
                      }
                    },
                  ),
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      style: TextStyle(color: isDarkMode ? const Color(0xFFECECF1) : Colors.black87),
                      decoration: InputDecoration(
                        hintText: '输入消息...',
                        hintStyle: TextStyle(color: isDarkMode ? const Color(0xFF6E6E80) : Colors.grey),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                        filled: true,
                        fillColor: isDarkMode ? const Color(0xFF424454) : Colors.white,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        isDense: true,
                      ),
                      maxLines: null,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FloatingActionButton(
                    onPressed: _isGenerating ? null : _sendMessage,
                    backgroundColor: Constants.primaryColor,
                    child: const Icon(Icons.send, color: Colors.white),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    } catch (e) {
      debugPrint('❌ 主内容区渲染失败: $e');
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 64, color: Colors.red.shade400),
            const SizedBox(height: 16),
            Text('页面加载失败', style: const TextStyle(color: Colors.grey)),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => setState(() {}),
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }
  }
}

class _MessageBubble extends StatelessWidget {
  final String content;
  final bool isUser;
  final String agentId;
  final Map<String, dynamic> agents;
  final bool isDarkMode;

  const _MessageBubble({
    required this.content,
    required this.isUser,
    required this.agentId,
    required this.agents,
    this.isDarkMode = false,
  });

  @override
  Widget build(BuildContext context) {
    final bgColor = isUser 
        ? (isDarkMode ? const Color(0xFF444654) : Constants.primaryColor)
        : (isDarkMode ? const Color(0xFF343541) : Colors.grey.shade100);
    final textColor = isDarkMode ? const Color(0xFFECECF1) : (isUser ? Colors.white : Colors.black87);
    final iconColor = isDarkMode ? const Color(0xFF10A37F) : Constants.primaryColor;
    
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.all(12),
        constraints: const BoxConstraints(maxWidth: 400),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isUser)
              Row(
                children: [
                  Icon(agents[agentId]?['icon'] as IconData?, size: 16, color: iconColor),
                  const SizedBox(width: 4),
                  Text(
                    (agents[agentId]?['name']?.toString() ?? 'AI'),
                    style: TextStyle(color: iconColor, fontWeight: FontWeight.bold, fontSize: 12),
                  ),
                ],
              ),
            if (!isUser) const SizedBox(height: 8),
            Text(content, style: TextStyle(color: textColor)),
          ],
        ),
      ),
    );
  }
}
