import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/models/message.dart';
import 'package:lingxicloud/pages/subscription_page.dart';
import 'package:lingxicloud/pages/skills_page.dart';
import 'package:lingxicloud/pages/lumeclaw_page.dart';
import 'package:lingxicloud/pages/test_page.dart';
import 'package:lingxicloud/pages/login_page.dart';
import 'package:lingxicloud/services/websocket_service.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:lingxicloud/services/notification_service.dart';
import 'package:lingxicloud/widgets/file_preview.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart' as file_picker;  // 🆕 文档选择器（使用别名避免冲突）
import 'package:shared_preferences/shared_preferences.dart';
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';
import 'package:flutter/services.dart';
import 'dart:math' show pow;  // 🆕 导入 pow 函数
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:audioplayers/audioplayers.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';

class ChatPage extends StatefulWidget {
  const ChatPage({super.key});

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> with WidgetsBindingObserver {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  String _currentAgent = 'lingxi';
  bool _wsConnected = false;
  String _wsStatus = '连接中...';
  String _wsError = '';
  List<Message> _messages = [];

  // 🔔 App 生命周期状态（用于判断是否发送通知）
  bool _isAppInBackground = false;
  
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
  String? _pendingFileMimeType;  // 🆕 文件 MIME 类型
  String? _pendingFileType;  // 🆕 文件类型（image 或 document）
  int _pendingFileSize = 0;  // 🆕 文件大小
  List<Map<String, dynamic>> _sessions = [];
  
  // 🆕 用于记录正在加载标题的会话列表（按顺序）
  final List<String> _loadingTitleSessions = [];
  String? _currentSessionKey;
  
  // 会话分组展开/收缩状态
  final Map<String, bool> _sessionGroupExpanded = {
    '今天': true,
    '最近 7 天': true,
    '更早': false,  // 默认收缩
  };

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

    // 🔔 添加生命周期监听器
    WidgetsBinding.instance.addObserver(this);

    // 监听输入框文字变化（用于显示/隐藏发送按钮）
    _controller.addListener(() {
      setState(() {});  // 有文字变化时触发重建
    });

    // 初始化语音识别
    _initSpeech();
    
    // 获取用户服务器信息（用于文件预览）
    _loadUserServerInfo();
    
    // 捕获异步错误
    _loadSessions().catchError((e, stack) {
      debugPrint('❌ 加载会话失败: $e\nStack: $stack');
    });
    
    // ✅ 检查是否是免费用户
    final user = Provider.of<AppProvider>(context, listen: false).user;
    final isFreeUser = user?.subscription?['plan'] == 'free' || user?.subscription?['plan'] == null;
    
    if (isFreeUser) {
      // 免费用户不需要 WebSocket
      debugPrint('📋 免费用户，跳过 WebSocket 初始化');
    } else {
      // 订阅用户：初始化 WebSocket
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
    }
    
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
            
            // 🆕 异步加载会话标题（和 Web 端保持一致）
            _loadSessionTitles(sessions);
          }
          return;
        }
      
      // 处理历史消息响应
      if (data['type'] == 'res' && data['id']?.toString().contains('chat_history') == true) {
        debugPrint('📚 收到历史消息响应：ok=${data['ok']}');
        
        // 🆕 如果是用于加载会话标题的请求，尝试更新会话标题
        if (data['ok'] == true && data['payload'] != null && !_isGenerating && _loadingTitleSessions.isNotEmpty) {
          try {
            final messages = data['payload']?['messages'] as List?;
            if (messages != null && messages.isNotEmpty) {
              final firstMessage = messages.first as Map<String, dynamic>?;
              if (firstMessage != null && firstMessage['role'] == 'user') {
                final content = _extractText(firstMessage) ?? '';
                // 移除附件标记
                final cleanContent = content.replaceAll(RegExp(r'\[附件:[^\]]+\]\s*'), '').trim();
                
                if (cleanContent.isNotEmpty) {
                  final newTitle = cleanContent.length > 50 
                      ? '${cleanContent.substring(0, 50)}...' 
                      : cleanContent;
                  
                  // 🆕 从列表中取出对应的 sessionKey（按顺序）
                  final sessionKey = _loadingTitleSessions.removeAt(0);
                  
                  // 更新对应的会话
                  final index = _sessions.indexWhere((s) => s['key'] == sessionKey);
                  if (index >= 0) {
                    setState(() {
                      _sessions[index]['title'] = newTitle;
                      _sessions[index]['lastMessage'] = cleanContent.length > 100 
                          ? '${cleanContent.substring(0, 100)}...' 
                          : cleanContent;
                    });
                    
                    debugPrint('✅ 自动更新会话标题: $sessionKey → $newTitle');
                  }
                }
              }
            }
          } catch (e) {
            debugPrint('⚠️ 自动更新会话标题失败: $e');
          }
        }
        
        // 如果正在生成消息，不要替换当前消息
        if (_isGenerating) {
          debugPrint('⏳ 正在生成消息，跳过历史消息更新');
          return;
        }
        
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
                  
                  // 🚫 过滤掉工具调用结果和系统消息
                  final role = map['role']?.toString() ?? 'assistant';
                  if (role == 'toolResult' || role == 'system' || role == 'tool') {
                    debugPrint('⏭️ 跳过工具/系统消息: $role');
                    return null;  // 返回 null，稍后过滤掉
                  }
                  
                  // 🚫 过滤掉包含内部标记的内容
                  final content = _extractText(map) ?? map['content']?.toString() ?? '';
                  if (content.contains('<<<EXTERNAL_UNTRUSTED_CONTENT') ||
                      content.contains('<<<END_EXTERNAL_UNTRUSTED_CONTENT') ||
                      content.contains('SECURITY NOTICE:') ||
                      content.contains('EXTERNAL, UNTRUSTED source')) {
                    debugPrint('⏭️ 跳过内部处理信息');
                    return null;
                  }
                  
                  // 🔍 提取图片 URL（从 attachments 或 parts）
                  String? imageUrl;
                  DocumentInfo? documentInfo;
                  final attachments = map['attachments'] as List? ?? map['parts'] as List?;
                  if (attachments != null && attachments.isNotEmpty) {
                    for (final att in attachments) {
                      if (att is Map) {
                        final attType = att['type']?.toString() ?? '';
                        final attMimeType = att['mimeType']?.toString() ?? '';
                        
                        // 🖼️ 图片附件
                        if (attType == 'image' || attType.contains('image') || attMimeType.startsWith('image/')) {
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
                        
                        // 📄 文档附件
                        if (attType == 'document' || (attMimeType.isNotEmpty && !attMimeType.startsWith('image/'))) {
                          final docUrl = att['url']?.toString() ?? att['content']?.toString();
                          if (docUrl != null && docUrl.isNotEmpty) {
                            documentInfo = DocumentInfo(
                              url: docUrl,
                              mimeType: attMimeType.isNotEmpty ? attMimeType : 'application/octet-stream',
                              filename: att['filename']?.toString() ?? 'document',
                            );
                            debugPrint('📄 找到历史文档: ${documentInfo.filename}');
                            break;
                          }
                        }
                      }
                    }
                  }
                  
                  // 🔧 方案 B：从消息文本中提取附件信息（双重保险）
                  final textContent = _extractText(map) ?? '';
                  if (imageUrl == null && documentInfo == null && textContent.isNotEmpty) {
                    final attachmentRegex = RegExp(r'\[附件:(图片|文档):([^:]+):([^\]]+)\]');
                    final match = attachmentRegex.firstMatch(textContent);
                    
                    if (match != null) {
                      final type = match.group(1) ?? '';  // '图片' 或 '文档'
                      final filename = match.group(2) ?? '';
                      final url = match.group(3) ?? '';
                      
                      debugPrint('🔧 从文本中提取附件信息: type=$type, filename=$filename');
                      
                      if (type == '图片') {
                        imageUrl = url;
                        debugPrint('📷 提取到历史图片: $imageUrl');
                      } else if (type == '文档') {
                        // 🎯 根据文件扩展名判断 MIME 类型（支持所有格式）
                        final ext = filename.split('.').last.toLowerCase();
                        final mimeMap = {
                          'pdf': 'application/pdf',
                          'txt': 'text/plain',
                          'md': 'text/markdown',
                          'markdown': 'text/markdown',
                          'html': 'text/html',
                          'htm': 'text/html',
                          'csv': 'text/csv',
                          'json': 'application/json',
                          // Office 文档（新格式）
                          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                          'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                          'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                          // Office 文档（旧格式）
                          'doc': 'application/msword',
                          'xls': 'application/vnd.ms-excel',
                          'ppt': 'application/vnd.ms-powerpoint',
                        };
                        
                        documentInfo = DocumentInfo(
                          url: url,
                          mimeType: mimeMap[ext] ?? 'application/octet-stream',
                          filename: filename,
                        );
                        debugPrint('📄 提取到历史文档: ${documentInfo.filename}');
                      }
                    }
                  }
                  
                  return Message(
                    id: messageId,
                    role: role,
                    content: _extractText(map) ?? _toString(map['content']),
                    createdAt: createdAt,
                    agentId: msgAgentId,
                    imageUrl: imageUrl,  // 👈 添加图片 URL
                    documentInfo: documentInfo,  // 🆕 添加文档信息
                  );
                }).whereType<Message>().toList();  // 🚫 过滤掉 null 值（工具调用结果等）
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
          final audioUrl = payload['audio_url']?.toString();  // 🆕 提取音频 URL
          if (text != null && runId != null && runId.isNotEmpty) {
            setState(() {
              final existingIndex = _messages.indexWhere((m) => m.id == runId);
              if (existingIndex >= 0) {
                _messages[existingIndex] = Message(
                  id: runId,
                  role: 'assistant',
                  content: text,
                  createdAt: DateTime.now(),
                  agentId: _currentAgent,
                  audioUrl: audioUrl,  // 🆕
                );
              } else {
                _messages.add(Message(
                  id: runId,
                  role: 'assistant',
                  content: text,
                  createdAt: DateTime.now(),
                  agentId: _currentAgent,
                  audioUrl: audioUrl,  // 🆕
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

          // 🔔 如果 App 在后台，发送通知
          if (_isAppInBackground) {
            final lastMessage = _messages.isNotEmpty ? _messages.last : null;
            if (lastMessage != null && lastMessage.role == 'assistant') {
              final agentName = _agents[_currentAgent]?['name'] ?? 'AI';
              final content = lastMessage.content;
              // 截取前 100 字符作为通知内容
              final preview = content.length > 100
                  ? '${content.substring(0, 100)}...'
                  : content;

              NotificationService().showNotification(
                id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
                title: '$agentName 的回复',
                body: preview,
                payload: _currentSessionKey,
              );
            }
          }
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
          // 🆕 添加语音标记（触发语音回复）
          _controller.text = '🎤 $text';
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

  // 🆕 异步加载会话标题（和 Web 端保持一致）
  Future<void> _loadSessionTitles(List<dynamic> sessions) async {
    try {
      final ws = WebSocketService();
      if (!ws.isConnected) {
        debugPrint('⚠️ WebSocket 未连接，无法加载会话标题');
        return;
      }
      
      // 🆕 用于存储加载的标题
      final Map<String, String> loadedTitles = {};
      
      // 先显示基本会话列表
      setState(() {
        _sessions = sessions.map((s) {
          final map = s is Map ? s as Map<String, dynamic> : {};
          
          String title = '未命名会话';
          
          // 优先使用已有的 label（如果不是默认值）
          if (map['label'] != null && 
              map['label'].toString().isNotEmpty && 
              map['label'].toString() != '灵犀' &&
              !map['label'].toString().contains('agent:') &&
              !map['label'].toString().contains(RegExp(r'[0-9a-f]{8}-[0-9a-f]{4}'))) {
            title = map['label'].toString();
          } else if (map['title'] != null && 
                     map['title'].toString().isNotEmpty && 
                     map['title'].toString() != '新对话' &&
                     !map['title'].toString().contains(RegExp(r'[0-9a-f]{8}-[0-9a-f]{4}'))) {
            title = map['title'].toString();
          }
          // 🚫 不再使用 session key 的最后一部分（会导致显示 UUID）
          
          // 格式化相对时间
          final timestamp = map['updatedAt'] != null 
              ? (map['updatedAt'] is int 
                  ? map['updatedAt'] as int 
                  : DateTime.tryParse(map['updatedAt'].toString())?.millisecondsSinceEpoch ?? DateTime.now().millisecondsSinceEpoch)
              : DateTime.now().millisecondsSinceEpoch;
          
          return {
            'key': (map['key'] ?? '').toString(),
            'title': title,
            'agentId': map['agentId'] ?? map['agent_id'] ?? 'lingxi',
            'updatedAt': map['updatedAt'],
            'timestamp': timestamp,
            'relativeTime': _formatRelativeTime(timestamp),
            'lastMessage': map['lastMessagePreview'] ?? map['lastMessage'] ?? '暂无消息',
          };
        }).toList();
        
        // 按时间倒序排列
        _sessions.sort((a, b) {
          final timeA = a['timestamp'] as int? ?? 0;
          final timeB = b['timestamp'] as int? ?? 0;
          return timeB.compareTo(timeA);
        });
      });
      
      // 🆕 为前 10 个会话同步加载第一条消息作为标题
      final topSessions = _sessions.take(10).toList();
      for (int i = 0; i < topSessions.length; i++) {
        final session = topSessions[i];
        final sessionKey = session['key'] as String?;
        if (sessionKey == null) continue;
        
        // 如果标题已经是默认值，加载第一条消息
        final currentTitle = session['title'] as String? ?? '';
        if (currentTitle == '未命名会话' || 
            currentTitle == '新对话' ||
            currentTitle.contains('agent:') ||
            currentTitle.contains(RegExp(r'[0-9a-f]{8}-[0-9a-f]{4}'))) {
          
          try {
            // 🆕 记录正在加载的会话（按顺序）
            _loadingTitleSessions.add(sessionKey);
            
            // 发送请求
            ws.sendRequest('chat.history', {
              'sessionKey': sessionKey,
              'limit': 1,
            });
            
            debugPrint('📝 请求加载会话标题: $sessionKey');
            
            // 等待一小段时间让响应到达
            await Future.delayed(const Duration(milliseconds: 200));
            
          } catch (e) {
            debugPrint('⚠️ 加载会话标题失败: $sessionKey, $e');
          }
        }
      }
      
      debugPrint('✅ 会话标题加载完成');
    } catch (e, stack) {
      debugPrint('❌ _loadSessionTitles 异常: $e\nStack: $stack');
    }
  }
  
  // 🆕 格式化相对时间（和 Web 端保持一致）
  String _formatRelativeTime(int timestamp) {
    final now = DateTime.now().millisecondsSinceEpoch;
    final diff = now - timestamp;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return '${(diff / 60000).floor()} 分钟前';
    if (diff < 86400000) return '${(diff / 3600000).floor()} 小时前';
    if (diff < 172800000) return '昨天';
    if (diff < 604800000) return '${(diff / 86400000).floor()} 天前';
    
    // 超过一周，显示绝对时间
    final date = DateTime.fromMillisecondsSinceEpoch(timestamp);
    return '${date.month}月${date.day}日';
  }
  
  void _loadSessionsFromServer() {
    try {
      final ws = WebSocketService();
      if (!ws.isConnected) {
        debugPrint('⚠️ WebSocket 未连接，无法加载会话列表');
        return;
      }
      debugPrint('📋 发送 sessions.list 请求');
      // 🔧 添加 includeDerivedTitles 和 includeLastMessage 参数
      ws.sendRequest('sessions.list', {
        'includeDerivedTitles': true,
        'includeLastMessage': true,
        'limit': 50,  // 限制数量
      });
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

    // 🔔 移除生命周期监听器
    WidgetsBinding.instance.removeObserver(this);

    try {
      WebSocketService().clearListeners();
      debugPrint('✅ WebSocket 监听器已清理');
    } catch (e) {
      debugPrint('❌ 清理 WebSocket 监听器失败: $e');
    }
    super.dispose();
  }

  // 🔔 监听 App 生命周期状态变化
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);

    switch (state) {
      case AppLifecycleState.resumed:
        // App 回到前台
        debugPrint('📱 App 回到前台');
        _isAppInBackground = false;
        break;
      case AppLifecycleState.paused:
        // App 进入后台
        debugPrint('📱 App 进入后台');
        _isAppInBackground = true;
        break;
      case AppLifecycleState.inactive:
        // App 不活跃（例如来电、分屏）
        debugPrint('📱 App 不活跃');
        break;
      case AppLifecycleState.detached:
        // App 分离（例如关闭）
        debugPrint('📱 App 分离');
        break;
      case AppLifecycleState.hidden:
        // App 隐藏
        debugPrint('📱 App 隐藏');
        break;
    }
  }

  // 选择文件并上传到服务器（支持图片和文档）
  Future<void> _selectFile(file_picker.PlatformFile file) async {
    try {
      // 🆕 检查文件类型
      final fileName = file.name;
      final fileExtension = fileName.split('.').last.toLowerCase();
      final fileSize = file.size;
      
      // 🎯 定义支持的文档类型
      const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
      const docExtensions = [
        'pdf', 'txt', 'md', 'html', 'csv', 'json',
        // Office 文档（新格式）
        'docx', 'xlsx', 'pptx',
        // Office 文档（旧格式）
        'doc', 'xls', 'ppt',
      ];
      
      final isImage = imageExtensions.contains(fileExtension);
      final isDocument = docExtensions.contains(fileExtension);
      
      if (!isImage && !isDocument) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('不支持的文件类型: .$fileExtension\n\n支持的格式：\n• 图片：JPG, PNG, GIF, WebP\n• 文档：PDF, TXT, MD, HTML, CSV, JSON'),
            duration: const Duration(seconds: 3),
          ),
        );
        return;
      }
      
      // 📏 检查文件大小
      final maxSize = isDocument ? 5 * 1024 * 1024 : 10 * 1024 * 1024;  // 文档 5MB，图片 10MB
      final maxSizeText = isDocument ? '5MB' : '10MB';
      
      if (fileSize > maxSize) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${isDocument ? '文档' : '图片'}大小不能超过 $maxSizeText\n\n当前文件大小：${(fileSize / 1024 / 1024).toStringAsFixed(2)}MB'),
            duration: const Duration(seconds: 3),
          ),
        );
        return;
      }
      
      // 🎨 显示上传中提示
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              const SizedBox(width: 12),
              Text('正在上传${isDocument ? '文档' : '图片'}... ${(fileSize / 1024).toStringAsFixed(1)}KB'),
            ],
          ),
          duration: const Duration(minutes: 1),
        ),
      );
      
      // 1. 图片压缩（仅图片）
      File uploadFile = File(file.path!);
      
      if (isImage && fileSize > 200 * 1024) {
        debugPrint('🔄 图片大于 200KB，开始压缩: ${(fileSize / 1024).toStringAsFixed(1)}KB');
        
        final compressedPath = file.path!.replaceAll(
          RegExp(r'\.[^.]+$'),
          '_compressed.jpg',
        );
        
        final compressedFile = await FlutterImageCompress.compressAndGetFile(
          file.path!,
          compressedPath,
          quality: 80,
          minWidth: 1024,
          minHeight: 1024,
        );
        
        if (compressedFile != null) {
          uploadFile = File(compressedFile.path);
          final compressedSize = await uploadFile.length();
          debugPrint('✅ 压缩完成: ${(compressedSize / 1024).toStringAsFixed(1)}KB');
        }
      }
      
      // 2. 上传到服务器
      final apiUrl = '${Constants.baseUrl}/api/upload/image';
      final request = http.MultipartRequest('POST', Uri.parse(apiUrl));
      
      // 👈 读取文件并明确指定 MIME 类型
      String mimeType;
      if (isDocument) {
        // 文档 MIME 类型
        final docMimeTypes = {
          'pdf': 'application/pdf',
          'txt': 'text/plain',
          'md': 'text/markdown',
          'html': 'text/html',
          'csv': 'text/csv',
          'json': 'application/json',
        };
        mimeType = docMimeTypes[fileExtension] ?? 'application/octet-stream';
      } else {
        // 图片 MIME 类型
        mimeType = fileExtension == 'png' ? 'image/png' : 'image/jpeg';
      }
      
      final fileBytes = await uploadFile.readAsBytes();
      
      request.files.add(
        http.MultipartFile.fromBytes(
          'file',
          fileBytes,
          filename: fileName,
          contentType: MediaType.parse(mimeType),
        ),
      );
      
      debugPrint('📤 上传${isDocument ? '文档' : '图片'}: $fileName, MIME: $mimeType, 大小: ${(fileSize / 1024).toStringAsFixed(1)}KB');
      
      final response = await request.send();
      final responseText = await response.stream.bytesToString();
      
      debugPrint('📥 服务器响应: $responseText');
      
      // 隐藏上传中提示
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      
      final responseData = jsonDecode(responseText);
      
      if (responseData['success'] == true) {
        final fileUrl = responseData['url'] as String;
        final returnedMimeType = responseData['mimeType'] as String?;
        final returnedType = responseData['type'] as String?;
        
        // 存储文件 URL
        setState(() {
          _pendingImageUrl = fileUrl;
          _pendingImageName = fileName;
          // 🆕 存储文档信息
          _pendingFileMimeType = returnedMimeType ?? mimeType;
          _pendingFileType = returnedType ?? (isDocument ? 'document' : 'image');
        });
        
        debugPrint('✅ ${isDocument ? '文档' : '图片'}已上传: $fileUrl');
        
        // 🎉 显示成功提示
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${isDocument ? '📄 文档' : '📷 图片'}已添加: $fileName'),
            duration: const Duration(seconds: 2),
            action: SnackBarAction(
              label: '撤销',
              onPressed: _clearPendingImage,
            ),
          ),
        );
      } else {
        throw Exception(responseData['error'] ?? '上传失败');
      }
    } catch (e) {
      // 隐藏上传中提示
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      
      debugPrint('❌ 文件处理失败: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('上传失败: $e'),
          duration: const Duration(seconds: 3),
        ),
      );
    }
  }

  // 清除待发送的文件（图片或文档）
  void _clearPendingImage() {
    setState(() {
      _pendingImageUrl = null;
      _pendingImageName = null;
      _pendingFileMimeType = null;
      _pendingFileType = null;
    });
  }
  
  // 🎨 构建文件预览（图片或文档图标）
  Widget _buildFilePreview(bool isDarkMode) {
    if (_pendingFileType == 'document') {
      // 🎨 文档预览：显示美观的卡片
      return _buildDocumentCard();
    } else {
      // 图片预览：显示图片
      return Image.network(
        _pendingImageUrl!,
        height: 80,
        width: 80,
        fit: BoxFit.cover,
      );
    }
  }
  
  // 🎨 构建文档预览卡片
  Widget _buildDocumentCard() {
    final mimeType = _pendingFileMimeType ?? '';
    final filename = _pendingImageName ?? 'document';
    final fileSize = _pendingFileSize ?? 0;
    
    // 获取文档类型配置
    final config = _getDocumentConfig(mimeType, filename);
    
    return Container(
      width: 120,
      height: 120,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: config['gradientColors'] as List<Color>,
        ),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.15),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Stack(
        children: [
          // 类型徽章
          Positioned(
            top: 8,
            right: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.95),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                config['type'] as String,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: config['accentColor'] as Color,
                ),
              ),
            ),
          ),
          // 内容
          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // 图标
                Text(
                  config['icon'] as String,
                  style: const TextStyle(fontSize: 40),
                ),
                const SizedBox(height: 8),
                // 文件名
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Text(
                    filename.length > 20 ? '${filename.substring(0, 20)}...' : filename,
                    style: const TextStyle(
                      fontSize: 11,
                      color: Colors.white,
                    ),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                // 文件大小
                if (fileSize > 0) ...[
                  const SizedBox(height: 4),
                  Text(
                    _formatFileSize(fileSize),
                    style: TextStyle(
                      fontSize: 9,
                      color: Colors.white.withOpacity(0.8),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
  
  // 🎨 获取文档类型配置
  Map<String, dynamic> _getDocumentConfig(String mimeType, String filename) {
    final configs = {
      'application/pdf': {
        'type': 'PDF',
        'icon': 'PDF',
        'gradientColors': [const Color(0xFFFF5252), const Color(0xFFFF8A80)],
        'accentColor': const Color(0xFFFF5252),
      },
      'text/markdown': {
        'type': 'MD',
        'icon': 'MD',
        'gradientColors': [const Color(0xFF4CAF50), const Color(0xFF81C784)],
        'accentColor': const Color(0xFF4CAF50),
      },
      'text/html': {
        'type': 'HTML',
        'icon': '<>',
        'gradientColors': [const Color(0xFFFF9800), const Color(0xFFFFB74D)],
        'accentColor': const Color(0xFFFF9800),
      },
      'text/csv': {
        'type': 'CSV',
        'icon': 'CSV',
        'gradientColors': [const Color(0xFF2196F3), const Color(0xFF64B5F6)],
        'accentColor': const Color(0xFF2196F3),
      },
      'application/json': {
        'type': 'JSON',
        'icon': '{ }',
        'gradientColors': [const Color(0xFF9C27B0), const Color(0xFFBA68C8)],
        'accentColor': const Color(0xFF9C27B0),
      },
      'text/plain': {
        'type': 'TXT',
        'icon': 'TXT',
        'gradientColors': [const Color(0xFF757575), const Color(0xFF9E9E9E)],
        'accentColor': const Color(0xFF757575),
      },
      // Office 文档（新格式）
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        'type': 'DOCX',
        'icon': 'W',
        'gradientColors': [const Color(0xFF2196F3), const Color(0xFF42A5F5)],
        'accentColor': const Color(0xFF1565C0),
      },
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        'type': 'XLSX',
        'icon': 'X',
        'gradientColors': [const Color(0xFF4CAF50), const Color(0xFF66BB6A)],
        'accentColor': const Color(0xFF2E7D32),
      },
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
        'type': 'PPTX',
        'icon': 'P',
        'gradientColors': [const Color(0xFFFF9800), const Color(0xFFFFA726)],
        'accentColor': const Color(0xFFE65100),
      },
      // Office 文档（旧格式）
      'application/msword': {
        'type': 'DOC',
        'icon': 'W',
        'gradientColors': [const Color(0xFF2196F3), const Color(0xFF42A5F5)],
        'accentColor': const Color(0xFF1565C0),
      },
      'application/vnd.ms-excel': {
        'type': 'XLS',
        'icon': 'X',
        'gradientColors': [const Color(0xFF4CAF50), const Color(0xFF66BB6A)],
        'accentColor': const Color(0xFF2E7D32),
      },
      'application/vnd.ms-powerpoint': {
        'type': 'PPT',
        'icon': 'P',
        'gradientColors': [const Color(0xFFFF9800), const Color(0xFFFFA726)],
        'accentColor': const Color(0xFFE65100),
      },
    };
    
    // 检查文件扩展名
    if (filename.endsWith('.md')) {
      return configs['text/markdown']!;
    }
    
    return configs[mimeType] ?? {
      'type': 'FILE',
      'icon': '📎',
      'gradientColors': [const Color(0xFF667eea), const Color(0xFF764ba2)],
      'accentColor': const Color(0xFF667eea),
    };
  }
  
  // 📏 格式化文件大小
  String _formatFileSize(int bytes) {
    if (bytes == 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    final i = (bytes / k).toStringAsFixed(0).length ~/ 3;
    final index = i.clamp(0, sizes.length - 1);
    
    return '${(bytes / pow(k, index)).toStringAsFixed(2)} ${sizes[index]}';
  }
  
  // 📷 从 XFile（ImagePicker）创建 PlatformFile 并上传
  Future<void> _selectImageFromXFile(XFile file) async {
    final platformFile = file_picker.PlatformFile(
      name: file.name,
      size: await file.length(),
      path: file.path,
    );
    await _selectFile(platformFile);
  }
  
  // 🎨 根据文档类型获取图标
  IconData _getDocumentIcon() {
    final mimeType = _pendingFileMimeType ?? '';
    
    if (mimeType == 'application/pdf') {
      return Icons.picture_as_pdf;
    } else if (mimeType == 'text/markdown' || _pendingImageName?.endsWith('.md') == true) {
      return Icons.description;
    } else if (mimeType == 'text/html') {
      return Icons.code;
    } else if (mimeType == 'text/csv') {
      return Icons.table_chart;
    } else if (mimeType == 'application/json') {
      return Icons.data_object;
    } else {
      return Icons.insert_drive_file;
    }
  }
  
  // 🎨 根据文档类型获取颜色
  Color _getDocumentColor() {
    final mimeType = _pendingFileMimeType ?? '';
    
    if (mimeType == 'application/pdf') {
      return Colors.red.shade400;
    } else if (mimeType == 'text/markdown' || _pendingImageName?.endsWith('.md') == true) {
      return Colors.green.shade400;
    } else if (mimeType == 'text/html') {
      return Colors.orange.shade400;
    } else if (mimeType == 'text/csv') {
      return Colors.blue.shade400;
    } else if (mimeType == 'application/json') {
      return Colors.purple.shade400;
    } else {
      return Colors.grey.shade600;
    }
  }

  /// 免费用户发送消息（HTTP API）
  Future<void> _sendMessageForFreeUser(String text, bool hasImage) async {
    final user = Provider.of<AppProvider>(context, listen: false).user;
    final userId = user?.id;
    
    if (userId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('未登录，请重新登录')),
      );
      return;
    }
    
    // 清空输入框
    _controller.clear();
    
    // 🎨 区分图片和文档
    DocumentInfo? docInfo;
    String? imageUrl;
    
    if (hasImage) {
      if (_pendingFileType == 'document') {
        // 文档类型：创建 DocumentInfo
        docInfo = DocumentInfo(
          url: _pendingImageUrl!,
          mimeType: _pendingFileMimeType ?? 'application/octet-stream',
          filename: _pendingImageName ?? 'document',
        );
      } else {
        // 图片类型：设置 imageUrl
        imageUrl = _pendingImageUrl;
      }
    }
    
    // 构建用户消息
    final userMessage = Message(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: 'user',
      content: text,
      imageUrl: imageUrl,  // 仅图片
      documentInfo: docInfo,  // 🆕 文档信息
      createdAt: DateTime.now(),
      agentId: 'lingxi',
    );
    
    setState(() {
      _messages.add(userMessage);
      _isGenerating = true;
      _pendingImageUrl = null;
      _pendingImageName = null;
    });
    
    _scrollToBottom();
    
    try {
      final response = await ApiService().post(
        '/api/chat/simple',
        data: {
          'userId': userId,
          'message': text.isNotEmpty ? text : '请识别这张图片',
          'imageUrl': hasImage ? userMessage.imageUrl : null,
        },
      );
      
      final data = response.data;
      
      if (mounted) {
        if (data['success'] == true || data['response'] != null) {
          final responseText = data['response'] ?? data['message'] ?? '收到~';
          
          setState(() {
            _messages.add(Message(
              id: DateTime.now().millisecondsSinceEpoch.toString(),
              role: 'assistant',
              content: responseText,
              createdAt: DateTime.now(),
              agentId: 'lingxi',
            ));
            _isGenerating = false;
          });
          _scrollToBottom();
        } else {
          // 显示错误
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(data['error'] ?? '发送失败')),
          );
          setState(() {
            _isGenerating = false;
          });
        }
      }
    } catch (e) {
      debugPrint('❌ 免费用户发送消息失败: $e');
      if (mounted) {
        setState(() {
          _isGenerating = false;
          _messages.add(Message(
            id: DateTime.now().millisecondsSinceEpoch.toString(),
            role: 'assistant',
            content: '网络错误: $e',
            createdAt: DateTime.now(),
            agentId: 'lingxi',
          ));
        });
        _scrollToBottom();
      }
    }
  }

  void _sendMessage() {
    final text = _controller.text.trim();
    final hasImage = _pendingImageUrl != null;
    
    // 如果没有文字也没有图片，不发送
    if (text.isEmpty && !hasImage) return;
    if (_isGenerating) return;
    
    // ✅ 检查是否是免费用户
    final user = Provider.of<AppProvider>(context, listen: false).user;
    final isFreeUser = user?.subscription?['plan'] == 'free' || user?.subscription?['plan'] == null;
    
    if (isFreeUser) {
      // 免费用户：使用 HTTP API 调用
      _sendMessageForFreeUser(text, hasImage);
      return;
    }
    
    // ✅ 订阅用户：WebSocket 逻辑
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
    
    // 🎨 区分图片和文档
    DocumentInfo? docInfo;
    String? imageUrl;
    
    if (hasImage) {
      if (_pendingFileType == 'document') {
        // 文档类型：创建 DocumentInfo
        docInfo = DocumentInfo(
          url: _pendingImageUrl!,
          mimeType: _pendingFileMimeType ?? 'application/octet-stream',
          filename: _pendingImageName ?? 'document',
        );
      } else {
        // 图片类型：设置 imageUrl
        imageUrl = _pendingImageUrl;
      }
    }
    
    // 构建用户消息
    final userMessage = Message(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: 'user',
      content: text,
      imageUrl: imageUrl,  // 仅图片
      documentInfo: docInfo,  // 🆕 文档信息
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
    
    // 如果有文件（图片或文档），添加 attachments
    if (hasImage && _pendingImageUrl != null) {
      final attachmentType = _pendingFileType ?? 'image';
      final mimeType = _pendingFileMimeType ?? 'image/jpeg';
      
      params['attachments'] = [
        {
          'type': attachmentType,  // 'image' 或 'document'
          'url': _pendingImageUrl,
          'mimeType': mimeType,
          'filename': _pendingImageName ?? 'attachment',
        }
      ];
      debugPrint('📎 发送带${attachmentType == 'document' ? '文档' : '图片'}的消息: $_pendingImageUrl ($mimeType)');
    }
    
    debugPrint('📤 发送消息: sessionKey=$targetSessionKey, message=${text.substring(0, text.length > 50 ? 50 : text.length)}');
    debugPrint('📤 完整参数: $params');
    ws.sendRequest('chat.send', params);
    
    // 🆕 自动更新 session label（如果是第一条消息或有意义的消息）
    if (_currentSessionKey != null && text.isNotEmpty) {
      final currentSession = _sessions.firstWhere(
        (s) => s['key'] == _currentSessionKey,
        orElse: () => <String, dynamic>{},
      );
      
      if (currentSession.isNotEmpty) {
        final currentTitle = currentSession['title'] as String? ?? '';
        
        // 如果标题是默认值，更新为当前消息
        if (currentTitle == '新对话' || 
            currentTitle == '未命名会话' ||
            currentTitle == '灵犀' ||
            currentTitle.contains('agent:') ||
            currentTitle.contains('chat_')) {
          
          // 移除附件标记
          final cleanText = text.replaceAll(RegExp(r'\[附件:[^\]]+\]\s*'), '').trim();
          final newTitle = cleanText.length > 50 
              ? '${cleanText.substring(0, 50)}...' 
              : cleanText;
          
          debugPrint('📝 更新 session label: $_currentSessionKey → $newTitle');
          
          // 发送更新请求
          ws.sendRequest('sessions.update', {
            'sessionKey': _currentSessionKey,
            'label': newTitle,
          });
          
          // 更新本地缓存
          setState(() {
            final index = _sessions.indexWhere((s) => s['key'] == _currentSessionKey);
            if (index >= 0) {
              _sessions[index]['title'] = newTitle;
              _sessions[index]['label'] = newTitle;
            }
          });
        }
      }
    }
    
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
    return _errorWrapper(
      Scaffold(
        key: _scaffoldKey,
        appBar: _buildAppBar(isWide),
        drawer: isWide ? null : Drawer(child: _buildSidebar(isDarkMode)),
        body: Row(
          children: [
            if (isWide) _buildSidebar(isDarkMode),
            Expanded(child: _buildMainContent()),
          ],
        ),
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
    final appProvider = Provider.of<AppProvider>(context, listen: false);
    final user = appProvider.user;
    // 免费用户判断：plan 为 'free' 或 null
    final isFreeUser = user?.subscription?['plan'] == 'free' || user?.subscription?['plan'] == null;
    final validAgent = _agents.containsKey(_currentAgent) ? _currentAgent : _agents.keys.first;
    final currentAgentData = _agents[validAgent];
    
    // 拼接 Agent 列表（免费用户只能选择 'lingxi'）
    final availableAgents = isFreeUser
        ? {'lingxi': _agents['lingxi']!}
        : _agents;
    
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 8),
      child: DropdownButton<String>(
        value: validAgent,
        underline: const SizedBox(),
        // 自定义当前选中的显示
        selectedItemBuilder: (context) => availableAgents.entries.map((e) {
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
        items: availableAgents.entries.map((e) {
          final agent = e.value;
          final name = _toString(agent['name']);
          final icon = agent['icon'] as IconData?;
          final role = _toString(agent['role']);
          final isLocked = isFreeUser && e.key != 'lingxi';
          
          return DropdownMenuItem(
            value: e.key,
            child: Row(
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 18, color: Constants.primaryColor),
                  const SizedBox(width: 8),
                ],
                Text(name),
                if (isLocked) ...[
                  const SizedBox(width: 8),
                  Icon(Icons.lock, size: 14, color: Colors.grey),
                ],
                const SizedBox(width: 8),
                Text('($role)', style: const TextStyle(fontSize: 10, color: Colors.grey)),
              ],
            ),
          );
        }).toList(),
        onChanged: (v) {
          if (v != null && availableAgents.containsKey(v) && v != _currentAgent) {
            // 切换Agent时，如果有消息，保存当前会话并创建新会话
            if (_messages.isNotEmpty) {
              _saveCurrentSession();
            }
            setState(() {
              _currentAgent = v;
              _messages = [];  // 清空消息，开始新会话
            });
          } else if (v != null && !availableAgents.containsKey(v)) {
            // 选中被锁定的 Agent，弹出升级提示
            _showUpgradeDialog();
          }
        },
      ),
    );
  }
  
  // 升级提示对话框
  void _showUpgradeDialog() {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('解锁 AI 团队'),
        content: const Text('订阅后可以使用完整的 8 位 Agent 团队'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('稍后再说'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              // 直接跳转到订阅页面
              Navigator.push(
                dialogContext,
                MaterialPageRoute(builder: (_) => const SubscriptionPage()),
              );
            },
            child: const Text('立即订阅'),
          ),
        ],
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
            // 停止按钮
            const SizedBox(height: 12),
            GestureDetector(
              onTap: _abortChat,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.red.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.red.withOpacity(0.3)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.stop, size: 16, color: Colors.red.shade400),
                    const SizedBox(width: 4),
                    Text(
                      '停止生成',
                      style: TextStyle(color: Colors.red.shade400, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // 构建文本输入区域（豆包风格布局）
  Widget _buildTextInputArea(bool isDarkMode) {
    final hasText = _controller.text.isNotEmpty;  // 检测输入框是否有文字

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
                // 文件预览（图片或文档图标）
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: _buildFilePreview(isDarkMode),
                ),
                const SizedBox(width: 8),
                // 文件信息
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _pendingImageName ?? '文件',
                        style: TextStyle(
                          color: isDarkMode ? Colors.white70 : Colors.black54,
                          fontSize: 12,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _pendingFileType == 'document' ? '点击发送按钮上传文档' : '点击发送按钮上传',
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
        // 输入行（豆包风格：左相机，右麦克风+上传，有文字显示发送）
        Row(
          children: [
            // 左边：相机图标
            IconButton(
              icon: Icon(
                Icons.camera_alt_outlined,
                color: isDarkMode ? const Color(0xFFECECF1) : Colors.grey.shade700,
              ),
              onPressed: () async {
                final picker = ImagePicker();
                final XFile? file = await picker.pickImage(source: ImageSource.camera);
                if (file != null) {
                  await _selectImageFromXFile(file);
                }
              },
            ),
            // 中间：输入框
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
            // 右边：麦克风 + 上传文件（或发送/停止按钮）
            if (_isGenerating)
              // AI 正在生成时：显示停止按钮
              IconButton(
                icon: const Icon(
                  Icons.stop,
                  color: Colors.red,
                  size: 28,
                ),
                onPressed: _abortChat,
                tooltip: '停止生成',
              )
            else if (hasText || _pendingImageUrl != null)
              // 有文字或图片时：显示发送按钮（绿色箭头）
              IconButton(
                icon: Icon(
                  Icons.send,
                  color: Constants.primaryColor,
                ),
                onPressed: _sendMessage,
              )
            else
              // 没有文字时：显示麦克风 + 上传图标
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // 语音输入按钮
                  IconButton(
                    icon: Icon(
                      Icons.mic,
                      color: isDarkMode ? const Color(0xFFECECF1) : Colors.grey.shade700,
                    ),
                    onPressed: _speechEnabled
                        ? () {
                            setState(() {
                              _showVoiceInput = true;
                            });
                          }
                        : null,
                  ),
                  // 上传文件按钮（支持图片和文档）
                  IconButton(
                    icon: Icon(
                      Icons.attach_file,
                      color: isDarkMode ? const Color(0xFFECECF1) : Colors.grey.shade700,
                    ),
                    onPressed: () async {
                      // 🆕 使用 FilePicker 支持图片和文档
                      final result = await file_picker.FilePicker.platform.pickFiles(
                        type: file_picker.FileType.custom,
                        allowedExtensions: [
                          // 图片
                          'jpg', 'jpeg', 'png', 'gif', 'webp',
                          // 文档
                          'pdf', 'txt', 'md', 'html', 'csv', 'json',
                        ],
                        allowCompression: false,  // 禁用自动压缩
                      );
                      
                      if (result != null && result.files.isNotEmpty) {
                        final file = result.files.first;
                        await _selectFile(file);
                      }
                    },
                  ),
                ],
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
          _buildToolItem(Icons.people_outline, _getTeamMenuTitle(), _getTeamMenuAction(), isDarkMode),
          
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
    final isExpanded = _sessionGroupExpanded[title] ?? true;
    final displaySessions = isExpanded ? sessions : sessions.take(3).toList();
    final hasMore = sessions.length > 3;
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 分组标题（可点击展开/收缩）
        InkWell(
          onTap: () {
            setState(() {
              _sessionGroupExpanded[title] = !isExpanded;
            });
          },
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 12, 8, 4),
            child: Row(
              children: [
                Icon(
                  isExpanded ? Icons.expand_more : Icons.chevron_right,
                  size: 16,
                  color: subTextColor,
                ),
                const SizedBox(width: 4),
                Text(
                  '$title (${sessions.length})',
                  style: TextStyle(color: subTextColor, fontSize: 12, fontWeight: FontWeight.w500),
                ),
              ],
            ),
          ),
        ),
        // 会话列表
        ...displaySessions.map((session) => _buildSessionItem(session, isDarkMode)),
        // "显示更多" 按钮
        if (hasMore && !isExpanded)
          InkWell(
            onTap: () {
              setState(() {
                _sessionGroupExpanded[title] = true;
              });
            },
            child: Padding(
              padding: const EdgeInsets.fromLTRB(32, 4, 8, 8),
              child: Text(
                '显示更多 (${sessions.length - 3})',
                style: TextStyle(color: Colors.blue.shade400, fontSize: 12),
              ),
            ),
          ),
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
    final subTextColor = isDarkMode ? Colors.white54 : Colors.black54;
    final iconColor = isDarkMode ? Colors.white54 : Colors.black45;
    
    // 获取会话的Agent图标
    final sessionAgentId = session['agentId']?.toString() ?? 'lingxi';
    final agentIcon = _agents[sessionAgentId]?['icon'] as IconData? ?? Icons.chat_outlined;
    
    // 🆕 获取标题、时间和预览
    final title = session['title']?.toString() ?? '未命名会话';
    final relativeTime = session['relativeTime']?.toString() ?? '';
    final lastMessage = session['lastMessage']?.toString() ?? '暂无消息';
    final preview = lastMessage.length > 40 ? '${lastMessage.substring(0, 40)}...' : lastMessage;
    
    return Container(
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        dense: true,
        leading: Icon(agentIcon, color: iconColor, size: 18),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(color: textColor, fontSize: 14),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              '$relativeTime · $preview',
              style: TextStyle(color: subTextColor, fontSize: 11),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
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
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.7,
      ),
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // 常用功能
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
              ListTile(
                leading: Icon(Icons.extension_outlined, color: textColor),
                title: Text('技能库', style: TextStyle(color: textColor)),
                onTap: () async {
                  Navigator.pop(context);
                  Navigator.pop(context);
                  await Navigator.push(context, MaterialPageRoute(builder: (_) => const SkillsPage()));
                },
              ),
              const Divider(height: 1),
              // 高级功能
              ListTile(
                leading: Icon(Icons.build_outlined, color: textColor),
                title: Text('LumeClaw', style: TextStyle(color: textColor)),
                onTap: () async {
                  Navigator.pop(context);
                  Navigator.pop(context);
                  await Navigator.push(context, MaterialPageRoute(builder: (_) => const LumeClawPage()));
                },
              ),
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
              const Divider(height: 1),
              // 退出登录（始终可见）
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

  // 获取侧边栏菜单标题
  String _getTeamMenuTitle() {
    final appProvider = Provider.of<AppProvider>(context, listen: false);
    final user = appProvider.user;
    
    // 免费用户显示"领取AI团队"
    final plan = user?.subscription?['plan'] ?? 'free';
    if (plan == 'free') {
      return '领取AI团队';
    }
    
    // 订阅用户根据是否有团队显示不同内容
    if (user?.agents.isEmpty ?? true) {
      return '领取AI团队';
    }
    
    return '我的团队';
  }

  // 获取侧边栏菜单点击操作
  void Function() _getTeamMenuAction() {
    final appProvider = Provider.of<AppProvider>(context, listen: false);
    final user = appProvider.user;
    
    // 免费用户点击显示AI团队介绍
    final plan = user?.subscription?['plan'] ?? 'free';
    if (plan == 'free') {
      return () => _showAITeamIntroDialog(appProvider);
    }
    
    // 订阅用户根据是否有团队显示不同内容
    if (user?.agents.isEmpty ?? true) {
      return () => _showAITeamIntroDialog(appProvider);
    }
    
    return () => _showTeamDialog();
  }

  // 显示AI团队介绍对话框
  void _showAITeamIntroDialog(AppProvider appProvider) {
    final allAgents = <String, Map<String, dynamic>>{
      'lingxi': {
        'name': '灵犀',
        'icon': Icons.auto_awesome,
        'role': '队长 · 智能调度',
        'desc': '作为团队队长，灵犀负责智能调度和任务分配，能够根据任务类型自动指派给合适的团队成员。',
        'examples': ['帮我安排明天的日程', '提醒我下午3点开会', '这个任务应该派给谁？'],
      },
      'coder': {
        'name': '云溪',
        'icon': Icons.code,
        'role': '编程开发',
        'desc': '擅长各种编程语言的代码生成和审查，能快速实现你的功能需求并优化现有代码。',
        'examples': ['帮我写一个 Python 爬虫', '这段代码有什么问题？', '设计一个用户登录 API'],
      },
      'ops': {
        'name': '若曦',
        'icon': Icons.bar_chart,
        'role': '数据分析',
        'desc': '精通数据分析和可视化，能帮你快速分析数据并生成专业的分析报告。',
        'examples': ['分析最近一周的销售数据', '生成月度报表', '预测下季度趋势'],
      },
      'inventor': {
        'name': '紫萱',
        'icon': Icons.lightbulb,
        'role': '创意发明',
        'desc': '拥有丰富的创意和发明能力，能帮你把想法转化为具体的方案和设计。',
        'examples': ['设计一个智能家居系统', '创新产品构思', '专利申请指导'],
      },
      'pm': {
        'name': '梓萱',
        'icon': Icons.track_changes,
        'role': '产品经理',
        'desc': '精通产品设计和需求分析，能帮你完善产品功能和用户界面设计。',
        'examples': ['设计用户注册流程', '编写产品需求文档', '优化用户体验'],
      },
      'noter': {
        'name': '晓琳',
        'icon': Icons.note,
        'role': '笔记整理',
        'desc': '擅长内容整理和知识管理，能帮你快速整理会议记录和学习笔记。',
        'examples': ['整理会议纪要', '总结学习笔记', '归档文档资料'],
      },
      'media': {
        'name': '音韵',
        'icon': Icons.palette,
        'role': '媒体设计',
        'desc': '精通各种媒体设计工具，能帮你快速制作高质量的设计素材。',
        'examples': ['设计宣传海报', '制作视频脚本', '配色方案建议'],
      },
      'smart': {
        'name': '智家',
        'icon': Icons.home,
        'role': '智能家居',
        'desc': '擅长智能家居和生活助手场景，能帮你打造高效的智能生活体验。',
        'examples': ['自动化场景设置', '智能家居控制', '生活小贴士'],
      },
    };

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Row(
            children: [
              const Icon(Icons.people_outline, color: Constants.primaryColor),
              const SizedBox(width: 8),
              const Text('AI 团队介绍'),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '升级订阅后即可领取完整的 AI 团队，每个 Agent 都有独特的技能和专长：',
                  style: TextStyle(fontSize: 14),
                ),
                const SizedBox(height: 16),
                ...allAgents.entries.map((entry) {
                  final agent = entry.value;
                  return Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: Constants.primaryColor.withOpacity(0.1),
                        child: Icon(agent['icon'] as IconData, color: Constants.primaryColor, size: 24),
                      ),
                      title: Text(agent['name'] as String, style: const TextStyle(fontWeight: FontWeight.bold)),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(agent['role'] as String, style: const TextStyle(fontSize: 12)),
                          const SizedBox(height: 4),
                          Text(
                            agent['desc'] as String,
                            style: const TextStyle(fontSize: 12, color: Colors.grey),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  );
                }),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('取消'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('请先订阅后领取 AI 团队')),
                );
              },
              style: ElevatedButton.styleFrom(backgroundColor: Constants.primaryColor),
              child: const Text('领取'),
            ),
          ],
        ),
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
    final appProvider = Provider.of<AppProvider>(context, listen: false);
    final user = appProvider.user;
    final isFreeUser = user?.subscription?['plan'] == 'free' || user?.subscription?['plan'] == null;
    final isDarkMode = appProvider.isDarkMode;
    
    try {
      // 获取当前 agent 名称
      final currentAgentInfo = _agents[_currentAgent];
      final currentAgentName = currentAgentInfo?['name']?.toString() ?? 'AI';
      
      return Column(
        children: [
          // 顶部升级提示条（仅免费用户显示）
          if (isFreeUser) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              color: const Color(0xFFEAB308),
              child: GestureDetector(
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SubscriptionPage())),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.star, size: 16, color: Colors.white),
                    const SizedBox(width: 8),
                    const Text(
                      '订阅解锁完整 AI 团队 →',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
          Expanded(
            child: _messages.isEmpty
                ? _buildWelcomeExamples(currentAgentInfo, isDarkMode)
                : Column(
                    children: [
                      // 刷新按钮栏
                      if (_messages.isNotEmpty)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                '${_messages.length} 条消息',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isDarkMode ? Colors.white54 : Colors.grey,
                                ),
                              ),
                              Row(
                                children: [
                                  // 刷新按钮
                                  TextButton.icon(
                                    onPressed: _isGenerating ? null : () {
                                      if (_currentSessionKey != null) {
                                        _loadMessageHistory(_currentSessionKey!);
                                        ScaffoldMessenger.of(context).showSnackBar(
                                          const SnackBar(
                                            content: Text('正在刷新消息...'),
                                            duration: Duration(seconds: 1),
                                          ),
                                        );
                                      } else {
                                        ScaffoldMessenger.of(context).showSnackBar(
                                          const SnackBar(
                                            content: Text('新对话暂无历史消息'),
                                            duration: Duration(seconds: 1),
                                          ),
                                        );
                                      }
                                    },
                                    icon: Icon(
                                      Icons.refresh,
                                      size: 16,
                                      color: _isGenerating 
                                        ? (isDarkMode ? Colors.white24 : Colors.grey.shade400)
                                        : Constants.primaryColor,
                                    ),
                                    label: Text(
                                      '刷新',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: _isGenerating 
                                          ? (isDarkMode ? Colors.white24 : Colors.grey.shade400)
                                          : Constants.primaryColor,
                                      ),
                                    ),
                                  ),
                                  // 清空按钮
                                  if (!_isGenerating)
                                    TextButton.icon(
                                      onPressed: () {
                                        showDialog(
                                          context: context,
                                          builder: (ctx) => AlertDialog(
                                            title: const Text('清空对话'),
                                            content: const Text('确定要清空当前对话吗？'),
                                            actions: [
                                              TextButton(
                                                onPressed: () => Navigator.pop(ctx),
                                                child: const Text('取消'),
                                              ),
                                              TextButton(
                                                onPressed: () {
                                                  Navigator.pop(ctx);
                                                  setState(() {
                                                    _messages.clear();
                                                  });
                                                },
                                                child: const Text('确定', style: TextStyle(color: Colors.red)),
                                              ),
                                            ],
                                          ),
                                        );
                                      },
                                      icon: Icon(Icons.delete_outline, size: 16, color: Colors.red.shade400),
                                      label: Text('清空', style: TextStyle(fontSize: 12, color: Colors.red.shade400)),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      // 消息列表
                      Expanded(
                        child: ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.only(bottom: 16),
                          itemCount: _messages.length + (_isGenerating ? 1 : 0),
                          itemBuilder: (context, i) {
                            try {
                              if (_isGenerating && i == _messages.length) {
                                return _buildThinkingBubble(isDarkMode, currentAgentInfo);
                              }
                              
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
                                audioUrl: _messages[i].audioUrl,
                                documentInfo: _messages[i].documentInfo,  // 🆕 传递文档信息
                                serverIp: _userServerIp,
                                serverPort: _userServerPort,
                                serverToken: _userServerToken,
                              );
                            } catch (e, stack) {
                              debugPrint('❌ 构建 MessageBubble 失败: $e');
                              return ListTile(
                                title: const Text('消息加载失败'),
                                subtitle: Text(e.toString()),
                              );
                            }
                          },
                        ),
                      ),
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
  final String? audioUrl;
  final DocumentInfo? documentInfo;  // 🆕 文档信息
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
    this.audioUrl,
    this.documentInfo,  // 🆕
    this.serverIp,
    this.serverPort,
    this.serverToken,
  });

  // 提取音频文件路径
  static List<String> extractAudioFiles(String text) {
    final regex = RegExp(r'MEDIA:([^\s\n]+)');
    return regex.allMatches(text).map((m) => m.group(1)!).toList();
  }
  
  // 🆕 构建历史文档卡片
  static Widget _buildHistoryDocumentCard(DocumentInfo doc, bool isDarkMode) {
    final config = _getDocumentConfig(doc.mimeType, doc.filename);
    
    return Container(
      width: 120,
      height: 120,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: config['gradientColors'] as List<Color>,
        ),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.15),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Stack(
        children: [
          // 类型徽章
          Positioned(
            top: 8,
            right: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.95),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                config['type'] as String,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: config['accentColor'] as Color,
                ),
              ),
            ),
          ),
          // 内容
          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // 图标
                Text(
                  config['icon'] as String,
                  style: const TextStyle(fontSize: 40),
                ),
                const SizedBox(height: 8),
                // 文件名
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Text(
                    doc.filename.length > 20 ? '${doc.filename.substring(0, 20)}...' : doc.filename,
                    style: const TextStyle(
                      fontSize: 11,
                      color: Colors.white,
                    ),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
  
  // 🆕 获取文档类型配置
  static Map<String, dynamic> _getDocumentConfig(String mimeType, String filename) {
    final configs = {
      'application/pdf': {
        'type': 'PDF',
        'icon': 'PDF',
        'gradientColors': [const Color(0xFFFF5252), const Color(0xFFFF8A80)],
        'accentColor': const Color(0xFFFF5252),
      },
      'text/markdown': {
        'type': 'MD',
        'icon': 'MD',
        'gradientColors': [const Color(0xFF4CAF50), const Color(0xFF81C784)],
        'accentColor': const Color(0xFF4CAF50),
      },
      'text/html': {
        'type': 'HTML',
        'icon': '<>',
        'gradientColors': [const Color(0xFFFF9800), const Color(0xFFFFB74D)],
        'accentColor': const Color(0xFFFF9800),
      },
      'text/csv': {
        'type': 'CSV',
        'icon': 'CSV',
        'gradientColors': [const Color(0xFF2196F3), const Color(0xFF64B5F6)],
        'accentColor': const Color(0xFF2196F3),
      },
      'application/json': {
        'type': 'JSON',
        'icon': '{ }',
        'gradientColors': [const Color(0xFF9C27B0), const Color(0xFFBA68C8)],
        'accentColor': const Color(0xFF9C27B0),
      },
      'text/plain': {
        'type': 'TXT',
        'icon': 'TXT',
        'gradientColors': [const Color(0xFF757575), const Color(0xFF9E9E9E)],
        'accentColor': const Color(0xFF757575),
      },
      // Office 文档（新格式）
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        'type': 'DOCX',
        'icon': 'W',
        'gradientColors': [const Color(0xFF2196F3), const Color(0xFF42A5F5)],
        'accentColor': const Color(0xFF1565C0),
      },
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        'type': 'XLSX',
        'icon': 'X',
        'gradientColors': [const Color(0xFF4CAF50), const Color(0xFF66BB6A)],
        'accentColor': const Color(0xFF2E7D32),
      },
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
        'type': 'PPTX',
        'icon': 'P',
        'gradientColors': [const Color(0xFFFF9800), const Color(0xFFFFA726)],
        'accentColor': const Color(0xFFE65100),
      },
      // Office 文档（旧格式）
      'application/msword': {
        'type': 'DOC',
        'icon': 'W',
        'gradientColors': [const Color(0xFF2196F3), const Color(0xFF42A5F5)],
        'accentColor': const Color(0xFF1565C0),
      },
      'application/vnd.ms-excel': {
        'type': 'XLS',
        'icon': 'X',
        'gradientColors': [const Color(0xFF4CAF50), const Color(0xFF66BB6A)],
        'accentColor': const Color(0xFF2E7D32),
      },
      'application/vnd.ms-powerpoint': {
        'type': 'PPT',
        'icon': 'P',
        'gradientColors': [const Color(0xFFFF9800), const Color(0xFFFFA726)],
        'accentColor': const Color(0xFFE65100),
      },
    };
    
    // 检查文件扩展名
    if (filename.endsWith('.md')) {
      return configs['text/markdown']!;
    }
    
    return configs[mimeType] ?? {
      'type': 'FILE',
      'icon': '📎',
      'gradientColors': [const Color(0xFF667eea), const Color(0xFF764ba2)],
      'accentColor': const Color(0xFF667eea),
    };
  }

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
    
    // ✅ 提取音频文件
    final audioFiles = extractAudioFiles(displayContent);
    for (final audio in audioFiles) {
      displayContent = displayContent.replaceAll('MEDIA:$audio', '');
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
            // 🆕 显示用户上传的文档
            if (documentInfo != null)
              _buildHistoryDocumentCard(documentInfo!, isDarkMode),
            if (documentInfo != null) const SizedBox(height: 8),
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
            // ✅ 显示音频播放按钮
            for (final audioPath in audioFiles)
              _AudioPlayerWidget(
                audioPath: audioPath,
                serverIp: serverIp,
                serverPort: serverPort,
                serverToken: serverToken,
                isDarkMode: isDarkMode,
              ),
            // 🆕 显示自动生成的语音（audioUrl）
            if (audioUrl != null && audioUrl!.isNotEmpty)
              _AudioPlayerWidget(
                audioPath: audioUrl!,
                serverIp: serverIp,
                serverPort: serverPort,
                serverToken: serverToken,
                isDarkMode: isDarkMode,
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

// ✅ 音频播放组件
class _AudioPlayerWidget extends StatefulWidget {
  final String audioPath;
  final String? serverIp;
  final int? serverPort;
  final String? serverToken;
  final bool isDarkMode;

  const _AudioPlayerWidget({
    required this.audioPath,
    this.serverIp,
    this.serverPort,
    this.serverToken,
    this.isDarkMode = false,
  });

  @override
  State<_AudioPlayerWidget> createState() => _AudioPlayerWidgetState();
}

class _AudioPlayerWidgetState extends State<_AudioPlayerWidget> {
  bool _isPlaying = false;
  bool _isLoading = false;
  String? _error;
  Duration _duration = Duration.zero;
  Duration _position = Duration.zero;
  
  // 单例音频播放器
  static final AudioPlayer _audioPlayer = AudioPlayer();
  
  // 格式化时间为 mm:ss
  String _formatDuration(Duration duration) {
    final minutes = duration.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = duration.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }
  
  String get _audioUrl {
    // 构建音频 URL
    if (widget.audioPath.startsWith('http')) {
      return widget.audioPath;
    }
    
    // 如果有用户服务器信息，使用用户的 file-server (端口 9876)
    if (widget.serverIp != null && widget.serverIp!.isNotEmpty) {
      // 文件路径如 /tmp/openclaw/tts-xxx/voice.mp3 或 /root/.openclaw/tts-xxx/voice.mp3
      final port = widget.serverPort ?? 9876;
      final token = widget.serverToken ?? '';
      debugPrint('🔊 使用用户服务器: ${widget.serverIp}:$port');
      return 'http://${widget.serverIp}:$port/preview?path=${Uri.encodeComponent(widget.audioPath)}&token=$token';
    }
    
    // 否则使用灵犀云后端的 TTS 代理 API（主服务器）
    // 尝试多个可能的文件服务器
    const backendIp = '120.55.192.144';
    const backendPort = 3000;
    
    debugPrint('🔊 使用主服务器代理: $backendIp:$backendPort');
    return 'http://$backendIp:$backendPort/api/files/tts?path=${Uri.encodeComponent(widget.audioPath)}';
  }

  @override
  void initState() {
    super.initState();
    
    // 监听播放完成
    _audioPlayer.onPlayerComplete.listen((_) {
      if (mounted) {
        setState(() {
          _isPlaying = false;
          _position = Duration.zero;
        });
      }
    });
    
    // 监听音频时长
    _audioPlayer.onDurationChanged.listen((duration) {
      if (mounted) {
        setState(() => _duration = duration);
      }
    });
    
    // 监听播放进度
    _audioPlayer.onPositionChanged.listen((position) {
      if (mounted) {
        setState(() => _position = position);
      }
    });
    
    // 监听播放错误
    _audioPlayer.onLog.listen((msg) {
      debugPrint('🔊 AudioPlayer log: $msg');
    });
  }

  Future<void> _togglePlay() async {
    if (_isPlaying) {
      await _audioPlayer.stop();
      setState(() => _isPlaying = false);
    } else {
      setState(() {
        _isLoading = true;
        _error = null;
      });
      
      try {
        debugPrint('🔊 播放音频: $_audioUrl');
        
        // 设置音频源
        await _audioPlayer.setSource(UrlSource(_audioUrl));
        
        // 播放
        await _audioPlayer.resume();
        
        setState(() {
          _isPlaying = true;
          _isLoading = false;
        });
      } catch (e) {
        debugPrint('❌ 播放失败: $e');
        setState(() {
          _isLoading = false;
          _error = '播放失败: ${e.toString().split('\n').first}';
          _isPlaying = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bgColor = widget.isDarkMode ? const Color(0xFF424454) : Colors.grey.shade200;
    final iconColor = widget.isDarkMode ? const Color(0xFF10A37F) : Constants.primaryColor;
    
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // 播放/停止按钮
          GestureDetector(
            onTap: _isLoading ? null : _togglePlay,
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: iconColor,
                shape: BoxShape.circle,
              ),
              child: _isLoading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Icon(
                      _isPlaying ? Icons.stop : Icons.play_arrow,
                      color: Colors.white,
                      size: 20,
                    ),
            ),
          ),
          const SizedBox(width: 12),
          // 音频信息和进度
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '语音消息',
                        style: TextStyle(
                          color: widget.isDarkMode ? const Color(0xFFECECF1) : Colors.black87,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    // 时间显示
                    Text(
                      '${_formatDuration(_position)} / ${_formatDuration(_duration)}',
                      style: TextStyle(
                        color: widget.isDarkMode ? Colors.white70 : Colors.black54,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
                // 进度条
                if (_duration.inSeconds > 0)
                  Container(
                    height: 3,
                    margin: const EdgeInsets.only(top: 4),
                    decoration: BoxDecoration(
                      color: widget.isDarkMode ? Colors.white24 : Colors.black12,
                      borderRadius: BorderRadius.circular(2),
                    ),
                    child: FractionallySizedBox(
                      alignment: Alignment.centerLeft,
                      widthFactor: _position.inMilliseconds / _duration.inMilliseconds,
                      child: Container(
                        decoration: BoxDecoration(
                          color: iconColor,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                  ),
                // 错误信息
                if (_error != null)
                  Text(
                    _error!,
                    style: const TextStyle(color: Colors.red, fontSize: 10),
                  ),
              ],
            ),
          ),
          if (_isPlaying) ...[
            const SizedBox(width: 12),
            // 播放动画
            const SizedBox(
              width: 24,
              height: 16,
              child: _AudioWaveAnimation(),
            ),
          ],
        ],
      ),
    );
  }
}

// 音频波形动画
class _AudioWaveAnimation extends StatefulWidget {
  const _AudioWaveAnimation();

  @override
  State<_AudioWaveAnimation> createState() => _AudioWaveAnimationState();
}

class _AudioWaveAnimationState extends State<_AudioWaveAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 500),
      vsync: this,
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: List.generate(3, (i) {
            return Container(
              width: 3,
              height: 8 + (_controller.value * 8),
              decoration: BoxDecoration(
                color: Constants.primaryColor,
                borderRadius: BorderRadius.circular(2),
              ),
            );
          }),
        );
      },
    );
  }
}
