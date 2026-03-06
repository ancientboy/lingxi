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
import 'package:lingxicloud/widgets/file_preview.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';
import 'package:flutter/services.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';

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
  
  // 语音识别（录音 + 后端阿里云识别）
  final _audioRecorder = AudioRecorder();
  bool _isListening = false;
  bool _speechEnabled = true;  // 始终可用（后端处理）
  String _lastWords = '';
  bool _showVoiceInput = false;  // 是否显示语音输入模式
  String? _recordingPath;  // 录音文件路径
  Timer? _waveAnimationTimer;  // 波浪动画定时器
  int _waveIndex = 0;  // 波浪动画索引
  bool _isCanceling = false;  // 是否正在取消（上移取消）
  double _dragY = 0;  // 拖动 Y 坐标
  bool _isGenerating = false;
  int _queuePosition = 0;  // 队列位置
  int _queueTotal = 0;  // 队列总数
  // 待发送的图片（改为 URL 模式）
  String? _pendingImageUrl;  // 改用 URL 而不是 base64
  String? _pendingImageName;
  List<Map<String, dynamic>> _sessions = [];
  String? _currentSessionKey;

  // 用户服务器信息（用于文件预览）
  String? _userServerIp;
  int? _userServerPort;
  String? _userServerToken;

  final Map<String, Map<String, dynamic>> _agents = {
    'lingxi': {
      'name': '灵犀',
      'icon': Icons.auto_awesome,
      'role': '队长 · 智能调度',
      'examples': [
        {'text': '帮我安排明天的日程', 'desc': '日程规划'},
        {'text': '提醒我下午3点开会', 'desc': '设置提醒'},
        {'text': '这个任务应该派给谁？', 'desc': '智能调度'},
      ],
    },
    'coder': {
      'name': '云溪',
      'icon': Icons.code,
      'role': '编程开发',
      'examples': [
        {'text': '帮我写一个 Python 爬虫', 'desc': '代码生成'},
        {'text': '这段代码有什么问题？', 'desc': '代码审查'},
        {'text': '设计一个用户登录 API', 'desc': 'API 设计'},
      ],
    },
    'ops': {
      'name': '若曦',
      'icon': Icons.bar_chart,
      'role': '数据分析',
      'examples': [
        {'text': '分析一下这周的用户增长数据', 'desc': '数据分析'},
        {'text': '给我一个 SEO 优化方案', 'desc': 'SEO 优化'},
        {'text': '如何提高用户留存率？', 'desc': '增长策略'},
      ],
    },
    'inventor': {
      'name': '紫萱',
      'icon': Icons.lightbulb,
      'role': '创意发明',
      'examples': [
        {'text': '写一个产品宣传文案', 'desc': '文案创作'},
        {'text': '给我的小红书账号想个选题', 'desc': '内容策划'},
        {'text': '设计一个营销活动方案', 'desc': '活动策划'},
      ],
    },
    'pm': {
      'name': '梓萱',
      'icon': Icons.track_changes,
      'role': '产品经理',
      'examples': [
        {'text': '帮我写一个产品需求文档', 'desc': '需求分析'},
        {'text': '设计一个用户注册流程', 'desc': '流程设计'},
        {'text': '这个功能如何设计更好？', 'desc': '产品建议'},
      ],
    },
    'noter': {
      'name': '晓琳',
      'icon': Icons.note,
      'role': '笔记整理',
      'examples': [
        {'text': '翻译这段话成英文', 'desc': '翻译服务'},
        {'text': '帮我整理一下今天的会议笔记', 'desc': '笔记整理'},
        {'text': '搜索一下 AI Agent 的最新进展', 'desc': '信息检索'},
      ],
    },
    'media': {
      'name': '音韵',
      'icon': Icons.palette,
      'role': '媒体设计',
      'examples': [
        {'text': '生成一张科幻风格的封面图', 'desc': 'AI 绘图'},
        {'text': '写一个短视频脚本', 'desc': '剧本创作'},
        {'text': '设计一张海报', 'desc': '设计建议'},
      ],
    },
    'smart': {
      'name': '智家',
      'icon': Icons.home,
      'role': '智能家居',
      'examples': [
        {'text': '写一个自动备份脚本', 'desc': '脚本编写'},
        {'text': '如何批量重命名文件？', 'desc': '效率工具'},
        {'text': '帮我设计一个自动化工作流', 'desc': '流程自动化'},
      ],
    },
  };

  @override
  void initState() {
    super.initState();
    
    debugPrint('📋 ChatPage initState 开始');
    
    // 初始化语音识别
    _initSpeech();
    
    // 获取用户服务器信息（用于文件预览）
    _loadUserServerInfo();
    
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

  /// 获取用户服务器信息（用于文件预览）
  Future<void> _loadUserServerInfo() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('lingxi_token');
      if (token == null || token.isEmpty) {
        debugPrint('⚠️ 未获取到登录 token，跳过获取服务器信息');
        return;
      }
      
      // 设置认证 token
      ApiService().setAuthToken(token);
      
      final response = await ApiService().get(
        '${Constants.baseUrl}/api/user/server',
      );
      
      if (response.statusCode == 200) {
        final data = response.data;
        debugPrint('✅ 获取用户服务器信息: $data');
        if (mounted) {
          setState(() {
            _userServerIp = data['serverIp']?.toString();
            _userServerPort = data['fileServerPort'];
            _userServerToken = data['fileServerToken']?.toString();
          });
        }
      } else {
        debugPrint('❌ 获取用户服务器信息失败: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('❌ _loadUserServerInfo 异常: $e');
    }
  }

  Future<void> _loadSessions() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final sessionsJson = prefs.getString('chat_sessions');
      if (sessionsJson != null && mounted) {
        final List<dynamic> decoded = json.decode(sessionsJson);
        setState(() {
          // 对每个 session 的 key 和 title 进行类型转换，确保是 String 类型
          _sessions = decoded.map((s) {
            final map = s is Map ? s as Map<String, dynamic> : <String, dynamic>{};
            return {
              'key': map['key']?.toString() ?? '',
              'title': map['title']?.toString() ?? '新对话',
              'createdAt': map['createdAt']?.toString(),
              'updatedAt': map['updatedAt']?.toString(),
            };
          }).toList();
        });
      }
    } catch (e, stack) {
      debugPrint('❌ _loadSessions 异常: $e\nStack: $stack');
    }
  }

  Future<void> _saveSessions() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('chat_sessions', json.encode(_sessions));
  }

  void _createNewSession() {
    // 新建会话时，不设置本地格式的 key
    // sessionKey 会在第一次发送消息后从服务器响应中获取
    
    // ✅ 检查 WebSocket 连接状态
    final ws = WebSocketService();
    if (!ws.isConnected) {
      debugPrint('⚠️ 新会话时 WebSocket 未连接，尝试连接');
      ws.connect().catchError((e) {
        debugPrint('❌ 连接失败: $e');
      });
    }
    
    setState(() {
      _currentSessionKey = null;  // 清空，表示新会话
      _messages.clear();
    });
    Navigator.pop(context);
  }

  void _switchSession(String sessionKey) {
    // 找到对应的会话
    final session = _sessions.firstWhere(
      (s) => s['key'] == sessionKey,
      orElse: () => <String, dynamic>{},
    );
    
    setState(() {
      _currentSessionKey = sessionKey;
      _messages.clear();
      // 恢复会话的 Agent
      if (session.isNotEmpty && session['agentId'] != null) {
        final agentId = session['agentId'].toString();
        if (_agents.containsKey(agentId)) {
          _currentAgent = agentId;
        }
      }
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
  
  /// 更新或创建会话记录（从服务器响应中获取真实 sessionKey）
  void _updateOrCreateSession(String sessionKey) {
    final existingIndex = _sessions.indexWhere((s) => s['key'] == sessionKey);
    
    if (existingIndex >= 0) {
      // 已存在，更新时间
      setState(() {
        _sessions[existingIndex]['updatedAt'] = DateTime.now().toIso8601String();
      });
    } else {
      // 不存在，创建新记录
      String title = '新对话';
      final firstUserMsg = _messages.firstWhere((m) => m.role == 'user', orElse: () => _messages.isNotEmpty ? _messages.first : Message(id: '', role: 'user', content: '', createdAt: DateTime.now()));
      if (firstUserMsg.content.isNotEmpty) {
        title = firstUserMsg.content.length > 20 
            ? '${firstUserMsg.content.substring(0, 20)}...' 
            : firstUserMsg.content;
      }
      
      final newSession = {
        'key': sessionKey,
        'title': title,
        'agentId': _currentAgent,
        'createdAt': DateTime.now().toIso8601String(),
        'updatedAt': DateTime.now().toIso8601String(),
      };
      
      setState(() {
        _sessions.insert(0, newSession);
      });
    }
    
    _saveSessions();
  }

  void _initWebSocket() {
    final ws = WebSocketService();
    
    // 注意：不要在这里 clearListeners()，因为 initState 已经清理过了
    // 如果在这里再次清理，会把刚添加的 listener 清除掉！
    
    // 如果已经连接，直接更新状态
    if (ws.isConnected) {
      setState(() {
        _wsConnected = true;
        _wsStatus = '已连接';
      });
      debugPrint('✅ WebSocket 已连接（复用现有连接）');
      // 加载会话列表
      Future.microtask(() async {
        try {
          await Future.delayed(const Duration(milliseconds: 300));
          _loadSessionsFromServer();
        } catch (e) {
          debugPrint('❌ 加载会话列表失败: $e');
        }
      });
    }
    
    ws.addListener((data) {
      if (!mounted) return;
      
      try {
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
          // 防止重复处理
          if (_wsConnected && _wsStatus == '已连接') {
            debugPrint('🔔 已处理过 connected 事件，跳过');
            return;
          }
          
          debugPrint('🔔 收到 connected 事件，开始处理');
          setState(() {
            _wsConnected = true;
            _wsStatus = '已连接';
          });
          debugPrint('✅ WebSocket 已连接（状态已更新）');
          
          // 异步加载会话，添加错误处理
          Future.microtask(() async {
            try {
              debugPrint('🔄 开始加载会话列表...');
              await Future.delayed(const Duration(milliseconds: 500));
              _loadSessionsFromServer();
              debugPrint('✅ 会话列表加载完成');
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
                // 尝试从多个字段获取标题
                String title = '新对话';
                if (map['title'] != null && map['title'].toString().isNotEmpty && map['title'].toString() != '新对话') {
                  title = map['title'].toString();
                } else if (map['firstMessage'] != null) {
                  // 从第一条消息获取标题
                  title = map['firstMessage'].toString();
                  if (title.length > 30) title = '${title.substring(0, 30)}...';
                } else if (map['lastMessage'] != null) {
                  // 从最后一条消息获取标题
                  title = map['lastMessage'].toString();
                  if (title.length > 30) title = '${title.substring(0, 30)}...';
                }
                
                return {
                  'key': (map['key'] ?? '').toString(),
                  'title': title,
                  'agentId': map['agentId'] ?? map['agent_id'] ?? 'lingxi',  // 保留 agentId
                  'updatedAt': map['updatedAt'],
                };
              }).toList();
              _sessions.sort((a, b) {
                try {
                  final timeA = a['updatedAt'] != null ? (a['updatedAt'] is int ? a['updatedAt'] as int : DateTime.tryParse(a['updatedAt'].toString())?.millisecondsSinceEpoch ?? 0) : 0;
                  final timeB = b['updatedAt'] != null ? (b['updatedAt'] is int ? b['updatedAt'] as int : DateTime.tryParse(b['updatedAt'].toString())?.millisecondsSinceEpoch ?? 0) : 0;
                  return timeB.compareTo(timeA);
                } catch (e) {
                  return 0;
                }
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
                  // 使用消息自己的 agentId，如果没有则使用当前 Agent
                  final msgAgentId = map['agentId']?.toString() ?? map['agent_id']?.toString() ?? _currentAgent;
                  
                  // 🔍 提取图片 URL（从 attachments 或 parts）
                  String? imageUrl;
                  final attachments = map['attachments'] as List? ?? map['parts'] as List?;
                  if (attachments != null && attachments.isNotEmpty) {
                    for (final att in attachments) {
                      if (att is Map && (att['type'] == 'image' || att['type']?.toString().contains('image') == true)) {
                        imageUrl = att['url']?.toString() ?? att['content']?.toString();
                        if (imageUrl != null && imageUrl!.isNotEmpty) {
                          // ✅ 问题3：转换本地路径为可访问的 URL
                          if (imageUrl!.startsWith('/root/.openclaw/')) {
                            // 本地路径 → 转换为文件服务器 URL
                            final fileName = imageUrl.split('/').last;
                            if (_userServerIp != null && _userServerPort != null) {
                              imageUrl = 'http://$_userServerIp:$_userServerPort/files/$fileName?token=$_userServerToken';
                              debugPrint('📷 转换图片 URL: $imageUrl');
                            } else {
                              // 使用主服务器的上传文件访问接口
                              imageUrl = '${Constants.baseUrl}/api/upload/file/$fileName';
                              debugPrint('📷 使用主服务器 URL: $imageUrl');
                            }
                          }
                          debugPrint('📷 找到历史图片: $imageUrl');
                          break;
                        }
                      }
                    }
                  }
                  
                  return Message(
                    id: messageId,
                    role: _toString(map['role'] ?? 'assistant'),
                    content: _extractText(map) ?? _toString(map['content']),
                    createdAt: createdAt,
                    agentId: msgAgentId,
                    imageUrl: imageUrl,  // 👈 添加图片 URL
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
        if (payload == null) {
          debugPrint('⚠️ chat 事件 payload 为空');
          return;
        }
        
        debugPrint('📨 收到 chat 事件: state=${payload['state']}, sessionKey=${payload['sessionKey']}');
        
        // 🔍 从响应中获取真实的 sessionKey（用于新建会话）
        final serverSessionKey = payload['sessionKey']?.toString();
        if (serverSessionKey != null && serverSessionKey.isNotEmpty) {
          if (_currentSessionKey == null || _currentSessionKey != serverSessionKey) {
            debugPrint('🔑 更新 sessionKey: $serverSessionKey');
            setState(() {
              _currentSessionKey = serverSessionKey;
            });
            // 更新或创建会话记录
            _updateOrCreateSession(serverSessionKey);
          }
        } else {
          debugPrint('⚠️ chat 事件没有包含 sessionKey');
        }
        
        final state = payload['state'];
        final runId = _toString(payload['runId']);
        
        // 处理队列状态
        if (state == 'queued') {
          setState(() {
            _queuePosition = payload['position'] ?? 1;
            _queueTotal = payload['total'] ?? 1;
            _isGenerating = true;
          });
          debugPrint('📋 消息已加入队列: $_queuePosition/$_queueTotal');
          return;
        }
        
        // 处理开始生成
        if (state == 'start' || state == 'begin') {
          setState(() {
            _queuePosition = 0;
            _queueTotal = 0;
            _isGenerating = true;
          });
          return;
        }
        
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
          setState(() {
            _isGenerating = false;
            _queuePosition = 0;
            _queueTotal = 0;
          });
          // 对话完成后刷新用户数据（更新 token 使用量）
          _refreshUserData();
        } else if (state == 'error') {
          setState(() {
            _isGenerating = false;
            _queuePosition = 0;
            _queueTotal = 0;
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
      } catch (e, stack) {
        debugPrint('❌ WebSocket 消息处理异常: $e\nStack: $stack');
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

  // ===== 语音识别功能（录音 + 后端阿里云识别）=====
  
  void _initSpeech() async {
    // 检查麦克风权限
    bool hasPermission = await _audioRecorder.hasPermission();
    debugPrint('🎤 麦克风权限: $hasPermission');
  }

  void _startListening() async {
    debugPrint('🎤 开始录音...');
    
    // 震动反馈
    HapticFeedback.mediumImpact();
    
    // 检查权限
    bool hasPermission = await _audioRecorder.hasPermission();
    if (!hasPermission) {
      debugPrint('❌ 没有麦克风权限');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('请授予麦克风权限')),
        );
      }
      return;
    }
    
    try {
      // 创建录音文件路径
      final directory = await getTemporaryDirectory();
      _recordingPath = '${directory.path}/speech_${DateTime.now().millisecondsSinceEpoch}.m4a';
      
      // 开始录音
      await _audioRecorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          sampleRate: 16000,
          numChannels: 1,
        ),
        path: _recordingPath!,
      );
      
      debugPrint('🎤 录音中... path: $_recordingPath');
      
      // 启动波浪动画
      _waveAnimationTimer?.cancel();
      _waveAnimationTimer = Timer.periodic(const Duration(milliseconds: 150), (timer) {
        if (mounted) {
          setState(() {
            _waveIndex = (_waveIndex + 1) % 4;
          });
        }
      });
      
      setState(() {
        _isListening = true;
        _lastWords = '';
        _isCanceling = false;
      });
      
    } catch (e) {
      debugPrint('❌ 录音启动失败: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('录音启动失败: $e')),
        );
      }
    }
  }

  void _stopListening({bool cancel = false}) async {
    debugPrint('🎤 停止录音... cancel: $cancel');
    
    // 震动反馈
    HapticFeedback.lightImpact();
    
    // 停止波浪动画
    _waveAnimationTimer?.cancel();
    _waveAnimationTimer = null;
    
    setState(() {
      _isListening = false;
    });
    
    // 如果是取消，直接返回
    if (cancel) {
      try {
        await _audioRecorder.stop();
        if (_recordingPath != null && File(_recordingPath!).existsSync()) {
          File(_recordingPath!).delete();
        }
      } catch (e) {
        debugPrint('❌ 取消录音失败: $e');
      }
      setState(() {
        _lastWords = '';
        _isCanceling = false;
      });
      return;
    }
    
    try {
      // 停止录音
      final path = await _audioRecorder.stop();
      debugPrint('🎤 录音已保存: $path');
      
      if (path != null && File(path).existsSync()) {
        // 读取录音文件并转为 base64
        final bytes = await File(path).readAsBytes();
        final base64Audio = base64Encode(bytes);
        
        debugPrint('🎤 音频大小: ${bytes.length} bytes');
        
        // 发送到后端识别（不显示"正在识别"提示）
        _recognizeSpeech(base64Audio);
        
        // 删除临时文件
        File(path).delete();
      } else {
        debugPrint('❌ 录音文件不存在');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('录音失败，请重试')),
          );
        }
      }
    } catch (e) {
      debugPrint('❌ 停止录音失败: $e');
      setState(() {
        _isListening = false;
      });
    }
  }
  
  // 语音波浪动画
  Widget _buildVoiceWaveAnimation() {
    return SizedBox(
      width: 24,
      height: 24,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(4, (index) {
          // 根据动画索引计算每个条的高度
          final height = 8.0 + ((_waveIndex + index) % 4) * 4.0;
          return AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            height: _isListening ? height : 8,
            width: 3,
            margin: const EdgeInsets.symmetric(horizontal: 1),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(2),
            ),
          );
        }),
      ),
    );
  }
  
  // 调用后端语音识别 API
  void _recognizeSpeech(String base64Audio) async {
    try {
      debugPrint('🎤 发送到后端识别...');
      
      final response = await ApiService().post('/api/speech/recognize', data: {
        'audio': base64Audio,
        'format': 'm4a',
      });
      
      final data = response.data;
      debugPrint('🎤 识别响应: ${data.toString().substring(0, (data.toString().length > 200 ? 200 : data.toString().length))}');
      
      if (data['success'] == true) {
        final text = data['data']?['text'] ?? '';
        debugPrint('🎤 识别结果: $text');
        
        if (text.isNotEmpty) {
          _controller.text = text;
          _lastWords = text;  // 同步更新，避免延迟回调弹出提示
          // 自动发送
          _sendMessage();
          setState(() {
            _showVoiceInput = false;
          });
        } else {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('未识别到语音内容，请重试')),
            );
          }
        }
      } else {
        final error = data['error'] ?? '识别失败';
        debugPrint('❌ 识别失败: $error');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('识别失败: $error')),
          );
        }
      }
    } catch (e) {
      debugPrint('❌ 识别异常: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('识别失败: $e')),
        );
      }
    }
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
  
  // 刷新用户数据（更新 token 使用量等）
  Future<void> _refreshUserData() async {
    try {
      final appProvider = Provider.of<AppProvider>(context, listen: false);
      await appProvider.init();
      debugPrint('✅ 用户数据已刷新');
    } catch (e) {
      debugPrint('❌ 刷新用户数据失败: $e');
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

  // 选择图片并上传到服务器
  Future<void> _selectImage(XFile file) async {
    try {
      // 1. 压缩图片（如果大于 200KB）
      File imageFile = File(file.path);
      int fileSize = await imageFile.length();
      
      if (fileSize > 200 * 1024) {
        debugPrint('🔄 图片大于 200KB，开始压缩: ${(fileSize / 1024).toStringAsFixed(1)}KB');
        
        final compressedPath = file.path.replaceAll(
          RegExp(r'\.[^.]+$'),
          '_compressed.jpg',
        );
        
        final compressedFile = await FlutterImageCompress.compressAndGetFile(
          file.path,
          compressedPath,
          quality: 80,
          minWidth: 1024,
          minHeight: 1024,
        );
        
        if (compressedFile != null) {
          imageFile = File(compressedFile.path);
          fileSize = await imageFile.length();
          debugPrint('✅ 压缩完成: ${(fileSize / 1024).toStringAsFixed(1)}KB');
        }
      }
      
      // 2. 上传到服务器
      final apiUrl = '${Constants.baseUrl}/api/upload/image';
      final request = http.MultipartRequest('POST', Uri.parse(apiUrl));
      
      // 👈 读取文件并明确指定 MIME 类型
      final mimeType = imageFile.path.endsWith('.png') ? 'image/png' : 'image/jpeg';
      final fileName = imageFile.path.split('/').last;
      final fileBytes = await imageFile.readAsBytes();
      
      request.files.add(
        http.MultipartFile.fromBytes(
          'file',
          fileBytes,
          filename: fileName,
          contentType: MediaType.parse(mimeType),
        ),
      );
      
      debugPrint('📤 上传图片: $fileName, MIME: $mimeType, 大小: ${(fileSize / 1024).toStringAsFixed(1)}KB');
      
      final response = await request.send();
      final responseText = await response.stream.bytesToString();
      
      debugPrint('📥 服务器响应: $responseText');
      
      final responseData = jsonDecode(responseText);
      
      if (responseData['success'] == true) {
        final imageUrl = responseData['url'] as String;
        
        // 存储图片 URL（不再用 base64）
        setState(() {
          _pendingImageUrl = imageUrl;
          _pendingImageName = file.name;
        });
        
        debugPrint('✅ 图片已上传: $imageUrl');
        // ✅ 问题2：删除"图片已添加"提示
      } else {
        throw Exception(responseData['error'] ?? '上传失败');
      }
    } catch (e) {
      debugPrint('❌ 图片处理失败: $e');
      // ✅ 问题2：删除错误提示，或者只在真正失败时显示
    }
  }

  // 清除待发送的图片
  void _clearPendingImage() {
    setState(() {
      _pendingImageUrl = null;
      _pendingImageName = null;
    });
  }

  void _sendMessage() {
    final text = _controller.text.trim();
    final hasImage = _pendingImageUrl != null;
    
    // 如果没有文字也没有图片，不发送
    if (text.isEmpty && !hasImage) return;
    if (_isGenerating) return;
    
    // ✅ 问题1：改进连接检查逻辑
    final ws = WebSocketService();
    if (!ws.isConnected) {
      debugPrint('⚠️ WebSocket 未连接，状态: ${ws.isConnecting ? "正在连接" : "未连接"}');
      
      if (!ws.isConnecting) {
        // 未在连接中，尝试连接
        debugPrint('🔌 尝试连接 WebSocket...');
        ws.connect().then((_) {
          debugPrint('✅ WebSocket 连接成功，等待认证...');
          // 等待认证完成（hello-ok）
          Future.delayed(const Duration(seconds: 2), () {
            if (ws.isConnected && mounted) {
              debugPrint('✅ 认证完成，重新发送消息');
              _sendMessage();
            } else {
              debugPrint('❌ 认证超时或连接失败');
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('连接超时，请重试')),
                );
              }
            }
          });
        }).catchError((e) {
          debugPrint('❌ 连接失败: $e');
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('连接失败: $e')),
            );
          }
        });
      } else {
        // 正在连接中，等待
        debugPrint('⏳ WebSocket 正在连接中，等待...');
        Future.delayed(const Duration(seconds: 1), () {
          if (ws.isConnected && mounted) {
            _sendMessage();
          } else if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('正在连接，请稍候...')),
            );
          }
        });
      }
      return;
    }

    _controller.clear();
    
    // 构建用户消息
    final userMessage = Message(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: 'user',
      content: text,
      imageUrl: hasImage ? _pendingImageUrl : null,  // 直接用 URL
      createdAt: DateTime.now(),
      agentId: _currentAgent,
    );
    
    setState(() {
      _messages.add(userMessage);
      _isGenerating = true;
    });
    
    _scrollToBottom();

    // ✅ 新会话时，使用 sessionPrefix 构建临时 sessionKey
    String targetSessionKey;
    if (_currentSessionKey != null && _currentSessionKey!.isNotEmpty) {
      targetSessionKey = _currentSessionKey!;
    } else {
      // 新会话：使用 sessionPrefix + agentId
      final sessionPrefix = ws.sessionPrefix;
      if (sessionPrefix != null && sessionPrefix.isNotEmpty) {
        targetSessionKey = '$sessionPrefix:agent:$_currentAgent';
        debugPrint('🆕 新会话，构建 sessionKey: $targetSessionKey');
      } else {
        // 降级方案：直接用 agentId
        targetSessionKey = 'agent:$_currentAgent';
        debugPrint('⚠️ 没有获取到 sessionPrefix，使用降级方案: $targetSessionKey');
      }
      // 更新当前 sessionKey
      setState(() {
        _currentSessionKey = targetSessionKey;
      });
    }

    // 构建发送参数（与Web版格式一致）
    final params = <String, dynamic>{
      'sessionKey': targetSessionKey,  // ✅ 始终传递 sessionKey
      'message': text.isNotEmpty ? text : '请识别这张图片',
      'idempotencyKey': 'msg_${DateTime.now().millisecondsSinceEpoch}',
      'deliver': false,
    };
    
    // 如果有图片，添加 attachments（使用 URL 而不是 base64）
    if (hasImage) {
      params['attachments'] = [
        {
          'type': 'image',
          'url': _pendingImageUrl,  // 使用 URL
          'mimeType': 'image/jpeg',
        }
      ];
      debugPrint('📎 发送带图片的消息: $_pendingImageUrl');
    }
    
    debugPrint('📤 发送消息: sessionKey=$targetSessionKey, message=${text.substring(0, text.length > 50 ? 50 : text.length)}');
    debugPrint('📤 完整参数: $params');
    ws.sendRequest('chat.send', params);
    
    // 清除待发送的图片
    _clearPendingImage();
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
  
  // 安全解析百分比（可能是 String 或 num）
  double _parsePercent(dynamic value) {
    if (value == null) return 0.0;
    if (value is num) return value / 100;
    if (value is String) {
      final parsed = double.tryParse(value);
      return (parsed ?? 0) / 100;
    }
    return 0.0;
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
  
  // 错误处理包装器
  Widget _errorWrapper(Widget child) {
    return Builder(
      builder: (context) {
        try {
          return child;
        } catch (e, stack) {
          debugPrint('🚨 Widget 构建异常: $e\nStack: $stack');
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 16),
                Text('加载失败: $e'),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => setState(() {}),
                  child: const Text('重试'),
                ),
              ],
            ),
          );
        }
      },
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
      title: _buildAgentSelector(),  // Agent选择器放在中间
      centerTitle: true,
      actions: [
        // 状态指示灯
        Padding(
          padding: const EdgeInsets.only(right: 8),
          child: _buildConnectionIndicator(),
        ),
        // 主题切换
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
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: color.withOpacity(0.5),
            blurRadius: 4,
            spreadRadius: 1,
          ),
        ],
      ),
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
    // 确保 _currentAgent 在 _agents 中存在
    final validAgent = _agents.containsKey(_currentAgent) ? _currentAgent : _agents.keys.first;
    final currentAgentData = _agents[validAgent];
    
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 8),
      child: DropdownButton<String>(
        value: validAgent,
        underline: const SizedBox(),
        // 自定义当前选中的显示
        selectedItemBuilder: (context) => _agents.entries.map((e) {
          final agent = e.value;
          final name = _toString(agent['name']);
          final icon = agent['icon'] as IconData?;
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 18, color: Constants.primaryColor),
                const SizedBox(width: 6),
              ],
              Text(name),
            ],
          );
        }).toList(),
        items: _agents.entries.map((e) {
          final agent = e.value;
          final name = _toString(agent['name']);
          final icon = agent['icon'] as IconData?;
          final role = _toString(agent['role']);
          return DropdownMenuItem(
            value: e.key,
            child: Row(
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 18, color: Constants.primaryColor),
                  const SizedBox(width: 8),
                ],
                Text(name),
                const SizedBox(width: 8),
                Text('($role)', style: const TextStyle(fontSize: 10, color: Colors.grey)),
              ],
            ),
          );
        }).toList(),
        onChanged: (v) {
          if (v != null && _agents.containsKey(v) && v != _currentAgent) {
            // 切换Agent时，如果有消息，保存当前会话并创建新会话
            if (_messages.isNotEmpty) {
              _saveCurrentSession();
            }
            setState(() {
              _currentAgent = v;
              _messages = [];  // 清空消息，开始新会话
            });
          }
        },
      ),
    );
  }

  // 保存当前会话
  void _saveCurrentSession() {
    if (_messages.isEmpty) return;
    
    // 生成会话标题
    final firstUserMsg = _messages.firstWhere((m) => m.role == 'user', orElse: () => _messages.first);
    String title = firstUserMsg.content;
    if (title.length > 20) title = '${title.substring(0, 20)}...';
    
    // 创建会话记录（使用与其他地方一致的格式）
    final session = {
      'key': 'session_${DateTime.now().millisecondsSinceEpoch}',
      'title': title,
      'agentId': _currentAgent,
      'createdAt': DateTime.now().toIso8601String(),
      'updatedAt': DateTime.now().toIso8601String(),
      'messageCount': _messages.length,
    };
    
    // 添加到会话列表开头
    _sessions.insert(0, session);
    _saveSessions();
  }

  // 构建欢迎界面和使用示例
  Widget _buildWelcomeExamples(Map<String, dynamic>? agentInfo, bool isDarkMode) {
    final agentName = agentInfo?['name']?.toString() ?? 'AI';
    final agentIcon = agentInfo?['icon'] as IconData?;
    final examples = (agentInfo?['examples'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Agent 图标和名称
            if (agentIcon != null)
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: Constants.primaryColor.withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(agentIcon, size: 40, color: Constants.primaryColor),
              ),
            const SizedBox(height: 16),
            Text(
              '开始与 $agentName 对话',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: isDarkMode ? Colors.white : Colors.black87,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              agentInfo?['role']?.toString() ?? '',
              style: TextStyle(
                fontSize: 14,
                color: isDarkMode ? Colors.white54 : Colors.grey,
              ),
            ),
            const SizedBox(height: 32),
            // 使用示例
            if (examples.isNotEmpty) ...[
              Text(
                '试试这些',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: isDarkMode ? Colors.white70 : Colors.grey.shade700,
                ),
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                alignment: WrapAlignment.center,
                children: examples.map((ex) {
                  return GestureDetector(
                    onTap: () {
                      _controller.text = ex['text']?.toString() ?? '';
                      _sendMessage();
                    },
                    child: Container(
                      constraints: const BoxConstraints(maxWidth: 280),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: isDarkMode ? Colors.white.withOpacity(0.05) : Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isDarkMode ? Colors.white10 : Colors.grey.shade200,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            ex['text']?.toString() ?? '',
                            style: TextStyle(
                              fontSize: 13,
                              color: isDarkMode ? Colors.white : Colors.black87,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            ex['desc']?.toString() ?? '',
                            style: TextStyle(
                              fontSize: 11,
                              color: Constants.primaryColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }
  
  // ✅ 问题4：构建"思考中"气泡框
  Widget _buildThinkingBubble(bool isDarkMode, Map<String, dynamic>? agentInfo) {
    final bgColor = isDarkMode ? const Color(0xFF343541) : Colors.grey.shade100;
    final iconColor = isDarkMode ? const Color(0xFF10A37F) : Constants.primaryColor;
    final textColor = isDarkMode ? const Color(0xFFECECF1) : Colors.black87;
    
    final agent = _agents[_currentAgent];
    String agentName = 'AI';
    IconData? agentIcon;
    
    if (agent != null) {
      final nameValue = agent['name'];
      if (nameValue is String) agentName = nameValue;
      final iconValue = agent['icon'];
      if (iconValue is IconData) agentIcon = iconValue;
    }
    
    return Align(
      alignment: Alignment.centerLeft,
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
            Row(
              children: [
                if (agentIcon != null) Icon(agentIcon, size: 16, color: iconColor),
                const SizedBox(width: 4),
                Text(
                  agentName,
                  style: TextStyle(color: iconColor, fontWeight: FontWeight.bold, fontSize: 12),
                ),
              ],
            ),
            const SizedBox(height: 8),
            // 队列提示或思考动画
            if (_queueTotal > 1)
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2, color: iconColor),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        '队列中: $_queuePosition/$_queueTotal',
                        style: TextStyle(color: textColor, fontSize: 13),
                      ),
                    ],
                  ),
                  if (_queuePosition > 1) ...[
                    const SizedBox(height: 6),
                    Text(
                      '预计等待: ${(_queuePosition - 1) * 15}秒',
                      style: TextStyle(color: Colors.grey, fontSize: 12),
                    ),
                  ],
                ],
              )
            else
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2, color: iconColor),
                  ),
                  const SizedBox(width: 10),
                  Text('思考中...', style: TextStyle(color: textColor, fontSize: 13)),
                ],
              ),
          ],
        ),
      ),
    );
  }

  // 构建文本输入区域
  Widget _buildTextInputArea(bool isDarkMode) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 图片预览区域
        if (_pendingImageUrl != null)
          Container(
            height: 80,
            margin: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                // 图片预览
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
                    _pendingImageUrl!,
                    height: 80,
                    width: 80,
                    fit: BoxFit.cover,
                  ),
                ),
                const SizedBox(width: 8),
                // 图片信息
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _pendingImageName ?? '图片',
                        style: TextStyle(
                          color: isDarkMode ? Colors.white70 : Colors.black54,
                          fontSize: 12,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '点击发送按钮上传',
                        style: TextStyle(
                          color: isDarkMode ? Colors.white54 : Colors.black38,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
                // 删除按钮
                IconButton(
                  icon: Icon(Icons.close, color: Colors.red.shade400, size: 20),
                  onPressed: _clearPendingImage,
                ),
              ],
            ),
          ),
        // 输入行
        Row(
          children: [
            IconButton(
              icon: Icon(
                _pendingImageUrl != null ? Icons.image : Icons.attach_file,
                color: _pendingImageUrl != null 
                    ? Constants.primaryColor 
                    : (isDarkMode ? const Color(0xFFECECF1) : null),
              ),
              onPressed: () async {
                final picker = ImagePicker();
                final XFile? file = await picker.pickImage(source: ImageSource.gallery);
                if (file != null) {
                  _selectImage(file);
                }
              },
            ),
            // 语音输入切换按钮
            IconButton(
              icon: Icon(
                Icons.mic,
                color: isDarkMode ? const Color(0xFFECECF1) : null,
              ),
              onPressed: _speechEnabled
                  ? () {
                      setState(() {
                        _showVoiceInput = true;
                      });
                    }
                  : null,
            ),
            Expanded(
              child: TextField(
                controller: _controller,
                style: TextStyle(color: isDarkMode ? const Color(0xFFECECF1) : Colors.black87),
                decoration: InputDecoration(
                  hintText: _pendingImageUrl != null ? '添加图片描述（可选）...' : '输入消息...',
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
              onPressed: _isGenerating ? _abortChat : _sendMessage,
              backgroundColor: _isGenerating ? Colors.red : Constants.primaryColor,
              child: Icon(
                _isGenerating ? Icons.stop : Icons.send,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ],
    );
  }

  // 取消对话
  void _abortChat() {
    final ws = WebSocketService();
    if (!ws.isConnected) {
      debugPrint('⚠️ WebSocket 未连接，无法取消');
      return;
    }
    
    debugPrint('🛑 发送取消请求');
    ws.sendRequest('chat.abort', {
      'sessionKey': _currentSessionKey,
    });
    
    setState(() {
      _isGenerating = false;
      _queuePosition = 0;
      _queueTotal = 0;
    });
    
    // 移除正在输入的提示
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('已取消生成'),
        duration: Duration(seconds: 1),
      ),
    );
  }

  // 构建语音输入区域
  Widget _buildVoiceInputArea(bool isDarkMode) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 显示识别中的文字
        if (_lastWords.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              _lastWords,
              style: TextStyle(
                color: isDarkMode ? Colors.white70 : Colors.black54,
                fontSize: 14,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        // 语音输入按钮行
        Row(
          children: [
            // 取消按钮
            IconButton(
              icon: Icon(Icons.keyboard, color: isDarkMode ? const Color(0xFFECECF1) : null),
              onPressed: () {
                setState(() {
                  _showVoiceInput = false;
                  _lastWords = '';
                });
              },
            ),
            Expanded(
              child: GestureDetector(
                onLongPressStart: (_) {
                  _startListening();
                },
                onLongPressMoveUpdate: (details) {
                  // 检测上移（Y 轴负方向移动超过 100 像素）
                  final isCanceling = details.localOffsetFromOrigin.dy < -100;
                  if (isCanceling != _isCanceling) {
                    HapticFeedback.selectionClick();
                    setState(() {
                      _isCanceling = isCanceling;
                    });
                  }
                },
                onLongPressEnd: (_) {
                  if (_isCanceling) {
                    // 上移取消
                    _stopListening(cancel: true);
                    setState(() {
                      _showVoiceInput = false;
                      _isCanceling = false;
                    });
                  } else {
                    // 正常发送（_recognizeSpeech 会处理成功/失败）
                    _stopListening();
                  }
                },
                child: Container(
                  height: 48,
                  decoration: BoxDecoration(
                    color: _isCanceling 
                        ? Colors.grey.shade600 
                        : (_isListening ? Colors.red.shade400 : Constants.primaryColor),
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // 语音波浪动画或取消图标
                      _isCanceling
                          ? const Icon(Icons.cancel, color: Colors.white)
                          : (_isListening 
                              ? _buildVoiceWaveAnimation()
                              : const Icon(Icons.mic_none, color: Colors.white)),
                      const SizedBox(width: 8),
                      Text(
                        _isCanceling 
                            ? '松开取消' 
                            : (_isListening ? '松开发送' : '按住说话'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 48),  // 平衡左边的图标按钮
          ],
        ),
      ],
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
                Text('Lume', style: TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.bold)),
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
      // 安全解析 updatedAt，处理 int 或 String 类型
      DateTime updatedAt = now;
      final updatedAtValue = session['updatedAt'];
      if (updatedAtValue != null) {
        if (updatedAtValue is int) {
          updatedAt = DateTime.fromMillisecondsSinceEpoch(updatedAtValue);
        } else if (updatedAtValue is String) {
          updatedAt = DateTime.tryParse(updatedAtValue) ?? now;
        }
      }
      
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
    // 安全获取 session key，确保转换为 String 类型
    final sessionKey = session['key']?.toString() ?? '';
    final isActive = sessionKey == _currentSessionKey;
    final bgColor = isDarkMode 
        ? (isActive ? Colors.white10 : Colors.transparent)
        : (isActive ? Colors.black.withOpacity(0.05) : Colors.transparent);
    final textColor = isDarkMode ? Colors.white : Colors.black87;
    final iconColor = isDarkMode ? Colors.white54 : Colors.black45;
    
    // 获取会话的Agent图标
    final sessionAgentId = session['agentId']?.toString() ?? 'lingxi';
    final agentIcon = _agents[sessionAgentId]?['icon'] as IconData? ?? Icons.chat_outlined;
    
    return Container(
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        dense: true,
        leading: Icon(agentIcon, color: iconColor, size: 18),
        title: Text(
          session['title']?.toString() ?? '新对话',
          style: TextStyle(color: textColor, fontSize: 14),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: IconButton(
          icon: Icon(Icons.close, color: iconColor, size: 16),
          onPressed: () => _deleteSession(sessionKey),
        ),
        onTap: () => _switchSession(sessionKey),
        onLongPress: () => _showEditTitleDialog(session, isDarkMode),
      ),
    );
  }

  // 编辑会话标题
  void _showEditTitleDialog(Map<String, dynamic> session, bool isDarkMode) {
    final sessionKey = session['key']?.toString() ?? '';
    final currentTitle = session['title']?.toString() ?? '新对话';
    final controller = TextEditingController(text: currentTitle);
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: isDarkMode ? const Color(0xFF2D2D2D) : Colors.white,
        title: const Text('编辑标题'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: '输入新标题',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          ElevatedButton(
            onPressed: () {
              final newTitle = controller.text.trim();
              if (newTitle.isNotEmpty) {
                // 更新本地会话标题
                setState(() {
                  final index = _sessions.indexWhere((s) => s['key'] == sessionKey);
                  if (index >= 0) {
                    _sessions[index]['title'] = newTitle;
                  }
                });
                _saveSessions();
                
                // 同步到服务器
                final ws = WebSocketService();
                if (ws.isConnected) {
                  ws.sendRequest('sessions.update', {
                    'key': sessionKey,
                    'title': newTitle,
                  });
                }
              }
              Navigator.pop(context);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Constants.primaryColor),
            child: const Text('保存', style: TextStyle(color: Colors.white)),
          ),
        ],
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

        // 获取订阅类型
        final plan = user?.subscription?['plan'] ?? 'free';
        final planNames = {'free': 'FREE', 'lite': 'LITE', 'pro': 'PRO'};
        final badgeText = planNames[plan] ?? 'FREE';

        // 徽章颜色
        Color badgeColor;
        if (plan == 'pro') {
          badgeColor = const Color(0xFFF59E0B); // 金色
        } else if (plan == 'lite') {
          badgeColor = const Color(0xFF3B82F6); // 蓝色
        } else {
          badgeColor = const Color(0xFF6B7280); // 灰色
        }

        return InkWell(
          onTap: () => _showUserMenuBottomSheet(appProvider, isDarkMode),
          child: Container(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                // 头像 + 徽章
                Stack(
                  clipBehavior: Clip.none,
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
                    // 订阅徽章
                    Positioned(
                      bottom: -4,
                      right: -4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                        decoration: BoxDecoration(
                          color: badgeColor,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.white, width: 1.5),
                          boxShadow: [
                            BoxShadow(
                              color: badgeColor.withOpacity(0.3),
                              blurRadius: 4,
                              spreadRadius: 1,
                            ),
                          ],
                        ),
                        child: Text(
                          badgeText,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 8,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    ),
                  ],
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
              leading: Icon(Icons.people_outline, color: textColor),
              title: Text('邀请列表', style: TextStyle(color: textColor)),
              trailing: Text('${appProvider.user?.inviteCount ?? 0} 人', style: TextStyle(color: Colors.grey)),
              onTap: () {
                Navigator.pop(context);
                _showInviteListDialog(appProvider);
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
              leading: Icon(Icons.message_outlined, color: textColor),
              title: Text('飞书配置', style: TextStyle(color: textColor)),
              onTap: () {
                Navigator.pop(context);
                _showFeishuConfigDialog(isDarkMode);
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
    // 确保 myAgents 是 List<String> 类型
    List<String> myAgents = [];
    try {
      final rawAgents = appProvider.user?.agents ?? ['lingxi'];
      myAgents = rawAgents.map((e) => e?.toString() ?? 'lingxi').toList();
    } catch (e) {
      debugPrint('❌ 解析 myAgents 失败: $e');
      myAgents = ['lingxi'];
    }
    
    final allAgents = <String, Map<String, dynamic>>{
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

  // 显示邀请列表弹窗
  void _showInviteListDialog(AppProvider appProvider) {
    final user = appProvider.user;
    final inviteCode = user?.userInviteCode ?? '-';
    final inviteCount = user?.inviteCount ?? 0;
    final earnedPoints = inviteCount * 100;

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.people_outline, color: Constants.primaryColor),
            SizedBox(width: 8),
            Text('邀请好友'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 邀请码
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Constants.primaryColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('我的邀请码', style: TextStyle(color: Colors.grey, fontSize: 12)),
                      const SizedBox(height: 4),
                      Text(
                        inviteCode,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Constants.primaryColor,
                          letterSpacing: 2,
                        ),
                      ),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.copy, color: Constants.primaryColor),
                    onPressed: () {
                      // 复制到剪贴板
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('邀请码已复制')),
                      );
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            // 邀请统计
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildInviteStat(inviteCount.toString(), '已邀请人数'),
                Container(width: 1, height: 40, color: Colors.grey.shade300),
                _buildInviteStat(earnedPoints.toString(), '获得积分'),
              ],
            ),
            const SizedBox(height: 16),
            // 邀请说明
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                '💡 每邀请一位好友注册，即可获得 100 积分奖励',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('关闭'),
          ),
        ],
      ),
    );
  }

  Widget _buildInviteStat(String value, String label) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.bold,
            color: Constants.primaryColor,
          ),
        ),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
      ],
    );
  }

  Future<void> _showPasswordChangeDialog() async {
    final currentPasswordController = TextEditingController();
    final newPasswordController = TextEditingController();
    final confirmPasswordController = TextEditingController();
    bool obscureCurrent = true;
    bool obscureNew = true;
    bool obscureConfirm = true;
    
    await showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) {
          return AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Constants.primaryColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.lock_outline, color: Constants.primaryColor),
                ),
                const SizedBox(width: 12),
                const Text('修改密码', style: TextStyle(fontSize: 18)),
              ],
            ),
            content: SizedBox(
              width: 320,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // 当前密码
                  TextField(
                    controller: currentPasswordController,
                    obscureText: obscureCurrent,
                    decoration: InputDecoration(
                      labelText: '当前密码',
                      prefixIcon: const Icon(Icons.lock_outline, size: 20),
                      suffixIcon: IconButton(
                        icon: Icon(obscureCurrent ? Icons.visibility_off : Icons.visibility, size: 20),
                        onPressed: () => setDialogState(() => obscureCurrent = !obscureCurrent),
                      ),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                      fillColor: Colors.grey.shade50,
                    ),
                  ),
                  const SizedBox(height: 16),
                  // 新密码
                  TextField(
                    controller: newPasswordController,
                    obscureText: obscureNew,
                    decoration: InputDecoration(
                      labelText: '新密码',
                      prefixIcon: const Icon(Icons.vpn_key_outlined, size: 20),
                      suffixIcon: IconButton(
                        icon: Icon(obscureNew ? Icons.visibility_off : Icons.visibility, size: 20),
                        onPressed: () => setDialogState(() => obscureNew = !obscureNew),
                      ),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                      fillColor: Colors.grey.shade50,
                      helperText: '密码长度至少6位',
                    ),
                  ),
                  const SizedBox(height: 16),
                  // 确认密码
                  TextField(
                    controller: confirmPasswordController,
                    obscureText: obscureConfirm,
                    decoration: InputDecoration(
                      labelText: '确认新密码',
                      prefixIcon: const Icon(Icons.check_circle_outline, size: 20),
                      suffixIcon: IconButton(
                        icon: Icon(obscureConfirm ? Icons.visibility_off : Icons.visibility, size: 20),
                        onPressed: () => setDialogState(() => obscureConfirm = !obscureConfirm),
                      ),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                      fillColor: Colors.grey.shade50,
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text('取消', style: TextStyle(color: Colors.grey.shade600)),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Constants.primaryColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                onPressed: () async {
                  if (currentPasswordController.text.isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('请输入当前密码')),
                    );
                    return;
                  }
                  if (newPasswordController.text != confirmPasswordController.text) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('两次密码不一致')),
                    );
                    return;
                  }
                  if (newPasswordController.text.length < 6) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('密码长度至少6位')),
                    );
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
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Row(
                            children: [
                              Icon(Icons.check_circle, color: Colors.white),
                              SizedBox(width: 8),
                              Text('密码修改成功'),
                            ],
                          ),
                          backgroundColor: Colors.green,
                        ),
                      );
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(result['error'] ?? '密码修改失败'),
                          backgroundColor: Colors.red,
                        ),
                      );
                    }
                  } catch (e) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('修改失败: $e'), backgroundColor: Colors.red),
                    );
                  }
                },
                child: const Text('确认修改'),
              ),
            ],
          );
        },
      ),
    );
  }

  // 飞书配置弹窗
  Future<void> _showFeishuConfigDialog(bool isDarkMode) async {
    final textColor = isDarkMode ? Colors.white : Colors.black87;
    final bgColor = isDarkMode ? const Color(0xFF2D2D2D) : Colors.white;
    
    final appIdController = TextEditingController();
    final appSecretController = TextEditingController();
    final verificationController = TextEditingController();
    
    // 加载已有配置
    try {
      final appProvider = Provider.of<AppProvider>(context, listen: false);
      final userId = appProvider.user?.id;
      if (userId != null) {
        final config = await ApiService().getFeishuConfig(userId);
        if (config != null) {
          appIdController.text = config['appId'] ?? '';
          verificationController.text = config['verificationToken'] ?? '';
        }
      }
    } catch (e) {
      debugPrint('加载飞书配置失败: $e');
    }
    
    if (!mounted) return;
    
    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          backgroundColor: bgColor,
          title: Row(
            children: [
              const Icon(Icons.message_outlined, color: Constants.primaryColor),
              const SizedBox(width: 8),
              Text('飞书配置', style: TextStyle(color: textColor)),
            ],
          ),
          content: SingleChildScrollView(
            child: SizedBox(
              width: 350,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // App ID
                  TextField(
                    controller: appIdController,
                    style: TextStyle(color: textColor),
                    decoration: InputDecoration(
                      labelText: 'App ID',
                      hintText: 'cli_xxxxxxxxxxxx',
                      labelStyle: TextStyle(color: Colors.grey.shade600),
                      border: const OutlineInputBorder(),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // App Secret
                  TextField(
                    controller: appSecretController,
                    style: TextStyle(color: textColor),
                    obscureText: true,
                    decoration: InputDecoration(
                      labelText: 'App Secret',
                      hintText: '应用密钥',
                      labelStyle: TextStyle(color: Colors.grey.shade600),
                      border: const OutlineInputBorder(),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // 验证令牌
                  TextField(
                    controller: verificationController,
                    style: TextStyle(color: textColor),
                    decoration: InputDecoration(
                      labelText: '验证令牌（可选）',
                      hintText: '从飞书开放平台事件订阅页获取',
                      labelStyle: TextStyle(color: Colors.grey.shade600),
                      border: const OutlineInputBorder(),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // 说明文字
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: isDarkMode ? Colors.white.withOpacity(0.05) : Colors.grey.shade100,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '配置说明：',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: textColor),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '1. 在飞书开放平台创建企业自建应用\n'
                          '2. 获取 App ID 和 App Secret\n'
                          '3. 配置事件订阅，填写 Webhook 地址\n'
                          '4. 发布应用并授权',
                          style: TextStyle(fontSize: 11, color: Colors.grey.shade600, height: 1.5),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('取消'),
            ),
            ElevatedButton(
              onPressed: () async {
                final appId = appIdController.text.trim();
                final appSecret = appSecretController.text.trim();
                final verification = verificationController.text.trim();
                
                if (appId.isEmpty || appSecret.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('请填写 App ID 和 App Secret')),
                  );
                  return;
                }
                
                try {
                  final appProvider = Provider.of<AppProvider>(context, listen: false);
                  final userId = appProvider.user?.id;
                  if (userId == null) return;
                  
                  await ApiService().saveFeishuConfig(
                    userId: userId,
                    appId: appId,
                    appSecret: appSecret,
                    verificationToken: verification,
                  );
                  
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('飞书配置已保存')),
                  );
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('保存失败: $e')),
                  );
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: Constants.primaryColor),
              child: const Text('保存配置', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showUsageStatsDialog(AppProvider appProvider) async {
    // 先检查 mounted
    if (!mounted) return;
    
    // 显示加载中 - 允许点击外部关闭
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
    
    // 关闭加载中 - 使用 try-catch 确保不会抛出异常
    try {
      if (mounted && Navigator.of(context, rootNavigator: true).canPop()) {
        Navigator.of(context, rootNavigator: true).pop();
      }
    } catch (e) {
      debugPrint('❌ 关闭 loading dialog 失败: $e');
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
                          value: _parsePercent(usageData?['quota']?['percent']),
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
      // 获取当前 agent 名称
      final currentAgentInfo = _agents[_currentAgent];
      final currentAgentName = currentAgentInfo?['name']?.toString() ?? 'AI';
      
      return Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? _buildWelcomeExamples(currentAgentInfo, isDarkMode)
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.only(bottom: 16),
                    // ✅ 问题4：如果正在生成，添加一个额外的"思考中"消息
                    itemCount: _messages.length + (_isGenerating ? 1 : 0),
                    itemBuilder: (context, i) {
                      try {
                        // ✅ 如果是最后一条且正在生成，显示思考中的气泡框
                        if (_isGenerating && i == _messages.length) {
                          return _buildThinkingBubble(isDarkMode, currentAgentInfo);
                        }
                        
                        // 安全获取 agentId，确保是 String 类型
                        final msgAgentId = _messages[i].agentId;
                        final safeAgentId = msgAgentId is String 
                            ? msgAgentId 
                            : msgAgentId != null 
                                ? msgAgentId.toString() 
                                : _currentAgent;
                        
                        return _MessageBubble(
                          content: _messages[i].content,
                          isUser: _messages[i].role == 'user',
                          agentId: safeAgentId,
                          agents: _agents,
                          isDarkMode: isDarkMode,
                          imageUrl: _messages[i].imageUrl,
                          serverIp: _userServerIp,
                          serverPort: _userServerPort,
                          serverToken: _userServerToken,
                        );
                      } catch (e, stack) {
                        debugPrint('❌ 构建 MessageBubble 失败: $e');
                        debugPrint('Stack: $stack');
                        return ListTile(
                          title: Text('消息加载失败'),
                          subtitle: Text(e.toString()),
                        );
                      }
                    },
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
              child: _showVoiceInput 
                  ? _buildVoiceInputArea(isDarkMode)
                  : _buildTextInputArea(isDarkMode),
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

// 图片预览函数（点击放大）
void _showImagePreview(BuildContext context, String imageUrl) {
  showDialog(
    context: context,
    builder: (context) => GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      child: Dialog(
        backgroundColor: Colors.transparent,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 图片
            InteractiveViewer(
              child: imageUrl.startsWith('data:')
                  ? Image.memory(
                      base64Decode(imageUrl.split(',').last),
                      fit: BoxFit.contain,
                    )
                  : Image.network(
                      imageUrl,
                      fit: BoxFit.contain,
                    ),
            ),
            const SizedBox(height: 16),
            // 按钮
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // 下载按钮
                ElevatedButton.icon(
                  onPressed: () async {
                    try {
                      // 使用 url_launcher 打开浏览器下载
                      final uri = Uri.parse(imageUrl);
                      if (await canLaunchUrl(uri)) {
                        await launchUrl(uri, mode: LaunchMode.platformDefault);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('✅ 已在浏览器中打开图片，长按可保存'),
                              backgroundColor: Colors.green,
                            ),
                          );
                        }
                      } else {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('❌ 无法打开图片链接'),
                              backgroundColor: Colors.red,
                            ),
                          );
                        }
                      }
                    } catch (e) {
                      debugPrint('❌ 下载图片失败: $e');
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('下载失败: $e'),
                            backgroundColor: Colors.red,
                          ),
                        );
                      }
                    }
                  },
                  icon: const Icon(Icons.download, size: 18),
                  label: const Text('下载图片'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Constants.primaryColor,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                // 关闭按钮
                TextButton.icon(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close, size: 18),
                  label: const Text('关闭'),
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                      side: const BorderSide(color: Colors.white54),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

class _MessageBubble extends StatelessWidget {
  final String content;
  final bool isUser;
  final String agentId;
  final Map<String, Map<String, dynamic>> agents;
  final bool isDarkMode;
  final String? imageUrl;
  final String? serverIp;
  final int? serverPort;
  final String? serverToken;

  const _MessageBubble({
    required this.content,
    required this.isUser,
    required this.agentId,
    required this.agents,
    this.isDarkMode = false,
    this.imageUrl,
    this.serverIp,
    this.serverPort,
    this.serverToken,
  });

  @override
  Widget build(BuildContext context) {
    final bgColor = isUser
        ? (isDarkMode ? const Color(0xFF444654) : Constants.primaryColor)
        : (isDarkMode ? const Color(0xFF343541) : Colors.grey.shade100);
    final textColor = isDarkMode ? const Color(0xFFECECF1) : (isUser ? Colors.white : Colors.black87);
    final iconColor = isDarkMode ? const Color(0xFF10A37F) : Constants.primaryColor;

    // 安全获取 agent 信息
    final agent = agents[agentId];
    String agentName = 'AI';
    IconData? agentIcon;

    if (agent != null) {
      // 安全获取 name
      final nameValue = agent['name'];
      if (nameValue is String) {
        agentName = nameValue;
      } else if (nameValue != null) {
        agentName = nameValue.toString();
      }
      // 安全获取 icon
      final iconValue = agent['icon'];
      if (iconValue is IconData) {
        agentIcon = iconValue;
      }
    }

    // ✅ 提取 markdown 图片
    final imageRegex = RegExp(r'!\[([^\]]*)\]\(([^)]+)\)');
    final markdownImages = <Map<String, String>>[];
    String displayContent = content;

    for (final match in imageRegex.allMatches(content)) {
      markdownImages.add({
        'alt': match.group(1) ?? '',
        'url': match.group(2) ?? '',
      });
      displayContent = displayContent.replaceAll(match.group(0)!, '');
    }

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
                  if (agentIcon != null) Icon(agentIcon, size: 16, color: iconColor),
                  const SizedBox(width: 4),
                  Text(
                    agentName,
                    style: TextStyle(color: iconColor, fontWeight: FontWeight.bold, fontSize: 12),
                  ),
                ],
              ),
            if (!isUser) const SizedBox(height: 8),
            // 显示用户上传的图片（缩略图）
            if (imageUrl != null && imageUrl!.isNotEmpty)
              GestureDetector(
                onTap: () => _showImagePreview(context, imageUrl!),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: imageUrl!.startsWith('data:')
                      ? Image.memory(
                          base64Decode(imageUrl!.split(',').last),
                          width: 120,
                          height: 120,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(Icons.broken_image, size: 48),
                        )
                      : Image.network(
                          imageUrl!,
                          width: 120,
                          height: 120,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(Icons.broken_image, size: 48),
                        ),
                ),
              ),
            if (imageUrl != null && imageUrl!.isNotEmpty) const SizedBox(height: 8),
            // ✅ 显示 AI 生成的 markdown 图片
            for (final img in markdownImages)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: GestureDetector(
                  onTap: () => _showImagePreview(context, img['url']!),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(
                      img['url']!,
                      width: 250,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        width: 250,
                        height: 150,
                        color: Colors.grey.shade200,
                        child: Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.broken_image, size: 48, color: Colors.grey),
                              const SizedBox(height: 8),
                              Text('图片加载失败', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            // 文件预览
            if (!isUser && displayContent.isNotEmpty)
              FilePreview(
                files: FilePreview.extractFiles(displayContent),
                serverIp: serverIp,
                serverPort: serverPort,
                serverToken: serverToken,
                isDarkMode: isDarkMode,
              ),
            if (displayContent.trim().isNotEmpty)
              // 使用 SelectionArea 支持文本选择和复制
              SelectionArea(
                child: Text(displayContent.trim(), style: TextStyle(color: textColor)),
              ),
          ],
        ),
      ),
    );
  }
}
