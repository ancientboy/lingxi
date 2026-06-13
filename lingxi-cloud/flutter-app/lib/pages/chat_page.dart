import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/models/message.dart';
import 'package:lingxicloud/pages/subscription_page.dart';
import 'package:lingxicloud/pages/skills_page.dart';
import 'package:lingxicloud/pages/lumeclaw_page.dart';
import 'package:lingxicloud/pages/test_page.dart';
import 'package:lingxicloud/pages/login_page.dart';
import 'package:lingxicloud/pages/workspace_page.dart';
import 'package:lingxicloud/pages/file_explorer_page.dart';
import 'package:lingxicloud/services/websocket_service.dart';
import 'package:lingxicloud/services/lume_websocket_service.dart';
import 'package:lingxicloud/services/rpc_ws.dart';
import 'package:lingxicloud/services/device_switch_manager.dart';
import 'package:lingxicloud/services/session_repository.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:lingxicloud/services/notification_service.dart';
import 'package:lingxicloud/widgets/message_bubble.dart';
import 'package:lingxicloud/widgets/chat_misc_widgets.dart';
import 'package:lingxicloud/widgets/model_selector.dart';
import 'package:lingxicloud/widgets/voice_input_section.dart';
import 'package:lingxicloud/widgets/chat_dialogs.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:file_picker/file_picker.dart' as file_picker;  // 🆕 文档选择器（使用别名避免冲突）
import 'package:shared_preferences/shared_preferences.dart';
import 'package:lingxicloud/services/database_service.dart';
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';
import 'package:flutter/services.dart';
import 'dart:math' show pow;  // 🆕 导入 pow 函数
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui';

class ChatPage extends StatefulWidget {
  final void Function(void Function(String, String, String) useSkill)? onRegisterUseSkill;
  final void Function(void Function(VoidCallback switchToSkillsTab))? onRegisterOpenSkills;
  const ChatPage({super.key, this.onRegisterUseSkill, this.onRegisterOpenSkills});

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> with WidgetsBindingObserver {
  final _controller = TextEditingController();
  void Function(Map<String, dynamic>)? _wsListener;  // WebSocket listener 引用
  final _scrollController = ScrollController();
  bool _showScrollToBottom = false;
  
  // 🆕 技能 tags 管理
  final List<SkillTag> _skillTags = [];
  static const int _maxSkillTags = 3;
  
  // 🆕 在 initState 里添加滚动监听（初始化在 initState 中执行）
  void _initScrollListener() {
    _scrollController.addListener(() {
      // 滚到顶部时加载更早消息
      if (!_scrollController.hasClients) return;
      if (_scrollController.position.pixels <= 50 && 
          !_isLoadingOlderMessages && 
          _hasMoreOlderMessages && 
          _currentSessionKey != null &&
          _canUseWsRpc) {
        _loadOlderMessages();
      }
      // 🆕 滚动到底部按钮显示逻辑
      final show = _scrollController.hasClients &&
          _scrollController.position.maxScrollExtent - _scrollController.offset > 200;
      if (show != _showScrollToBottom) {
        setState(() {
          _showScrollToBottom = show;
        });
      }
    });
  }
  
  // 🆕 加载更早的消息
  void _loadOlderMessages() {
    if (_isLoadingOlderMessages || !_hasMoreOlderMessages || _messages.isEmpty) return;
    
    setState(() {
      _isLoadingOlderMessages = true;
    });
    
    _ensureWsListener();
    // 用最早一条消息的 createdAt 作为游标
    final oldestMsg = _messages.first;
    
    debugPrint('📜 加载更早消息，当前 ${_messages.length} 条');
    
    _rpcWs().sendRequest('chat.history', {
      'sessionKey': _currentSessionKey!,
      'limit': 40,  // 多拉一些，过滤掉已有的
    });
    
    // 用特殊标记区分"加载更早"和"普通加载"
    _loadingOlderSessionKey = _currentSessionKey;
  }
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  String _currentAgent = 'lingxi';
  bool _wsConnected = false;
  bool _lumeTestEnabled = false;
  bool _lumeConnected = false;
  String _lumeStatus = '未启用';
  void Function(Map<String, dynamic>)? _lumeListener;
  String _wsStatus = '连接中...';
  String _wsError = '';
  List<Message> _messages = [];

  // 🆕 技能 tag 方法（供 MainShell 调用）
  void useSkill(String skillId, String skillName, String example) {
    _addSkillTag(skillId, skillName);
    if (example.isNotEmpty) {
      _controller.text = example;
    }
    setState(() {});
  }

  void _addSkillTag(String id, String name) {
    // 去重：已存在则不重复添加
    if (_skillTags.any((t) => t.id == id)) return;
    // 超过上限，移除最早的
    while (_skillTags.length >= _maxSkillTags) {
      _skillTags.removeAt(0);
    }
    _skillTags.add(SkillTag(id: id, name: name));
  }

  void _removeSkillTag(String id) {
    setState(() {
      _skillTags.removeWhere((t) => t.id == id);
    });
  }

  void _clearSkillTags() {
    _skillTags.clear();
  }

  // 🔔 App 生命周期状态（用于判断是否发送通知）
  bool _isAppInBackground = false;
  
  // 💾 本地消息缓存
  bool _isRestoringFromCache = false;  // 标记正在从缓存恢复，避免触发不必要的保存
  String? _incrementalHistorySessionKey;  // 增量模式标记：收到历史消息时做合并而非替换
  String? _lastHistoryRequestSessionKey;
  bool _replaceSessionsOnNextParse = false;  // 设备切换后 sessions.list 全量替换
  String? _trackedServerId;  // 当前 ChatPage 绑定的设备 ID
  int _lastDeviceSwitchGeneration = 0;
  bool _isApplyingDeviceSwitch = false;
  bool _deviceSwitchLoading = false;
  VoidCallback _switchToSkillsTab = () {};
  Timer? _gatewaySessionDeferTimer;  // 等待 Lume 连接后再降级 Gateway 拉会话
  // 🔒 竞态保护：记录最后一次发出的历史请求 sessionKey
  bool _isLoadingOlderMessages = false;   // 正在加载更早消息
  bool _hasMoreOlderMessages = true;      // 是否还有更早的消息可加载
  String? _loadingOlderSessionKey;        // 标记正在加载更早消息的 session
  
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
  
  String? _currentSessionKey;
  String? _selectedModel = 'auto';
  bool _showModelDropdown = false;
  
  // 模型列表（从 API 动态加载，fallback 用硬编码）
  List<Map<String, String>> _models = [];

  // 最小 fallback（仅 auto，模型列表应由 API 加载）
  static const List<Map<String, String>> _fallbackModels = [
    {'id': 'auto', 'name': 'Auto', 'desc': '智能选择最优模型', 'tier': 'free'},
  ];
  
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
    
    // 🆕 注册 useSkill 回调给 MainShell
    widget.onRegisterUseSkill?.call(useSkill);
    widget.onRegisterOpenSkills?.call((fn) => _switchToSkillsTab = fn);
    
    _lastDeviceSwitchGeneration =
        Provider.of<AppProvider>(context, listen: false).deviceSwitchGeneration;
    _getCurrentServerId().then((id) => _trackedServerId = id);

    // 🆕 初始化滚动监听
    _initScrollListener();

    // 🔔 添加生命周期监听器
    WidgetsBinding.instance.addObserver(this);

    // 监听输入框文字变化（用于显示/隐藏发送按钮）
    _controller.addListener(() {
      if (!mounted) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() {});
      });
    });

    // 初始化语音识别
    _initSpeech();
    
    // 获取用户服务器信息（用于文件预览）
    _loadUserServerInfo();
    
    // 加载模型偏好
    _loadModelPreference();

    // 从 API 加载模型列表（与 Web 版对齐）
    _loadModelsFromApi();
    
    // 💾 启动时序列化初始化（避免 _checkDeviceSwitch 和 _restoreLastSession 竞态）
    _initSequence();
    
    // 捕获异步错误
    _loadSessions().catchError((e, stack) {
      debugPrint('❌ 加载会话失败: $e\nStack: $stack');
    });
    
    final user = Provider.of<AppProvider>(context, listen: false).user;
    final isFreeUser = user?.subscription?['plan'] == 'free' || user?.subscription?['plan'] == null;

    if (isFreeUser) {
      debugPrint('📋 免费用户，跳过 Gateway WebSocket');
    } else {
      Future.microtask(() async {
        try {
          debugPrint('📋 初始化连接（Lume 优先，失败再降级 Gateway）');
          WebSocketService().clearListeners();
          await _loadLumeTestPref();
          _initLumeWebSocket();
        } catch (e, stack) {
          debugPrint('❌ WebSocket 初始化异常: $e\nStack: $stack');
          if (mounted) setState(() { _wsStatus = '连接初始化失败'; _wsError = e.toString(); });
        }
      });
    }

    Provider.of<AppProvider>(context, listen: false).addListener(_onAppProviderUpdate);

    debugPrint('📋 ChatPage initState 完成');
  }



  /// OpenClaw 合法 sessionKey 必须以 agent:main: 开头

  bool get _lumeReady => LumeWebSocketService().isConnected;

  /// 历史/会话优先走 Lume 插件，否则降级 Gateway
  dynamic _rpcWs() {
    final lume = LumeWebSocketService();
    if (lume.isConnected) return lume;
    return WebSocketService();
  }

  bool get _canUseWsRpc {
    final lume = LumeWebSocketService();
    final gw = WebSocketService();
    return lume.isConnected || gw.isConnected;
  }

  bool _isValidSessionKey(String? key) {
    return key != null && key.isNotEmpty && key.startsWith('agent:main:');
  }

  /// 解析发送用的 sessionKey，拒绝 agent:lingxi 这类残缺 key

  String? _resolveSessionPrefix() {
    final ws = WebSocketService();
    final lume = LumeWebSocketService();
    return lume.isConnected ? (lume.sessionPrefix ?? ws.sessionPrefix) : ws.sessionPrefix;
  }

  String? _resolveTargetSessionKey(WebSocketService ws) {
    final lume = LumeWebSocketService();
    final prefix = lume.isConnected ? (lume.sessionPrefix ?? ws.sessionPrefix) : ws.sessionPrefix;
    if (prefix == null || prefix.isEmpty) {
      debugPrint('❌ sessionPrefix 未就绪，请等待 Gateway 连接完成');
      return null;
    }
    if (_isValidSessionKey(_currentSessionKey)) {
      return _currentSessionKey;
    }
    if (_currentSessionKey != null && _currentSessionKey!.isNotEmpty) {
      debugPrint('⚠️ 忽略无效 sessionKey: $_currentSessionKey');
    }
    final resolved = '$prefix:agent:$_currentAgent';
    debugPrint('🔑 使用规范 sessionKey: $resolved');
    return resolved;
  }

  bool _isPaidUser(dynamic user) {
    if (user == null) return false;
    final sub = user.subscription as Map<String, dynamic>?;
    final plan = sub?['plan']?.toString() ?? user.subscriptionPlan?.toString();
    if (plan == null || plan.isEmpty || plan == 'free') return false;
    if (sub == null) return plan != 'free';
    final status = sub['status']?.toString();
    final endDate = sub['endDate'];
    if (status == 'active') return true;
    if (endDate != null) {
      try { return DateTime.parse(endDate.toString()).isAfter(DateTime.now()); } catch (_) {}
    }
    return true;
  }

  Future<void> _loadLumeTestPref() async {
    final prefs = await SharedPreferences.getInstance();
    _lumeTestEnabled = prefs.getBool(Constants.storageLumeTestMode) ?? false;
  }

  Future<void> _setLumeTestEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(Constants.storageLumeTestMode, enabled);
    setState(() => _lumeTestEnabled = enabled);
    if (enabled && _isPaidUser(Provider.of<AppProvider>(context, listen: false).user)) {
      _initLumeWebSocket();
    } else if (!enabled) {
      if (_lumeListener != null) {
        LumeWebSocketService().removeListener(_lumeListener!);
        _lumeListener = null;
      }
      LumeWebSocketService().disconnect();
      setState(() { _lumeConnected = false; _lumeStatus = '未启用'; });
    }
  }

  void _onAppProviderUpdate() {
    if (!mounted) return;
    final app = Provider.of<AppProvider>(context, listen: false);
    if (app.deviceSwitchGeneration != _lastDeviceSwitchGeneration) {
      _lastDeviceSwitchGeneration = app.deviceSwitchGeneration;
      _applyDeviceSwitch();
      return;
    }
    final user = app.user;
    final isFreeUser = user?.subscription?['plan'] == 'free' || user?.subscription?['plan'] == null;
    if (isFreeUser) return;
    if (!_isPaidUser(user)) return;
    final lume = LumeWebSocketService();
    if (!lume.isConnected && !lume.isConnecting) {
      _initLumeWebSocket();
      return;
    }
    if (!_lumeReady) {
      final ws = WebSocketService();
      if (!ws.isConnected && !ws.isConnecting) {
        _ensureGatewayFallback(reason: '重连');
      }
    }
  }

  /// 序列化初始化：device check → route args → restore session → load local
  Future<void> _initSequence() async {
    // 检查路由参数（从 side_menu 跳转过来切换会话）
    final args = ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
    if (args?['switchToSession'] != null) {
      _currentSessionKey = args!['switchToSession'] as String;
      debugPrint('📋 路由参数指定会话: $_currentSessionKey');
      await _loadMessagesLocal(_currentSessionKey);
      if (!mounted) return;
    }
    
    await _checkDeviceSwitch();
    if (!mounted) return;
    _trackedServerId ??= await _getCurrentServerId();
    await _restoreLastSession();
    if (!mounted) return;
    _loadSessionsLocal();
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

  // 💾 保存消息到本地缓存（按服务器 IP 分开存）
  bool _isSavingMessages = false;
  
  Future<void> _saveMessagesLocal() async {
    if (_isRestoringFromCache || _isSavingMessages) return;
    if (_messages.isEmpty || _currentSessionKey == null) return;
    _isSavingMessages = true;
    try {
      final serverId = await _getCurrentServerId();
      final msgs = _messages.map((m) => {
        'id': m.id,
        'role': m.role,
        'content': m.content,
        'createdAt': m.createdAt.millisecondsSinceEpoch,
        'agentId': m.agentId,
        'imageUrl': m.imageUrl,
        'audioUrl': m.audioUrl,
        'documentInfo': m.documentInfo?.toJson(),
        'modelInfo': m.modelInfo,
      }).toList();
      await DatabaseService.upsertMessages(
        serverId: serverId,
        sessionKey: _currentSessionKey!,
        messages: msgs,
      );
      // 保存最后活跃会话
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('last_active_session_$serverId', _currentSessionKey!);
      await prefs.setString('last_active_agent_$serverId', _currentAgent);
    } catch (e) {
      debugPrint('❌ 保存消息失败: $e');
    } finally {
      _isSavingMessages = false;
    }
  }
  
  // 💾 获取当前服务器标识（用于按设备隔离缓存）
  Future<String> _getCurrentServerId() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      // 优先用设备页写入的活跃设备 ID（按设备隔离本地缓存）
      final activeId = prefs.getString('active_server_id');
      if (activeId != null && activeId.isNotEmpty) return activeId;
      final activeIp = prefs.getString('active_server_ip');
      if (activeIp != null && activeIp.isNotEmpty) {
        return activeIp.replaceAll('.', '_');
      }
      // 兜底：从 Gateway WS URL 提取（跳过统一代理域名）
      final ws = WebSocketService();
      final wsUrl = ws.getDebugInfo()['wsUrl']?.toString() ?? '';
      if (wsUrl.isNotEmpty) {
        final uri = Uri.tryParse(wsUrl);
        if (uri != null && uri.host.isNotEmpty && uri.host != 'lumeword.cn') {
          return uri.host.replaceAll('.', '_');
        }
      }
      final token = prefs.getString(Constants.storageAccessToken);
      if (token != null) return 'user_${token.hashCode.abs()}';
    } catch (e) {
      debugPrint('❌ 获取服务器标识失败: $e');
    }
    return 'default';
  }
  
  // 💾 从本地数据库加载消息（按服务器隔离）
  Future<bool> _loadMessagesLocal(String? sessionKey) async {
    if (sessionKey == null || sessionKey.isEmpty) return false;
    try {
      final serverId = await _getCurrentServerId();
      
      // 1. 先尝试从 SQLite 读取
      final rows = await DatabaseService.loadMessages(
        serverId: serverId,
        sessionKey: sessionKey,
        limit: 200,
      );
      
      if (rows.isNotEmpty) {
        _isRestoringFromCache = true;
        setState(() {
          _messages = rows.map((m) => Message.fromJson(m)).toList();
        });
        _isRestoringFromCache = false;
        debugPrint('💾 从数据库恢复了 ${_messages.length} 条消息 (session: $sessionKey)');
        _scrollToBottom();
        return true;
      }
      
      // 2. SQLite 没有 → 尝试从旧 SharedPreferences 迁移
      final prefs = await SharedPreferences.getInstance();
      final cacheKey = 'msg_cache_${serverId}_${sessionKey}';
      final jsonStr = prefs.getString(cacheKey);
      if (jsonStr != null && jsonStr.isNotEmpty) {
        debugPrint('🔄 从旧缓存迁移数据到 SQLite...');
        final List<dynamic> jsonData = jsonDecode(jsonStr);
        if (jsonData.isNotEmpty) {
          final msgs = jsonData.cast<Map<String, dynamic>>();
          // 写入 SQLite
          await DatabaseService.upsertMessages(
            serverId: serverId,
            sessionKey: sessionKey,
            messages: msgs,
          );
          // 清除旧缓存
          await prefs.remove(cacheKey);
          debugPrint('✅ 迁移了 ${msgs.length} 条消息到 SQLite');
          
          _isRestoringFromCache = true;
          setState(() {
            _messages = msgs.map((m) => Message.fromJson(m)).toList();
          });
          _isRestoringFromCache = false;
          _scrollToBottom();
          return true;
        }
      }
      
      return false;
    } catch (e) {
      _isRestoringFromCache = false;
      debugPrint('❌ 加载消息失败: $e');
      return false;
    }
  }
  
  // 💾 清除指定会话的本地数据库
  Future<void> _clearMessagesLocal(String? sessionKey) async {
    if (sessionKey == null || sessionKey.isEmpty) return;
    try {
      final serverId = await _getCurrentServerId();
      await DatabaseService.deleteMessages(serverId: serverId, sessionKey: sessionKey);
    } catch (e) {
      debugPrint('❌ 清除消息失败: $e');
    }
  }
  
  // 🆕 增量合并消息（本地 + 服务器）
  void _mergeMessages(List<Message> serverMessages) {
    if (serverMessages.isEmpty) return;
    
    // 用 id 作为去重 key
    final existingIds = <String>{};
    for (final m in _messages) {
      if (m.id.isNotEmpty) existingIds.add(m.id);
    }
    
    // 找出服务器有但本地没有的消息
    final newMessages = <Message>[];
    for (final sm in serverMessages) {
      if (sm.id.isNotEmpty && !existingIds.contains(sm.id)) {
        newMessages.add(sm);
      }
    }
    
    if (newMessages.isEmpty) {
      debugPrint('🔄 增量合并: 无新消息，保持本地不变');
      return;
    }
    
    debugPrint('🔄 增量合并: 本地 ${_messages.length} 条，服务器 ${serverMessages.length} 条，新增 ${newMessages.length} 条');
    
    // 合并：本地消息 + 新消息，按时间排序
    final allMessages = [..._messages, ...newMessages];
    allMessages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    
    setState(() {
      _messages = allMessages;
    });
  }

  // 💾 保存 session 列表到本地缓存（按服务器隔离）
  Future<void> _saveSessionsLocal() async {
    if (_sessions.isEmpty) return;
    try {
      final serverId = await _getCurrentServerId();
      await DatabaseService.upsertSessions(serverId: serverId, sessions: _sessions);
      debugPrint('💾 已保存 ${_sessions.length} 个会话到数据库 (server: $serverId)');
    } catch (e) {
      debugPrint('❌ 保存会话失败: $e');
    }
  }
  
  // 💾 从本地数据库加载 session 列表
  Future<bool> _loadSessionsLocal() async {
    try {
      final serverId = await _getCurrentServerId();
      final rows = await DatabaseService.loadSessions(serverId: serverId);
      
      // SQLite 有数据
      if (rows.isNotEmpty) {
        setState(() {
          _sessions = rows.map((s) {
            final timestamp = s['timestamp'] as int? ?? DateTime.now().millisecondsSinceEpoch;
            return {
              ...s,
              'relativeTime': _formatRelativeTime(timestamp),
            };
          }).toList();
        });
        debugPrint('💾 从数据库恢复了 ${_sessions.length} 个会话');
      } else {
        // 尝试从旧 SharedPreferences 迁移
        final prefs = await SharedPreferences.getInstance();
        final cacheKey = 'sessions_cache_$serverId';
        final jsonStr = prefs.getString(cacheKey);
        if (jsonStr != null && jsonStr.isNotEmpty) {
          debugPrint('🔄 从旧缓存迁移 session 列表到 SQLite...');
          final List<dynamic> decoded = jsonDecode(jsonStr);
          if (decoded.isNotEmpty) {
            final sessions = decoded.cast<Map<String, dynamic>>();
            await DatabaseService.upsertSessions(serverId: serverId, sessions: sessions);
            await prefs.remove(cacheKey);
            setState(() {
              _sessions = sessions.map((s) {
                final timestamp = s['timestamp'] as int? ?? DateTime.now().millisecondsSinceEpoch;
                return {
                  ...s,
                  'relativeTime': _formatRelativeTime(timestamp),
                };
              }).toList();
            });
            debugPrint('✅ 迁移了 ${sessions.length} 个会话到 SQLite');
          }
        }
      }
      
      if (_sessions.isEmpty) return false;
      debugPrint('💾 从数据库恢复了 ${_sessions.length} 个会话');
      
      // 🆕 如果没有当前会话但有缓存会话列表，自动选择最新的
      if (_currentSessionKey == null && _sessions.isNotEmpty) {
        final firstKey = _sessions.first['key']?.toString();
        if (firstKey != null && firstKey.isNotEmpty) {
          debugPrint('💾 自动选择缓存中最新会话: $firstKey');
          setState(() { _currentSessionKey = firstKey; });
          _loadMessagesLocal(firstKey);
        }
      }
      
      return true;
    } catch (e) {
      debugPrint('❌ 加载会话缓存失败: $e');
      return false;
    }
  }

  Future<void> _loadSessions() async {
    // 🚀 已被 _loadSessionsLocal() + _loadSessionsFromServer() 替代
    // 保留空实现防止编译错误
  }

  // 💾 恢复最后活跃会话（按服务器隔离，启动时即时显示缓存）
  /// 🖥️ 检查设备切换标记或 serverId 变化（冷启动 / 从后台恢复）
  Future<void> _checkDeviceSwitch() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final needRefresh = prefs.getBool('need_refresh_after_switch') ?? false;
      final serverId = await _getCurrentServerId();
      final serverChanged =
          _trackedServerId != null && _trackedServerId!.isNotEmpty && _trackedServerId != serverId;
      if (!needRefresh && !serverChanged) return;

      if (needRefresh) await prefs.remove('need_refresh_after_switch');
      await _applyDeviceSwitch();
    } catch (e) {
      debugPrint('🖥️ 设备切换检查失败: $e');
    }
  }

  /// 切换设备后：Lume device.switch + 重载 sessions/history（对齐 Web）
  Future<void> _applyDeviceSwitch() async {
    final dsm = DeviceSwitchManager.instance;
    if (_isApplyingDeviceSwitch || dsm.switching) return;
    _isApplyingDeviceSwitch = true;
    if (mounted) setState(() => _deviceSwitchLoading = true);
    try {
      _ensureWsListener();
      final serverId = await _getCurrentServerId();
      final epoch = await dsm.beginSwitch(serverId);
      debugPrint('🖥️ 设备切换 → $serverId epoch=$epoch');
      _trackedServerId = serverId;
      _replaceSessionsOnNextParse = true;
      _isGenerating = false;
      _currentSessionKey = null;
      _incrementalHistorySessionKey = null;
      _lastHistoryRequestSessionKey = null;

      if (mounted) {
        setState(() {
          _messages.clear();
          _sessions.clear();
          _queuePosition = 0;
          _queueTotal = 0;
        });
      }

      var transportOk = await dsm.rebindTransport(serverId);
      if (!dsm.isEpochValid(epoch)) return;
      if (!transportOk) {
        _ensureGatewayFallback(reason: '设备切换');
        await dsm.waitForRpc(timeoutMs: 10000);
        transportOk = _canUseWsRpc;
      }
      if (!transportOk) {
        debugPrint('❌ 设备切换：无可用 RPC');
        return;
      }

      var fetched = await _fetchAndApplySessions(epoch: epoch);
      if (!fetched && _sessions.isEmpty) await _loadSessionsLocal();

      if (_currentSessionKey == null) await _restoreLastSession();
      if (_currentSessionKey == null && _sessions.isNotEmpty) {
        final firstKey = _sessions.first['key']?.toString();
        if (firstKey != null && firstKey.isNotEmpty) {
          if (mounted) setState(() => _currentSessionKey = firstKey);
        }
      }

      if (_currentSessionKey != null && dsm.isEpochValid(epoch)) {
        final key = _currentSessionKey!;
        if (mounted) setState(() => _messages.clear());
        if (_canUseWsRpc) {
          await _loadMessageHistory(key, incremental: false);
        }
      }
      dsm.markInitialLoadDone();
      _trackedServerId = serverId;
      debugPrint('✅ 设备切换完成 server=$serverId sessions=${_sessions.length}');
    } catch (e, stack) {
      debugPrint('🖥️ 应用设备切换失败: $e\nStack: $stack');
    } finally {
      dsm.endSwitch();
      _isApplyingDeviceSwitch = false;
      if (mounted) setState(() => _deviceSwitchLoading = false);
    }
  }


  Future<bool> _fetchAndApplySessions({int? epoch}) async {
    final e = epoch ?? DeviceSwitchManager.instance.deviceEpoch;
    final list = await SessionRepository.fetchSessions(epoch: e);
    if (list == null) return false;
    _replaceSessionsOnNextParse = true;
    _parseSessions(list);
    return true;
  }

  Future<void> _restoreLastSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final serverId = await _getCurrentServerId();
      final lastSession = prefs.getString('last_active_session_$serverId');
      final lastAgent = prefs.getString('last_active_agent_$serverId');
      
      if (lastSession != null && lastSession.isNotEmpty && _isValidSessionKey(lastSession)) {
        debugPrint('💾 恢复最后会话: $lastSession, agent: $lastAgent');
        setState(() {
          _currentSessionKey = lastSession;
          if (lastAgent != null && _agents.containsKey(lastAgent)) {
            _currentAgent = lastAgent;
          }
        });
        // 从本地缓存加载消息（即时显示）
        await _loadMessagesLocal(lastSession);
      } else if (lastSession != null && lastSession.isNotEmpty) {
        debugPrint('⚠️ 跳过无效缓存 sessionKey: $lastSession');
      }
      
      if (_currentSessionKey == null && _sessions.isNotEmpty) {
        // 没有 last_active_session 但有会话列表，自动选择最新的会话
        final firstSession = _sessions.first;
        final firstKey = firstSession['key']?.toString();
        if (firstKey != null && firstKey.isNotEmpty) {
          debugPrint('💾 无上次会话记录，自动选择最新会话: $firstKey');
          setState(() {
            _currentSessionKey = firstKey;
            final agentId = firstSession['agentId']?.toString();
            if (agentId != null && _agents.containsKey(agentId)) {
              _currentAgent = agentId;
            }
          });
          await _loadMessagesLocal(firstKey);
        }
      }
    } catch (e) {
      debugPrint('❌ 恢复最后会话失败: $e');
    }
  }

  Future<void> _saveSessions() async {
    // 🚀 统一使用服务器隔离的缓存键（和 _saveSessionsLocal 一致）
    await _saveSessionsLocal();
  }

  void _createNewSession() {
    // 💾 保存当前会话到缓存
    _saveMessagesLocal();
    
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
    
    final prefix = _resolveSessionPrefix();
    final newKey = prefix != null ? '$prefix:chat_${DateTime.now().millisecondsSinceEpoch}' : null;

    setState(() {
      _currentSessionKey = newKey;
      _messages.clear();
      if (newKey != null) {
        _sessions.insert(0, {
          'key': newKey,
          'title': '新对话',
          'agentId': _currentAgent,
          'updatedAt': DateTime.now().toIso8601String(),
          'timestamp': DateTime.now().millisecondsSinceEpoch,
          'relativeTime': '刚刚',
          'lastMessage': '暂无消息',
        });
      }
      _hasMoreOlderMessages = true;
      _isLoadingOlderMessages = false;
    });
    
    // 💾 清除最后活跃会话标记
    _getCurrentServerId().then((serverId) {
      SharedPreferences.getInstance().then((prefs) {
        prefs.remove('last_active_session_$serverId');
      });
    });
    
    Navigator.pop(context);
  }

  void _switchSession(String sessionKey) {
    // 🔒 如果已经是当前会话，不重复切换
    if (_currentSessionKey == sessionKey) return;
    
    // 💾 保存当前会话到缓存
    _saveMessagesLocal();
    
    // 找到对应的会话
    final session = _sessions.firstWhere(
      (s) => s['key'] == sessionKey,
      orElse: () => <String, dynamic>{},
    );
    
    setState(() {
      _currentSessionKey = sessionKey;
      _messages.clear();
      _hasMoreOlderMessages = true;  // 重置更早消息标记
      _isLoadingOlderMessages = false;
      // 恢复会话的 Agent
      if (session.isNotEmpty && session['agentId'] != null) {
        final agentId = session['agentId'].toString();
        if (_agents.containsKey(agentId)) {
          _currentAgent = agentId;
        }
      }
    });
    Navigator.pop(context);
    
    // 💾 先从本地缓存加载（即时显示）
    _loadMessagesLocal(sessionKey).then((loaded) async {
      await _loadMessageHistory(sessionKey, incremental: loaded);
      if (!loaded) {
        debugPrint('📋 无本地缓存，已从服务器拉取历史');
      }
    });
  }

  void _deleteSession(String sessionKey) async {
    debugPrint('🗑️ 删除会话: $sessionKey');

    // 先从本地状态移除（即时 UI 反馈）
    setState(() {
      _sessions.removeWhere((s) => s['key'] == sessionKey);
      if (_currentSessionKey == sessionKey) {
        _currentSessionKey = null;
        _messages.clear();
      }
    });
    _saveSessions();
    // 从本地数据库删除
    try {
      final serverId = await _getCurrentServerId();
      await DatabaseService.deleteSession(serverId: serverId, sessionKey: sessionKey);
      debugPrint('✅ 本地数据库已删除: $sessionKey');
    } catch (e) {
      debugPrint('❌ 删除会话数据库记录失败: $e');
    }

    // 🔔 同步删除 OpenClaw 服务端真实 session
    if (rpcConnected) {
      debugPrint('🗑️ RPC 删除 session: $sessionKey');
      final res = await rpcSendAwait('sessions.delete', {
        'key': sessionKey,
        'sessionKey': sessionKey,
      });
      if (mounted) {
        if (res != null && res['ok'] == true) {
          final deleted = res['payload']?['deleted'];
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(deleted == false ? '会话不存在或已删除' : '已从服务器删除会话'),
              backgroundColor: Constants.primaryColor,
              duration: const Duration(seconds: 2),
            ),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('删除失败，请稍后重试'), backgroundColor: Colors.red),
          );
        }
      }
    } else {
      debugPrint('🗑️ WS 断开，走 HTTP API 删除: $sessionKey');
      await _deleteSessionHTTP(sessionKey);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已通过 HTTP 请求删除'), duration: Duration(seconds: 2)),
        );
      }
    }
  }

  /// 通过 HTTP API 删除服务端 session（WS 不可用时的 fallback）
  Future<void> _deleteSessionHTTP(String sessionKey) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(Constants.storageAccessToken);
      if (token == null || token.isEmpty) {
        debugPrint('❌ 无 token，HTTP 删除跳过');
        return;
      }
      final apiService = ApiService();
      apiService.setAuthToken(token);
      final encoded = Uri.encodeComponent(sessionKey);
      final response = await apiService.delete('/api/gateway/sessions/$encoded');
      final data = response.data;
      if (data is Map && data['success'] == true) {
        debugPrint('✅ HTTP 删除成功: $sessionKey');
      } else {
        debugPrint('⚠️ HTTP 删除返回: $data');
      }
    } catch (e) {
      debugPrint('❌ HTTP 删除失败: $e');
    }
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


  void _initLumeWebSocket() {
    _ensureWsListener();
    final lume = LumeWebSocketService();
    if (_lumeListener != null) {
      lume.removeListener(_lumeListener!);
    }
    _lumeListener = (Map<String, dynamic> data) {
      if (!mounted) return;
      if (data['type'] == 'status') {
        if (data['status'] == 'gateway_fallback') {
          _ensureGatewayFallback(reason: data['message']?.toString() ?? '');
          return;
        }
        setState(() {
          _lumeStatus = data['status'] == 'connecting' ? '连接中...' : data['status']?.toString() ?? '';
          _lumeConnected = data['status'] == 'connected';
        });
        return;
      }
      if (data['type'] == 'error') {
        debugPrint('❌ Lume 错误: ${data['error']}');
        if (!LumeWebSocketService().isConnected && !LumeWebSocketService().isConnecting) {
          _ensureGatewayFallback(reason: data['error']?.toString() ?? '连接失败');
        }
        return;
      }
      if (data['type'] == 'connected') {
        // Lume 已连通，断开 Gateway，保持单连接
        final gw = WebSocketService();
        if (gw.isConnected || gw.isConnecting) {
          debugPrint('🔌 Lume 已连接，断开 Gateway 备用连接');
          gw.disconnect();
        }
        _gatewaySessionDeferTimer?.cancel();
        _replaceSessionsOnNextParse = true;
        setState(() {
          _lumeConnected = true;
          _lumeStatus = '已连接';
          _wsConnected = true;
          _wsStatus = 'Lume已连接';
        });
        Future.microtask(() async => await _onWsReadyLoadSessions(source: 'Lume'));
        return;
      }
      if (data['type'] == 'event' && data['event'] == 'device.switched') {
        final payload = data['payload'] as Map<String, dynamic>?;
        if (payload != null) DeviceSwitchManager.instance.onDeviceSwitchedEvent(payload);
        if (!_isApplyingDeviceSwitch && !DeviceSwitchManager.instance.switching) {
          Future.microtask(() => _onWsReadyLoadSessions(source: 'device.switched'));
        }
        return;
      }
      if (data['type'] == 'event' && data['event'] == 'sessions.updated') {
        debugPrint('📋 [Lume] sessions.updated → 刷新会话列表');
        _fetchAndApplySessions(epoch: DeviceSwitchManager.instance.deviceEpoch).catchError((e) {
          debugPrint('❌ sessions.updated 刷新失败: $e');
        });
        return;
      }
      if (data['type'] == 'event' && data['event'] == 'chat') {
        _handleLumeChatEvent(data['payload'] as Map<String, dynamic>?);
        return;
      }
      // RPC 响应（sessions.list / chat.history）交给主 listener
      if (data['type'] == 'res' && _wsListener != null) {
        _wsListener!(data);
      }
    };
    lume.addListener(_lumeListener!);
    if (!lume.isConnected && !lume.isConnecting) {
      lume.connect().catchError((e) => debugPrint('❌ Lume 连接失败: $e'));
    }
  }

  /// Lume 不可用或连接失败时，降级到 Gateway（仅维持一条活跃连接）
  void _ensureGatewayFallback({String reason = ''}) {
    if (_lumeReady) return;
    if (reason.isNotEmpty) debugPrint('⬇️ Lume 不可用，降级 Gateway: $reason');
    final ws = WebSocketService();
    if (!ws.isConnected && !ws.isConnecting) {
      setState(() {
        _lumeConnected = false;
        _lumeStatus = 'Gateway模式';
        _wsStatus = '连接中...';
      });
      _initWebSocket();
    }
  }

  void _handleLumeChatEvent(Map<String, dynamic>? payload) {
    if (payload == null) return;

    final serverSessionKey = payload['sessionKey']?.toString();
    if (serverSessionKey != null && serverSessionKey.isNotEmpty) {
      if (_currentSessionKey == null || _currentSessionKey != serverSessionKey) {
        setState(() { _currentSessionKey = serverSessionKey; });
        _updateOrCreateSession(serverSessionKey);
      }
    }

    final state = payload['state'];
    final runId = payload['runId']?.toString() ?? payload['messageId']?.toString() ?? '';

    if (state == 'queued') {
      setState(() {
        _queuePosition = payload['position'] ?? 1;
        _queueTotal = payload['total'] ?? 1;
        _isGenerating = true;
      });
      return;
    }

    if (state == 'start' || state == 'begin') {
      setState(() {
        _queuePosition = 0;
        _queueTotal = 0;
        _isGenerating = true;
      });
      return;
    }

    if (state == 'block' || state == 'delta') {
      final text = _extractText(payload['message']) ?? payload['message']?.toString() ?? '';
      if (text.isNotEmpty) {
        final t = text.trim();
        if (t == 'HEARTBEAT_OK' || t == 'NO_REPLY') return;
      }
      setState(() { _isGenerating = true; });
      if (text.isNotEmpty && runId.isNotEmpty) {
        final blockId = runId;
        setState(() {
          final idx = _messages.indexWhere((m) => m.id == blockId);
          if (idx >= 0) {
            _messages[idx] = _messages[idx].copyWith(content: text);
          } else {
            _messages.add(Message(id: blockId, role: 'assistant', content: text, createdAt: DateTime.now(), agentId: _currentAgent));
          }
        });
        _scrollToBottom();
      }
      return;
    }

    if (state == 'error') {
      final errText = payload['message']?.toString() ?? '消息处理失败';
      setState(() {
        _isGenerating = false;
        _queuePosition = 0;
        _queueTotal = 0;
        _messages.add(Message(
          id: runId.isNotEmpty ? runId : DateTime.now().millisecondsSinceEpoch.toString(),
          role: 'assistant',
          content: errText,
          createdAt: DateTime.now(),
          agentId: _currentAgent,
        ));
      });
      _saveMessagesLocal();
      _scrollToBottom();
      return;
    }

    if (state == 'final') {
      final finalText = payload['message']?.toString() ?? _extractText(payload['message']) ?? '';
      if (finalText.contains('HEARTBEAT_OK') || finalText.contains('HEARTBEAT.md')) {
        setState(() { _isGenerating = false; });
        return;
      }
      final msgId = runId.isNotEmpty ? runId : DateTime.now().millisecondsSinceEpoch.toString();
      setState(() {
        _isGenerating = false;
        _queuePosition = 0;
        _queueTotal = 0;
        if (finalText.isNotEmpty) {
          final idx = _messages.indexWhere((m) => m.id == msgId);
          if (idx >= 0) {
            _messages[idx] = _messages[idx].copyWith(content: finalText);
          } else {
            _messages.add(Message(id: msgId, role: 'assistant', content: finalText, createdAt: DateTime.now(), agentId: _currentAgent));
          }
        }
      });
      _saveMessagesLocal();
      _scrollToBottom();
      _refreshUserData();
      // 🔔 对话完成后增量刷新核心过滤的历史（清理 HEARTBEAT_OK / tool traces 等）
      if (_currentSessionKey != null) {
        Future.delayed(const Duration(milliseconds: 500), () {
          if (mounted) _loadMessageHistory(_currentSessionKey!, incremental: true);
        });
      }
    }
  }

  /// RPC 响应处理器（chat.history 等），Lume / Gateway 共用
  void _ensureWsListener() {
    if (_wsListener != null) return;
    final ws = WebSocketService();
    _wsListener = (Map<String, dynamic> data) {
      if (!mounted) return;
      
      try {
        debugPrint('🔔 收到 WebSocket 消息: ${data['type']}');
        
        if (data['type'] == 'status') {
          final status = data['status'];
          setState(() {
            _wsConnected = status == 'connected';
            _wsStatus = status == 'connecting' ? '连接中...' 
                      : status == 'connected' ? (_lumeReady ? 'Lume已连接' : (_lumeStatus.contains('Gateway') ? 'Gateway已连接' : '已连接')) 
                      : status == 'disconnected' ? '已断开' : '连接失败';
          });
          return;
        }
        
        if (data['type'] == 'connected') {
          debugPrint('🔔 收到 connected 事件，开始处理');
          setState(() {
            _wsConnected = true;
            _wsStatus = _lumeReady ? 'Lume已连接' : 'Gateway已连接';
          });
          debugPrint('✅ WebSocket 已连接（状态已更新）');
          
          // 🔥 重连后直接重置生成状态
          if (_isGenerating) {
            debugPrint('🔄 WebSocket 重连，重置生成状态');
            setState(() {
              _isGenerating = false;
              _queuePosition = 0;
              _queueTotal = 0;
            });
          }
          
          // 仅 Gateway 降级模式才加载会话（Lume 模式不会走到这里）
          if (!_lumeReady) {
            Future.microtask(() => _onWsReadyLoadSessions(source: 'Gateway'));
          }
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
            _parseSessions(sessions);
          }
          return;
        }
      
      // 处理历史消息响应（通过 _wsListener 推送的，如重连后自动推送）
      final _isHistoryRes = data['type'] == 'res' && (
            data['id']?.toString().contains('chat_history') == true ||
            data['payload']?['messages'] != null ||
            data['payload']?['transcript'] != null);
      if (_isHistoryRes && data['id']?.toString().contains('sessions_list') != true) {
        debugPrint('📚 _wsListener 收到历史消息推送：ok=${data['ok']}');
        _handleHistoryResponse(data, _currentSessionKey ?? '', incremental: false);
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
        if (state == 'start' || state == 'begin' || state == 'block') {
          final blockText = payload['message']?.toString() ?? _extractText(payload['message']) ?? '';
          setState(() { _queuePosition = 0; _queueTotal = 0; _isGenerating = true; });
          if (state == 'block' && blockText.isNotEmpty) {
            final blockId = runId.isNotEmpty ? runId : 'lume-stream';
            setState(() {
              final idx = _messages.indexWhere((m) => m.id == blockId);
              if (idx >= 0) {
                final old = _messages[idx];
                _messages[idx] = Message(id: blockId, role: 'assistant', content: blockText, createdAt: old.createdAt, agentId: _currentAgent);
              } else {
                _messages.add(Message(id: blockId, role: 'assistant', content: blockText, createdAt: DateTime.now(), agentId: _currentAgent));
              }
            });
            _scrollToBottom();
          }
          return;
        }

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
          
          // 🚫 过滤心跳/系统消息（精确匹配，避免误杀正常消息）
          if (text != null) {
            final t = text.trim();
            if (t == 'HEARTBEAT_OK' || t == 'NO_REPLY') return;
            if (t.startsWith('Read HEARTBEAT.md') && t.length < 100) return;
          }
          
          final audioUrl = payload['audio_url']?.toString();  // 🆕 提取音频 URL
          if (text != null && runId != null && runId.isNotEmpty) {
            setState(() {
              final existingIndex = _messages.indexWhere((m) => m.id == runId);
              if (existingIndex >= 0) {
                final old = _messages[existingIndex];
                _messages[existingIndex] = Message(
                  id: runId,
                  role: 'assistant',
                  content: text,
                  createdAt: old.createdAt,  // 保留原始时间
                  agentId: _currentAgent,
                  audioUrl: audioUrl ?? old.audioUrl,  // 保留音频
                  imageUrl: old.imageUrl,  // 保留图片
                  documentInfo: old.documentInfo,  // 保留文档
                  modelInfo: old.modelInfo,  // 保留模型信息
                );
              } else {
                _messages.add(Message(
                  id: runId,
                  role: 'assistant',
                  content: text,
                  createdAt: DateTime.now(),
                  agentId: _currentAgent,
                  audioUrl: audioUrl,  // 保留音频
                  modelInfo: null,  // final 阶段填充
                ));
              }
            });
            _scrollToBottom();
          }
        } else if (state == 'final') {
          // 🚫 过滤心跳/系统消息
          final finalText = payload['message']?.toString() ?? _extractText(payload['message']);
          if (finalText != null && (finalText.contains('HEARTBEAT_OK') || finalText.contains('HEARTBEAT.md') || finalText.trim() == 'HEARTBEAT_OK')) {
            debugPrint('⏭️ 跳过心跳 final 消息');
            setState(() { _isGenerating = false; });
            return;
          }
          
          // 🆕 提取模型信息
          final modelInfo = payload['modelInfo'] as Map<String, dynamic>?;
          final msgId = runId.isNotEmpty
              ? runId
              : (payload['messageId']?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString());
          
          setState(() {
            _isGenerating = false;
            _queuePosition = 0;
            _queueTotal = 0;
            
            // Lume final：message 为纯字符串，需写入/更新助手消息
            if (finalText != null && finalText.isNotEmpty) {
              final idx = _messages.indexWhere((m) => m.id == msgId);
              if (idx >= 0) {
                _messages[idx] = _messages[idx].copyWith(
                  content: finalText,
                  modelInfo: modelInfo ?? _messages[idx].modelInfo,
                );
              } else {
                _messages.add(Message(
                  id: msgId,
                  role: 'assistant',
                  content: finalText,
                  createdAt: DateTime.now(),
                  agentId: _currentAgent,
                  modelInfo: modelInfo,
                ));
              }
            } else if (modelInfo != null && _messages.isNotEmpty) {
              final lastAssistantIdx = _messages.lastIndexWhere((m) => m.role == 'assistant');
              if (lastAssistantIdx >= 0) {
                _messages[lastAssistantIdx] = _messages[lastAssistantIdx].copyWith(
                  modelInfo: modelInfo,
                );
              }
            }
          });
          // 💾 对话完成后保存消息缓存
          _saveMessagesLocal();
          // 对话完成后刷新用户数据（更新 token 使用量）
          _refreshUserData();

          // 🔔 对话完成后增量刷新核心过滤的历史（清理 HEARTBEAT_OK / tool traces 等）
          if (_currentSessionKey != null) {
            Future.delayed(const Duration(milliseconds: 500), () {
              if (mounted) _loadMessageHistory(_currentSessionKey!, incremental: true);
            });
          }

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
  };
    ws.addListener(_wsListener!);
  }

  void _initWebSocket() {
    final ws = WebSocketService();
    _ensureWsListener();

    if (ws.isConnected) {
      setState(() {
        _wsConnected = true;
        _wsStatus = '已连接';
      });
      debugPrint('✅ WebSocket 已连接（复用现有连接）');
      Future.microtask(() async {
        try {
          await Future.delayed(const Duration(milliseconds: 300));
          _loadSessionsFromServer();
        } catch (e) {
          debugPrint('❌ 加载会话列表失败: $e');
        }
      });
    }

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
        if (mounted) setState(() => _wsStatus = '连接失败');
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

  // 🆕 解析会话列表（不发额外请求，只用 sessions.list 返回的数据）
  void _parseSessions(List<dynamic> sessions) {
    try {
      // 🔒 过滤掉子 agent 的孤立会话（sessionKey 包含 :subagent:），只显示用户直接交互的会话
      final filteredSessions = sessions.where((s) {
        final map = s is Map ? s as Map<String, dynamic> : {};
        final key = (map['key'] ?? '').toString();
        return !key.contains(':subagent:');
      }).toList();
      
      final parsed = filteredSessions.map((s) {
          final map = s is Map ? s as Map<String, dynamic> : {};
          
          // 标题优先级：label > title > lastMessagePreview > agent名 > 默认
          String title = '未命名会话';
          final label = map['label']?.toString() ?? '';
          final mapTitle = map['title']?.toString() ?? '';
          final preview = (map['lastMessagePreview'] ?? map['lastMessage'] ?? '').toString();
          
          // label 且不是默认值
          if (label.isNotEmpty && label != '灵犀' && !label.contains('agent:') && 
              !RegExp(r'[0-9a-f]{8}-[0-9a-f]{4}').hasMatch(label) && label != 'agent') {
            title = label.length > 50 ? '${label.substring(0, 50)}...' : label;
          } 
          // title 且不是默认值
          else if (mapTitle.isNotEmpty && mapTitle != '新对话' && mapTitle != '灵犀' &&
              !RegExp(r'[0-9a-f]{8}-[0-9a-f]{4}').hasMatch(mapTitle)) {
            title = mapTitle.length > 50 ? '${mapTitle.substring(0, 50)}...' : mapTitle;
          }
          // lastMessagePreview（截取前 50 字）
          else if (preview.isNotEmpty && preview != '暂无消息') {
            title = preview.length > 50 ? '${preview.substring(0, 50)}...' : preview;
          }
          // 用 agent 名字兜底
          else {
            final agentId = (map['agentId'] ?? map['agent_id'] ?? 'lingxi').toString();
            final agentName = _agents[agentId]?['name'] ?? 'AI';
            title = '$agentName 的对话';
          }
          
          // 格式化相对时间
          final timestamp = map['updatedAt'] != null 
              ? (map['updatedAt'] is int 
                  ? map['updatedAt'] as int 
                  : DateTime.tryParse(map['updatedAt'].toString())?.millisecondsSinceEpoch ?? DateTime.now().millisecondsSinceEpoch)
              : DateTime.now().millisecondsSinceEpoch;
          
          return {
            'key': (map['key'] ?? '').toString(),
            'title': title,
            'agentId': (map['agentId'] ?? map['agent_id'] ?? 'lingxi').toString(),
            'updatedAt': map['updatedAt'],
            'timestamp': timestamp,
            'relativeTime': _formatRelativeTime(timestamp),
            'lastMessage': preview.isNotEmpty ? preview : '暂无消息',
          };
        }).toList();

      final List<Map<String, dynamic>> mergedList;
      if (_replaceSessionsOnNextParse) {
        _replaceSessionsOnNextParse = false;
        mergedList = List<Map<String, dynamic>>.from(parsed)
          ..sort((a, b) => (b['timestamp'] as int? ?? 0).compareTo(a['timestamp'] as int? ?? 0));
        debugPrint('🖥️ 设备切换：用服务器 sessions 全量替换本地列表');
      } else {
        final merged = <String, Map<String, dynamic>>{};
        for (final s in _sessions) {
          final k = s['key']?.toString() ?? '';
          if (k.isNotEmpty) merged[k] = Map<String, dynamic>.from(s);
        }
        for (final s in parsed) {
          final k = s['key']?.toString() ?? '';
          if (k.isNotEmpty) merged[k] = s;
        }
        mergedList = merged.values.toList()
          ..sort((a, b) => (b['timestamp'] as int? ?? 0).compareTo(a['timestamp'] as int? ?? 0));
      }

      setState(() {
        _sessions = mergedList;
      });
      
      // 💾 保存 session 列表到本地缓存
      _saveSessionsLocal();
      
      // 🆕 服务器会话列表加载后，如果没有当前会话，自动选择最新的
      if (_currentSessionKey == null && _sessions.isNotEmpty) {
        final firstKey = _sessions.first['key']?.toString();
        if (firstKey != null && firstKey.isNotEmpty) {
          debugPrint('💾 服务器会话列表返回，自动选择最新会话: $firstKey');
          setState(() { _currentSessionKey = firstKey; });
          _loadMessagesLocal(firstKey).then((loaded) {
            // 缓存加载后再增量同步
            if (WebSocketService().isConnected) {
              _loadMessageHistory(firstKey, incremental: true);
            }
          });
        }
      }
      
      debugPrint('✅ 解析了 ${_sessions.length} 个会话（无额外请求）');
    } catch (e, stack) {
      debugPrint('❌ _parseSessions 异常: $e\nStack: $stack');
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
  

  /// WS（Gateway 或 Lume）连接就绪后：设备切换检查 + 拉取新设备 sessions/history
  Future<void> _onWsReadyLoadSessions({String source = 'ws'}) async {
    final dsm = DeviceSwitchManager.instance;
    if (dsm.switching || _isApplyingDeviceSwitch) {
      debugPrint('⏭️ [$source] 设备切换进行中，跳过');
      return;
    }
    try {
      if (source != 'device-switch') {
        final prefs = await SharedPreferences.getInstance();
        if (prefs.getBool('need_refresh_after_switch') == true) {
          await _applyDeviceSwitch();
          return;
        }
      }
      _ensureWsListener();
      final epoch = dsm.deviceEpoch;
      debugPrint('🔄 [$source] 加载 sessions epoch=$epoch');
      await Future.delayed(const Duration(milliseconds: 300));
      await _fetchAndApplySessions(epoch: epoch);

      if (_currentSessionKey == null) await _restoreLastSession();
      if (_currentSessionKey == null && _sessions.isNotEmpty) {
        final firstKey = _sessions.first['key']?.toString();
        if (firstKey != null && firstKey.isNotEmpty && mounted) {
          setState(() => _currentSessionKey = firstKey);
        }
      }

      if (_currentSessionKey != null && dsm.isEpochValid(epoch)) {
        final key = _currentSessionKey!;
        final loaded = await _loadMessagesLocal(key);
        if (_canUseWsRpc) await _loadMessageHistory(key, incremental: loaded);
      }
      dsm.markInitialLoadDone();
      debugPrint('✅ [$source] 会话/历史加载完成');
    } catch (e, stack) {
      debugPrint('❌ [$source] 加载会话失败: $e\nStack: $stack');
    }
  }

  Future<void> _loadSessionsFromServer() async {
    if (_isApplyingDeviceSwitch || DeviceSwitchManager.instance.switching) return;
    await _fetchAndApplySessions();
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

  Future<void> _loadMessageHistory(String sessionKey, {bool incremental = false, int limit = 50}) async {
    try {
      if (!_canUseWsRpc) {
        debugPrint('⚠️ WebSocket 未连接，尝试 HTTP fallback 加载历史消息');
        await _loadMessageHistoryHTTP(sessionKey, limit: limit);
        return;
      }
      _ensureWsListener();
      debugPrint('📚 请求 chat.history (${_lumeReady ? "Lume" : "Gateway"}) sessionKey: $sessionKey');
      _lastHistoryRequestSessionKey = sessionKey;
      if (incremental) {
        _incrementalHistorySessionKey = sessionKey;
      }

      final res = await rpcSendAwait('chat.history', {
        'sessionKey': sessionKey,
        'limit': limit,
      }, timeout: const Duration(seconds: 20));

      if (!mounted) return;
      if (_currentSessionKey != sessionKey) {
        debugPrint('⏭️ session 已切换，丢弃 history');
        return;
      }
      if (_isGenerating) {
        debugPrint('⏳ 正在生成，跳过 history');
        return;
      }

      // 🔧 直接处理 chat.history 响应，不走 _wsListener（避免被 sessions 拦截等竞态问题）
      if (res != null) {
        _handleHistoryResponse(res, sessionKey, incremental: incremental);
      } else {
        debugPrint('❌ chat.history 无响应或超时');
      }
    } catch (e, stack) {
      debugPrint('❌ _loadMessageHistory 异常: $e\nStack: $stack');
    }
  }

  /// 🔧 直接处理 chat.history 响应（从 _loadMessageHistory 调用，不经过 _wsListener）
  void _handleHistoryResponse(Map<String, dynamic> data, String sessionKey, {bool incremental = false}) {
    if (!mounted) return;

    // 🔒 竞态保护
    if (_currentSessionKey != sessionKey) {
      debugPrint('📚 ⏭️ 会话已切换，丢弃历史响应');
      return;
    }
    if (_isGenerating) {
      debugPrint('⏳ 正在生成消息，跳过历史消息更新');
      return;
    }

    if (data['ok'] != true || data['payload'] == null) {
      debugPrint('❌ chat.history 失败: ${data["error"]}');
      return;
    }

    try {
      final messages = data['payload']?['messages'] as List? ?? data['payload']?['transcript'] as List?;
      if (messages == null || messages.isEmpty) {
        debugPrint('📚 chat.history 返回 0 条消息');
        return;
      }
      debugPrint('✅ 加载了 ${messages.length} 条历史消息');

      final serverMessages = messages.asMap().entries.map((entry) {
        final i = entry.key;
        final m = entry.value;
        final map = m is Map ? m as Map<String, dynamic> : {};
        final openclawMeta = map['__openclaw'] as Map?;
        final messageId = map['id']?.toString()
            ?? openclawMeta?['id']?.toString()
            ?? map['runId']?.toString()
            ?? '${map['role']}-${map['timestamp'] ?? map['createdAt'] ?? i}';
        final createdAt = _parseDateTime(map['createdAt'] ?? map['created_at']);
        final msgAgentId = map['agentId']?.toString() ?? map['agent_id']?.toString() ?? _currentAgent;

        final role = map['role']?.toString() ?? 'assistant';
        if (role == 'toolResult' || role == 'system' || role == 'tool') return null;

        final content = _extractText(map) ?? map['content']?.toString() ?? '';
        if (content.contains('<<<EXTERNAL_UNTRUSTED_CONTENT') ||
            content.contains('<<<END_EXTERNAL_UNTRUSTED_CONTENT') ||
            content.contains('SECURITY NOTICE:') ||
            content.contains('EXTERNAL, UNTRUSTED source')) return null;
        if (content.trim() == 'HEARTBEAT_OK' || content.trim() == 'NO_REPLY') return null;
        if (content.trim().startsWith('Read HEARTBEAT.md') && content.trim().length < 100) return null;
        if ((content.contains('Exec completed') || content.contains('Exec failed')) &&
            (content.contains('HEARTBEAT') || content.contains('Read HEARTBEAT.md'))) return null;

        String? imageUrl;
        DocumentInfo? documentInfo;
        final attachments = map['attachments'] as List? ?? map['parts'] as List?;
        if (attachments != null && attachments.isNotEmpty) {
          for (final att in attachments) {
            if (att is Map) {
              final attType = att['type']?.toString() ?? '';
              final attMimeType = att['mimeType']?.toString() ?? '';
              if (attType == 'image' || attType.contains('image') || attMimeType.startsWith('image/')) {
                imageUrl = att['url']?.toString() ?? att['content']?.toString();
                if (imageUrl != null && imageUrl!.isNotEmpty) {
                  if (imageUrl!.startsWith('/root/.openclaw/')) {
                    final fileName = imageUrl.split('/').last;
                    imageUrl = (_userServerIp != null && _userServerPort != null)
                        ? 'http://$_userServerIp:$_userServerPort/files/$fileName?token=$_userServerToken'
                        : '${Constants.baseUrl}/api/upload/file/$fileName';
                  }
                  break;
                }
              }
              if (attType == 'document' || (attMimeType.isNotEmpty && !attMimeType.startsWith('image/'))) {
                final docUrl = att['url']?.toString() ?? att['content']?.toString();
                if (docUrl != null && docUrl.isNotEmpty) {
                  documentInfo = DocumentInfo(
                    url: docUrl,
                    mimeType: attMimeType.isNotEmpty ? attMimeType : 'application/octet-stream',
                    filename: att['filename']?.toString() ?? 'document',
                  );
                  break;
                }
              }
            }
          }
        }

        final textContent = _extractText(map) ?? '';
        if (imageUrl == null && documentInfo == null && textContent.isNotEmpty) {
          final attachmentRegex = RegExp(r'\[附件:(图片|文档):([^:]+):([^\]]+)\]');
          final match = attachmentRegex.firstMatch(textContent);
          if (match != null) {
            final type = match.group(1) ?? '';
            final filename = match.group(2) ?? '';
            final url = match.group(3) ?? '';
            if (type == '图片') {
              imageUrl = url;
            } else if (type == '文档') {
              final ext = filename.split('.').last.toLowerCase();
              final mimeMap = {
                'pdf': 'application/pdf', 'txt': 'text/plain', 'md': 'text/markdown',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              };
              documentInfo = DocumentInfo(
                url: url, mimeType: mimeMap[ext] ?? 'application/octet-stream', filename: filename,
              );
            }
          }
        }

        Map<String, dynamic>? historyModelInfo;
        final hModel = map['model']?.toString() ?? map['modelProvider']?.toString();
        final hUsage = map['usage'] as Map?;
        if (hModel != null || hUsage != null) {
          historyModelInfo = {
            'model': hModel ?? 'auto',
            'inputTokens': hUsage?['input'] ?? hUsage?['inputTokens'],
            'outputTokens': hUsage?['output'] ?? hUsage?['outputTokens'],
          };
        }

        return Message(
          id: messageId,
          role: role,
          content: _extractText(map) ?? _toString(map['content']),
          createdAt: createdAt,
          agentId: msgAgentId,
          imageUrl: imageUrl,
          documentInfo: documentInfo,
          modelInfo: historyModelInfo,
        );
      }).whereType<Message>().toList();

      final isLoadingOlder = _loadingOlderSessionKey != null;
      if (isLoadingOlder) {
        _loadingOlderSessionKey = null;
        _isLoadingOlderMessages = false;
        final prevScrollExtent = _scrollController.hasClients ? _scrollController.position.maxScrollExtent : 0;
        final existingIds = _messages.map((m) => m.id).toSet();
        final olderMessages = serverMessages.where((m) => !existingIds.contains(m.id)).toList();
        if (olderMessages.isEmpty) {
          _hasMoreOlderMessages = false;
        } else {
          setState(() { _messages = [...olderMessages, ..._messages]; });
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (_scrollController.hasClients) {
              final newExtent = _scrollController.position.maxScrollExtent;
              _scrollController.jumpTo(newExtent - prevScrollExtent);
            }
          });
        }
      } else if (incremental && _messages.isNotEmpty) {
        _mergeMessages(serverMessages);
        _incrementalHistorySessionKey = null;
      } else {
        setState(() { _messages = serverMessages; });
      }

      _scrollToBottom();
      _saveMessagesLocal();
    } catch (e) {
      debugPrint('❌ 解析历史消息失败: $e');
    }
  }

  /// WS 未连接时的 fallback：尝试重连 WS 然后请求历史消息
  Future<void> _loadMessageHistoryHTTP(String sessionKey, {int limit = 20}) async {
    try {
      final ws = WebSocketService();
      debugPrint('📚 尝试重连 WebSocket 以加载历史消息...');
      await ws.connect().timeout(const Duration(seconds: 5));
      // 等连接建立后再发请求
      await Future.delayed(const Duration(milliseconds: 500));
      if (ws.isConnected) {
        _loadMessageHistory(sessionKey, incremental: false, limit: limit);
      } else {
        debugPrint('❌ WebSocket 重连失败，无法加载历史消息');
      }
    } catch (e) {
      debugPrint('❌ WebSocket 重连失败: $e');
    }
  }

  @override
  void dispose() {
    try { Provider.of<AppProvider>(context, listen: false).removeListener(_onAppProviderUpdate); } catch (_) {}
    _controller.dispose();
    _scrollController.dispose();

    // 🔔 移除生命周期监听器
    WidgetsBinding.instance.removeObserver(this);

    _gatewaySessionDeferTimer?.cancel();
    try {
      if (_wsListener != null) {
        WebSocketService().removeListener(_wsListener!);
        _wsListener = null;
        debugPrint('✅ WebSocket 监听器已移除（不影响其他页面）');
      }
      if (_lumeListener != null) {
        LumeWebSocketService().removeListener(_lumeListener!);
        _lumeListener = null;
      }
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
        debugPrint('📱 App 回到前台');
        _isAppInBackground = false;
        
        // 🖥️ 检查是否从设备切换页面返回
        _checkDeviceSwitch();
        
        // 🔥 直接重置生成状态（避免卡住的感觉）
        if (_isGenerating) {
          debugPrint('📱 后台切回，重置生成状态');
          setState(() {
            _isGenerating = false;
            _queuePosition = 0;
            _queueTotal = 0;
          });
        }
        
        // 🔌 后台切回：Lume 优先，失败再 Gateway
        final lume = LumeWebSocketService();
        debugPrint('📱 设备/前台恢复，重新连接 Lume...');
        lume.reconnectForDevice().then((_) {
          if (!mounted) return;
          if (lume.isConnected) {
            WebSocketService().disconnect();
            _onWsReadyLoadSessions(source: 'resume-Lume');
          } else {
            _ensureGatewayFallback(reason: '前台恢复');
          }
        });
        
        // 恢复会话内容（消息被清空时重新加载）
        if (_currentSessionKey == null && _messages.isEmpty) {
          debugPrint('📱 无当前会话，尝试恢复最后活跃会话');
          _restoreLastSession();
        } else if (_currentSessionKey != null && _messages.isEmpty) {
          // 有 sessionKey 但消息为空（widget 重建/内存回收），从缓存恢复
          debugPrint('📱 会话消息为空，从缓存恢复: $_currentSessionKey');
          _loadMessagesLocal(_currentSessionKey).then((loaded) {
            if (!loaded) {
              // 缓存也没有，从服务器加载
              _loadMessageHistory(_currentSessionKey!, incremental: false);
            }
          });
        }
        
        // 增量同步最新消息（WS 就绪后）
        if (_currentSessionKey != null && _canUseWsRpc) {
          debugPrint('📱 后台切回，增量同步最新消息');
          Future.delayed(const Duration(milliseconds: 300), () {
            if (mounted) _loadMessageHistory(_currentSessionKey!, incremental: true);
          });
        }
        // 刷新会话列表
        if (_canUseWsRpc) {
          Future.delayed(const Duration(milliseconds: 500), () {
            if (mounted) _loadSessionsFromServer();
          });
        }
        break;
      case AppLifecycleState.paused:
        // App 进入后台
        debugPrint('📱 App 进入后台');
        _isAppInBackground = true;
        // 💾 进入后台时保存消息缓存
        _saveMessagesLocal();
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
      
      // 2. 上传到服务器（带认证 token）
      final apiUrl = '${Constants.baseUrl}/api/upload/image';
      final request = http.MultipartRequest('POST', Uri.parse(apiUrl));
      // 携带认证 token
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('lingxi_token');
      if (token != null && token.isNotEmpty) {
        request.headers['Authorization'] = 'Bearer $token';
      }
      
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
    
    debugPrint('📤 免费用户发送消息: userId=$userId, text=$text, hasImage=$hasImage');
    
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
    } catch (e, stack) {
      debugPrint('❌ 免费用户发送消息失败: $e');
      debugPrint('❌ Stack: $stack');
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
    var text = _controller.text.trim();
    final hasImage = _pendingImageUrl != null;
    
    // 🆕 如果有技能 tags，在消息前加前缀
    if (_skillTags.isNotEmpty) {
      final tagPrefix = _skillTags.map((t) => '[技能: ${t.name}]').join(' ');
      text = '$tagPrefix $text'.trim();
    }
    
    // 如果没有文字也没有图片，不发送
    if (text.isEmpty && !hasImage) return;
    if (_isGenerating) return;
    
    final user = Provider.of<AppProvider>(context, listen: false).user;
    final userId = user?.id;
    final ws = WebSocketService();
    
    // 判断是否能走 WebSocket
    final lumeWs = LumeWebSocketService();
    final canUseWs = userId != null && (ws.isConnected || lumeWs.isConnected);
    
    debugPrint('📤 发送消息: text="${text.length > 20 ? text.substring(0, 20) : text}", canUseWs=$canUseWs');
    
    if (!canUseWs) {
      // WebSocket 不可用 → HTTP 路径（所有用户都可用）
      debugPrint('📋 WebSocket 不可用，走 HTTP 路径');
      _clearSkillTags();  // 🆕 发送前先清除 tags
      _sendMessageForFreeUser(text, hasImage);
      return;
    }
    
    debugPrint('📋 走 WebSocket 路径');

    _controller.clear();
    _clearSkillTags();  // 🆕 发送后清除 tags
    
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

    final targetSessionKey = _resolveTargetSessionKey(ws);
    if (targetSessionKey == null) {
      setState(() {
        _isGenerating = false;
        _messages.add(Message(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          role: 'assistant',
          content: '⚠️ 连接尚未就绪，请稍等几秒后重试',
          createdAt: DateTime.now(),
          agentId: _currentAgent,
        ));
      });
      return;
    }
    if (_currentSessionKey != targetSessionKey) {
      setState(() { _currentSessionKey = targetSessionKey; });
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
    final lume = LumeWebSocketService();
    if (lume.isConnected) {
      debugPrint('📤 通过 Lume 插件发送');
      lume.sendMessage(
        text.isNotEmpty ? text : '请识别这张图片',
        agentId: _currentAgent,
        sessionKey: targetSessionKey,
        attachments: params['attachments'] as List<Map<String, dynamic>>?,
      );
    } else {
      debugPrint('📤 通过 Gateway 发送');
      ws.sendRequest('chat.send', params);
    }
    
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
          
          // 更新本地缓存
          setState(() {
            final index = _sessions.indexWhere((s) => s['key'] == _currentSessionKey);
            if (index >= 0) {
              _sessions[index]['title'] = newTitle;
              _sessions[index]['label'] = newTitle;
            }
          });

          rpcSendAwait('sessions.update', {
            'key': _currentSessionKey,
            'sessionKey': _currentSessionKey,
            'label': newTitle,
          }).then((res) {
            if (!mounted) return;
            if (res != null && res['ok'] != true) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('标题同步失败'), backgroundColor: Colors.red),
              );
            }
          });
        }
      }
    }
    
    // 清除待发送的图片
    _clearPendingImage();
    
    // 💾 发送消息后保存缓存
    _saveMessagesLocal();
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
        body: Stack(
          children: [
            Row(
              children: [
                if (isWide) _buildSidebar(isDarkMode),
                Expanded(child: _buildMainContent()),
              ],
            ),
            if (_deviceSwitchLoading)
              Container(
                color: Colors.black38,
                child: const Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 12),
                      Text('正在切换设备...', style: TextStyle(color: Colors.white)),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
  
  // 错误处理包装器 — 初始化期间自动重试，不闪烁错误页
  Widget _errorWrapper(Widget child) {
    return Builder(
      builder: (context) {
        try {
          return child;
        } catch (e, stack) {
          debugPrint('🚨 Widget 构建异常（将自动重试）: $e');
          // 不显示静态错误页，自动在下一帧重试
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) setState(() {});
          });
          return Scaffold(
            body: Center(
              child: CircularProgressIndicator(color: Constants.primaryColor),
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
      title: const Text('灵犀', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
      centerTitle: true,
      actions: [
        Padding(
          padding: const EdgeInsets.only(right: 8),
          child: _buildConnectionIndicator(),
        ),
        IconButton(
          icon: const Icon(Icons.folder_outlined, size: 22),
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => FileExplorerPage()),
          ),
        ),
      ],
    );
  }

  Widget _buildConnectionIndicator() {
    final lumeReady = _lumeReady;
    final connected = lumeReady || _wsConnected;
    final color = !connected
        ? Colors.orange
        : (lumeReady ? const Color(0xFF00BFA5) : Colors.green);
    final label = lumeReady
        ? 'Lume'
        : (_wsConnected ? 'Gateway' : '连接中');
    return GestureDetector(
      onTap: _showConnectionDebug,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 10,
            height: 10,
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
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600),
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
              const Divider(),
              const SizedBox(height: 8),
              const Text('Lume 插件 (18790) — 可选测试', style: TextStyle(fontWeight: FontWeight.bold)),
              _buildDebugItem('Lume 状态', _lumeStatus, _lumeConnected ? Colors.green : Colors.grey),
              SwitchListTile(
                title: const Text('启用 Lume 测试模式'),
                subtitle: const Text('Lume 优先单连接；仅插件不可用时降级 Gateway'),
                value: _lumeTestEnabled,
                activeColor: Constants.primaryColor,
                onChanged: (v) async { await _setLumeTestEnabled(v); },
              ),
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
            showUpgradeDialog(context);
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
    final List<Map<String, dynamic>> examples = [];
    final rawExamples = agentInfo?['examples'];
    if (rawExamples is List) {
      for (final ex in rawExamples) {
        if (ex is Map) examples.add(Map<String, dynamic>.from(ex));
      }
    }
    
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
    final bgColor = isDarkMode ? const Color(0xFF343541) : Constants.surfaceColor;
    final iconColor = isDarkMode ? const Color(0xFF10A37F) : Constants.primaryColor;
    final textColor = isDarkMode ? const Color(0xFFECECF1) : Constants.textPrimaryColor;
    
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
        margin: const EdgeInsets.symmetric(vertical: 3, horizontal: 4),
        padding: const EdgeInsets.all(14),
        constraints: const BoxConstraints(maxWidth: 400),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(Constants.radiusMd),
          border: Border.all(
            color: isDarkMode ? const Color(0xFF404040) : Constants.borderLight,
            width: 0.5,
          ),
          boxShadow: isDarkMode 
            ? null 
            : [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6, offset: const Offset(0, 1))],
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
// 构建文本输入区域（悬浮圆角卡片，上下分区，对齐 Web 端高级感）
  Widget _buildTextInputArea(bool isDarkMode, bool isFreeUser) {
    final hasText = _controller.text.isNotEmpty;
    final showTools = !hasText && _pendingImageUrl == null && !_isGenerating;

    return Container(
      constraints: const BoxConstraints(maxWidth: 680),
      decoration: BoxDecoration(
        color: isDarkMode ? const Color(0xFF2D2D30) : Constants.surfaceColor,
        borderRadius: BorderRadius.circular(Constants.radiusLg),
        border: Border.all(
          color: isDarkMode ? const Color(0xFF404040) : Constants.borderDefault,
          width: 1,
        ),
        boxShadow: isDarkMode 
          ? null
          : [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 12, offset: const Offset(0, 2))],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // 🆕 技能 tags 区域（条件渲染）
          if (_skillTags.isNotEmpty)
            Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Wrap(
                spacing: 6,
                runSpacing: 4,
                children: _skillTags.map((tag) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Constants.primaryColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: Constants.primaryColor.withOpacity(0.2),
                      width: 0.5,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.auto_awesome, size: 12, color: Constants.primaryColor),
                      const SizedBox(width: 4),
                      Text(
                        tag.name,
                        style: TextStyle(
                          fontSize: 12,
                          color: Constants.primaryColor,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(width: 4),
                      GestureDetector(
                        onTap: () => _removeSkillTag(tag.id),
                        child: Icon(Icons.close, size: 14, color: Constants.primaryColor.withOpacity(0.6)),
                      ),
                    ],
                  ),
                )).toList(),
              ),
            ),
          // 图片预览区域
          if (_pendingImageUrl != null)
            Container(
              height: 80,
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(Constants.radiusSm),
                    child: _buildFilePreview(isDarkMode),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          _pendingImageName ?? '文件',
                          style: TextStyle(
                            color: isDarkMode ? Colors.white70 : Constants.textSecondaryColor,
                            fontSize: 12,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _pendingFileType == 'document' ? '点击发送按钮上传文档' : '点击发送按钮上传',
                          style: TextStyle(
                            color: isDarkMode ? Colors.white38 : Constants.textTertiaryColor,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: Icon(Icons.close, color: Colors.red.shade400, size: 18),
                    onPressed: _clearPendingImage,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                  ),
                ],
              ),
            ),
          // 上半部：输入框 + 发送按钮
          Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 8, 0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // 输入框（无背景、无边框，融入卡片）
                Expanded(
                  child: TextField(
                    controller: _controller,
                    style: TextStyle(
                      color: isDarkMode ? const Color(0xFFECECF1) : Constants.textPrimaryColor,
                      fontSize: 15,
                      height: 1.5,
                    ),
                    decoration: InputDecoration(
                      hintText: _pendingImageUrl != null ? '添加图片描述（可选）...' : '给灵犀发消息...',
                      hintStyle: TextStyle(
                        color: isDarkMode ? const Color(0xFF6E6E80) : Constants.textPlaceholderColor,
                        fontSize: 15,
                      ),
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      filled: false,
                      contentPadding: const EdgeInsets.symmetric(vertical: 4),
                      isDense: true,
                    ),
                    maxLines: null,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                // 发送 / 停止按钮
                if (_isGenerating)
                  _buildStopButton(onTap: _abortChat, size: 30)
                else if (hasText || _pendingImageUrl != null)
                  _buildCircleButton(
                    icon: Icons.arrow_upward_rounded,
                    color: Constants.primaryColor,
                    onTap: _sendMessage,
                    size: 30,
                  ),
              ],
            ),
          ),
          // 下半部：左工具 + 右模型（有文字时自动隐藏工具按钮）
          Container(
            padding: const EdgeInsets.fromLTRB(4, 2, 4, 6),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // 左边工具按钮（无文字+无附件+非生成中才显示）
                if (showTools)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _buildToolButton(Icons.camera_alt_outlined, () async {
                        // 请求相机权限
                        final status = await Permission.camera.request();
                        if (status.isGranted) {
                          final picker = ImagePicker();
                          final XFile? file = await picker.pickImage(source: ImageSource.camera);
                          if (file != null) {
                            await _selectImageFromXFile(file);
                          }
                        } else {
                          debugPrint('❌ 相机权限被拒绝');
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('需要相机权限才能拍照')),
                            );
                          }
                        }
                      }, isDarkMode),
                      _buildToolButton(Icons.attach_file_rounded, () async {
                        // 请求存储权限
                        PermissionStatus status;
                        if (await Permission.photos.isGranted) {
                          status = PermissionStatus.granted;
                        } else {
                          status = await Permission.photos.request();
                          if (!status.isGranted) {
                            // Android 12 及以下用 READ_EXTERNAL_STORAGE
                            status = await Permission.storage.request();
                          }
                        }
                        if (status.isGranted || await Permission.storage.isGranted) {
                          final result = await file_picker.FilePicker.platform.pickFiles(
                            type: file_picker.FileType.custom,
                            allowedExtensions: [
                              'jpg', 'jpeg', 'png', 'gif', 'webp',
                              'pdf', 'txt', 'md', 'html', 'csv', 'json',
                            ],
                            allowCompression: false,
                          );
                          if (result != null && result.files.isNotEmpty) {
                            await _selectFile(result.files.first);
                          }
                        } else {
                          debugPrint('❌ 存储权限被拒绝');
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('需要存储权限才能选择文件')),
                            );
                          }
                        }
                      }, isDarkMode),
                      _buildToolButton(Icons.mic_rounded, _speechEnabled
                        ? () { setState(() { _showVoiceInput = true; }); }
                        : null, isDarkMode),
                    ],
                  ),
                // 右边：模型选择器
                ModelSelectorPill(
                  models: _models,
                  selectedModel: _selectedModel ?? 'auto',
                  showDropdown: _showModelDropdown,
                  isDarkMode: isDarkMode,
                  onTap: () => setState(() { _showModelDropdown = !_showModelDropdown; }),
                ),
              ],
            ),
          ),
          // 模型下拉面板
          if (_showModelDropdown) ModelSelectorDropdown(
            models: _models,
            selectedModel: _selectedModel ?? 'auto',
            isDarkMode: isDarkMode,
            isFreeUser: isFreeUser,
            onSelect: (modelId) {
              setState(() {
                _selectedModel = modelId;
                _showModelDropdown = false;
              });
              _saveModelPreference(modelId);
            },
          ),
        ],
      ),
    );
  }

  // 圆形按钮（发送/停止）
  Widget _buildCircleButton({
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
    double size = 32,
  }) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Icon(icon, color: Colors.white, size: size * 0.5),
      ),
    );
  }

  // 停止按钮（豆包风格：外圈持续旋转 + 内部方块停止图标）
  Widget _buildStopButton({
    required VoidCallback onTap,
    double size = 32,
  }) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          alignment: Alignment.center,
          children: [
            // 外圈持续旋转
            SpinningRing(color: Constants.primaryColor, strokeWidth: 2.5, size: size),
            // 内部停止图标（圆角方块）
            Container(
              width: size * 0.38,
              height: size * 0.38,
              decoration: BoxDecoration(
                color: Constants.primaryColor,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // 工具按钮（底部栏小图标）
  Widget _buildToolButton(IconData icon, VoidCallback? onTap, bool isDarkMode) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(Constants.radiusSm),
        ),
        alignment: Alignment.center,
        child: Icon(
          icon,
          size: 18,
          color: isDarkMode ? const Color(0xFF8E8EA0) : Constants.textTertiaryColor,
        ),
      ),
    );
  }

  // 保存模型偏好到本地 + 后端
  Future<void> _saveModelPreference(String modelId) async {
    final prefs = await SharedPreferences.getInstance();
    // 本地缓存（与 Web localStorage 对齐）
    await prefs.setString('lingxi_selected_model', modelId);
    // 同步到后端
    final token = prefs.getString(Constants.storageAccessToken);
    if (token == null) return;
    try {
      await http.post(
        Uri.parse('${Constants.baseUrl}/api/user-models/preference'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({'model': modelId}),
      );
    } catch (e) {
      debugPrint('保存模型偏好失败: $e');
    }
  }

  // 从 API 动态加载模型列表（与 Web 版对齐）
  Future<void> _loadModelsFromApi() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(Constants.storageAccessToken);
      final headers = <String, String>{};
      if (token != null) headers['Authorization'] = 'Bearer $token';

      final res = await http.get(
        Uri.parse('${Constants.baseUrl}/api/user-models'),
        headers: headers,
      ).timeout(const Duration(seconds: 5));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final List<dynamic> apiModels = data['availableModels'] ?? [];
        if (apiModels.isNotEmpty) {
          final models = apiModels.map<Map<String, String>>((m) => {
            'id': (m['id'] ?? '').toString(),
            'name': (m['name'] ?? '').toString(),
            'desc': (m['desc'] ?? '').toString(),
            'tier': (m['tier'] ?? 'free').toString(),
          }).where((m) => m['id']!.isNotEmpty).toList();
          if (mounted && models.isNotEmpty) {
            setState(() { _models = models; });
          }
          return;
        }
      }
    } catch (e) {
      debugPrint('⚠️ 加载模型列表失败，使用 fallback: $e');
    }
    // Fallback: 使用硬编码列表
    if (mounted && _models.isEmpty) {
      setState(() { _models = List.from(_fallbackModels); });
    }
  }

  // 加载模型偏好（本地缓存 + 后端同步）
  Future<void> _loadModelPreference() async {
    final prefs = await SharedPreferences.getInstance();
    // 本地缓存优先（与 Web localStorage 对齐）
    final local = prefs.getString('lingxi_selected_model');
    if (local != null && local.isNotEmpty) {
      setState(() { _selectedModel = local; });
      return;
    }
    // 回退：从后端获取
    final token = prefs.getString(Constants.storageAccessToken);
    if (token == null) return;
    try {
      final res = await http.get(
        Uri.parse('${Constants.baseUrl}/api/user-models/preference'),
        headers: {'Authorization': 'Bearer $token'},
      );
      final data = jsonDecode(res.body);
      if (data['success'] == true && data['preferredModel'] != null) {
        setState(() { _selectedModel = data['preferredModel']; });
      }
    } catch (e) {
      debugPrint('加载模型偏好失败: $e');
    }
  }

  // 取消对话
  void _abortChat() {
    final lume = LumeWebSocketService();
    final ws = WebSocketService();
    if (lume.isConnected) {
      debugPrint('🛑 [Lume] 发送取消请求');
      lume.sendRequest('chat.abort', {'sessionKey': _currentSessionKey});
    } else if (ws.isConnected) {
      debugPrint('🛑 [Gateway] 发送取消请求');
      ws.sendRequest('chat.abort', {'sessionKey': _currentSessionKey});
    } else {
      debugPrint('⚠️ WebSocket 未连接，无法取消');
      return;
    }
    
    setState(() {
      _isGenerating = false;
      _queuePosition = 0;
      _queueTotal = 0;
    });
    
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('已取消生成'),
        duration: Duration(seconds: 1),
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
                Text('Lume', style: TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          
          // 办公区入口（在新对话上面）
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: ListTile(
              dense: true,
              leading: Icon(Icons.business_outlined, color: iconColor, size: 20),
              title: const Text('办公区', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              trailing: Icon(Icons.chevron_right, size: 16, color: subTextColor),
              contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              onTap: () {
                Navigator.pop(context);
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => WorkspacePage()));
              },
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
                
                // 同步到服务器（Lume 优先）
                rpcSendAwait('sessions.update', {
                  'key': sessionKey,
                  'sessionKey': sessionKey,
                  'title': newTitle,
                  'label': newTitle,
                }).then((res) {
                  if (!mounted) return;
                  if (res != null && res['ok'] != true) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('重命名同步失败'), backgroundColor: Colors.red),
                    );
                  }
                });
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
                  await Navigator.push(context, MaterialPageRoute(builder: (_) => SubscriptionPage()));
                },
              ),
              ListTile(
                leading: Icon(Icons.extension_outlined, color: textColor),
                title: Text('技能库', style: TextStyle(color: textColor)),
                onTap: () {
                  Navigator.pop(context);
                  _switchToSkillsTab();
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
                  await Navigator.push(context, MaterialPageRoute(builder: (_) => LumeClawPage()));
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
                      children: [
                        const SizedBox(height: 16),
                        const Text("浙ICP备2026013667号-2A", style: TextStyle(fontSize: 12, color: Colors.grey)),
                        const SizedBox(height: 8),
                        const Text("你的 AI 团队，一键拥有", style: TextStyle(fontSize: 14, color: Colors.black54)),
                      ],
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
                      MaterialPageRoute(builder: (_) => LoginPage()),
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
    
    // 🔧 检查是否可以领取（订阅用户 或 积分 >= 5000）
    final subscription = user?.subscription as Map<String, dynamic>?;
    final isSubscribed = subscription != null && 
                         subscription['plan'] != null && 
                         subscription['plan'] != 'free' && 
                         (subscription['status'] == 'active' || 
                          (subscription['endDate'] != null && 
                           DateTime.parse(subscription['endDate']).isAfter(DateTime.now())));
    final points = (user?.points as num?)?.toInt() ?? 0;
    final canClaim = isSubscribed || points >= 5000;
    
    // 不能领取的用户（免费且积分不足）显示 AI 团队介绍
    if (!canClaim) {
      return () => _showAITeamIntroDialog(appProvider);
    }
    
    // 可以领取的用户，根据是否有团队显示不同内容
    if (user?.agents.isEmpty ?? true) {
      // 没有团队，显示 AI 团队介绍对话框（可以领取）
      return () => _showAITeamIntroDialog(appProvider);
    }
    
    // 已有团队，显示团队信息
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
                // 🔧 根据用户类型显示不同提示
                Builder(
                  builder: (context) {
                    final user = appProvider.user;
                    final subscription = user?.subscription as Map<String, dynamic>?;
                    final isSubscribed = subscription != null && 
                                         subscription['plan'] != null && 
                                         subscription['plan'] != 'free' && 
                                         (subscription['status'] == 'active' || 
                                          (subscription['endDate'] != null && 
                                           DateTime.parse(subscription['endDate']).isAfter(DateTime.now())));
                    final points = (user?.points as num?)?.toInt() ?? 0;
                    final canClaim = isSubscribed || points >= 5000;
                    
                    String hint;
                    if (canClaim) {
                      hint = '您已满足领取条件，点击下方按钮即可领取完整的 AI 团队：';
                    } else {
                      final need = 5000 - points;
                      hint = '订阅用户或累计消耗 ≥5000 积分即可领取，每个 Agent 都有独特的技能和专长：\n（当前积分：$points，还需 $need 积分或开通订阅）';
                    }
                    
                    return Text(hint, style: const TextStyle(fontSize: 14));
                  },
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
              onPressed: () async {
                // 🔧 检查是否可以领取
                final user = appProvider.user;
                final subscription = user?.subscription as Map<String, dynamic>?;
                final isSubscribed = subscription != null && 
                                     subscription['plan'] != null && 
                                     subscription['plan'] != 'free' && 
                                     (subscription['status'] == 'active' || 
                                      (subscription['endDate'] != null && 
                                       DateTime.parse(subscription['endDate']).isAfter(DateTime.now())));
                final points = (user?.points as num?)?.toInt() ?? 0;
                final canClaim = isSubscribed || points >= 5000;
                
                if (!canClaim) {
                  // 不能领取，提示需要订阅或积分
                  final need = 5000 - points;
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('💡 还需 ${need} 积分或开通订阅才能领取')),
                  );
                } else {
                  // 可以领取，调用 API
                  Navigator.pop(context);
                  try {
                    final success = await appProvider.claimTeam();
                    if (success) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('🎉 成功领取 AI 团队！')),
                      );
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('领取失败，请重试')),
                      );
                    }
                  } catch (e) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('领取失败：$e')),
                    );
                  }
                }
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
                InviteStat(inviteCount.toString(), '已邀请人数'),
                Container(width: 1, height: 40, color: Colors.grey.shade300),
                InviteStat(earnedPoints.toString(), '获得积分'),
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
                      UsageRow('总积分', '${usageData?['credits']?['total'] ?? appProvider.user?.points ?? 0}'),
                      UsageRow('充值积分', '${usageData?['credits']?['balance'] ?? appProvider.user?.points ?? 0}'),
                      UsageRow('今日免费', '${usageData?['credits']?['freeRemaining'] ?? 100} / ${usageData?['credits']?['freeDaily'] ?? 100}'),
                      UsageRow('预计可用', '约 ${formatTokens((usageData?['credits']?['total'] ?? 0) / 0.3 * 1000)} tokens'),
                    ],
                  ),
                ),
                
                const SizedBox(height: 16),
                const Text('📈 Token 使用量', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                
                Row(
                  children: [
                    Expanded(child: TokenCard('今日', formatTokens(usageData?['today']?['tokens']), '${usageData?['today']?['requests'] ?? 0} 次')),
                    const SizedBox(width: 8),
                    Expanded(child: TokenCard('本周', formatTokens(usageData?['week']?['tokens']), '${usageData?['week']?['requests'] ?? 0} 次')),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: TokenCard('本月', formatTokens(usageData?['month']?['tokens']), '${usageData?['month']?['requests'] ?? 0} 次')),
                    const SizedBox(width: 8),
                    Expanded(child: TokenCard('总计', formatTokens(usageData?['totalTokens']), '${usageData?['totalRequests'] ?? 0} 次')),
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
  
  Widget _buildMainContent() {
    final appProvider = Provider.of<AppProvider>(context, listen: false);
    final user = appProvider.user;
    final isFreeUser = user?.subscription?['plan'] == 'free' || user?.subscription?['plan'] == null;
    final isDarkMode = appProvider.isDarkMode;
    
    try {
      // 获取当前 agent 名称
      final currentAgentInfo = _agents[_currentAgent];
      final currentAgentName = currentAgentInfo?['name']?.toString() ?? 'AI';
      
      return Stack(
        children: [
          Column(
        children: [
          // 顶部升级提示条（仅免费用户显示）
          if (isFreeUser) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              color: const Color(0xFFEAB308),
              child: GestureDetector(
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SubscriptionPage())),
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
                      // 🆕 加载更早消息指示器
                      if (_isLoadingOlderMessages)
                        Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: SizedBox(
                            width: 16, height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Constants.primaryColor),
                          ),
                        ),
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
                                        _loadMessageHistory(_currentSessionKey!, incremental: true);
                                        ScaffoldMessenger.of(context).showSnackBar(
                                          const SnackBar(
                                            content: Text('正在同步最新消息...'),
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
                              
                              return MessageBubble(
                                content: _messages[i].content,
                                isUser: _messages[i].role == 'user',
                                agentId: safeAgentId,
                                agents: _agents,
                                isDarkMode: isDarkMode,
                                imageUrl: _messages[i].imageUrl,
                                audioUrl: _messages[i].audioUrl,
                                documentInfo: _messages[i].documentInfo,  // 🆕 传递文档信息
                                modelInfo: _messages[i].modelInfo,  // 🆕 传递模型信息
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
          // 🆕 磨砂玻璃效果输入区域
          Container(
            padding: EdgeInsets.only(
              left: 12,
              right: 12,
              top: 6,
              bottom: MediaQuery.of(context).viewInsets.bottom > 0
                  ? 6
                  : MediaQuery.of(context).padding.bottom + 10,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(Constants.radiusLg),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: SafeArea(
                  top: false,
                  child: _showVoiceInput 
                      ? VoiceInputArea(
                        isDarkMode: isDarkMode,
                        isListening: _isListening,
                        isCanceling: _isCanceling,
                        waveIndex: _waveIndex,
                        lastWords: _lastWords,
                        onKeyboardToggle: () {
                          setState(() {
                            _showVoiceInput = false;
                            _lastWords = '';
                          });
                        },
                        onLongPressStart: (_) {
                          _startListening();
                        },
                        onLongPressMoveUpdate: (details) {
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
                            _stopListening(cancel: true);
                            setState(() {
                              _showVoiceInput = false;
                              _isCanceling = false;
                            });
                          } else {
                            _stopListening();
                          }
                        },
                      )
                      : _buildTextInputArea(isDarkMode, isFreeUser),
                ),
              ),
            ),
          ),
        ],
      ),
          // 🆕 回到底部浮动按钮
          if (_showScrollToBottom)
            Positioned(
              bottom: 100,
              // 居中偏移：屏幕宽度一半减去按钮半径
              left: MediaQuery.of(context).size.width / 2 - 20,
              child: GestureDetector(
                onTap: () {
                  if (!_scrollController.hasClients) return;
                  _scrollController.animateTo(
                    _scrollController.position.maxScrollExtent,
                    duration: const Duration(milliseconds: 300),
                    curve: Curves.easeOut,
                  );
                },
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: isDarkMode ? const Color(0xFF3D3D3D) : Colors.white,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.1),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Icon(
                    Icons.keyboard_arrow_down_rounded,
                    color: isDarkMode ? Colors.white70 : Colors.grey.shade700,
                    size: 24,
                  ),
                ),
              ),
            ),
        ],
      );
    } catch (e) {
      debugPrint('❌ 主内容区渲染失败: $e');
      // 自动触发重建，不显示静态错误页
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() {});
      });
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(color: Color(0xFF667eea)),
            SizedBox(height: 16),
            Text('正在加载...', style: TextStyle(color: Colors.grey)),
          ],
        ),
      );
    }
  }
}

