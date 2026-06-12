import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:lingxicloud/services/rpc_ws.dart';
import 'package:lingxicloud/services/lume_websocket_service.dart';
import 'package:lingxicloud/services/gateway_agents.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:provider/provider.dart';
import 'dart:math' as math;
import 'package:lingxicloud/pages/office_scene.dart';
import 'package:lingxicloud/pages/workspace/knowledge_tab.dart';
import 'package:lingxicloud/pages/workspace/market_tab.dart';
import 'package:lingxicloud/pages/workspace/workflow_tab.dart';
import 'package:lingxicloud/pages/workspace/memory_tab.dart';
import 'package:lingxicloud/pages/workspace/trigger_tab.dart';

class WorkspacePage extends StatefulWidget {
  const WorkspacePage({super.key});
  @override
  State<WorkspacePage> createState() => _WorkspacePageState();
}

class _WorkspacePageState extends State<WorkspacePage> with TickerProviderStateMixin {
  late TabController _tabController;
  bool _isLoading = true;
  List<Map<String, dynamic>> _agents = [];
  String _source = 'mock';
  late AnimationController _breathCtrl;
  late AnimationController _typeCtrl;
  List<Map<String, dynamic>> _templates = [];
  bool _templatesLoading = false;
  Map<String, dynamic>? _selectedTemplate;
  String _tplCategory = 'all';
  List<Map<String, dynamic>> _logs = [];
  List<Map<String, dynamic>> _openClawAgents = [];
  int _marketRefreshNonce = 0;

  static const _presetOpenClawIds = {'main', 'coder', 'ops', 'inventor', 'pm', 'noter', 'media', 'smart', 'auto', 'reviewer'};

  static const _defaultAgents = [
    {'id': 'captain', 'name': '灵犀', 'emoji': '⚡', 'role': '队长', 'color': '#667eea', 'gradient': ['#667eea', '#764ba2'], 'desc': '智能调度队长，负责理解需求、分配任务、协调团队，是沟通桥梁和核心大脑'},
    {'id': 'coder', 'name': '云溪', 'emoji': '💻', 'role': '代码', 'color': '#4facfe', 'gradient': ['#4facfe', '#00f2fe'], 'desc': '全栈开发专家，精通 JavaScript/Python/Go，擅长架构设计、API 开发、Bug 修复'},
    {'id': 'operator', 'name': '若曦', 'emoji': '📊', 'role': '运营', 'color': '#43e97b', 'gradient': ['#43e97b', '#38f9d7'], 'desc': '数据分析与运营专家，擅长数据报表、增长分析、SEO 优化、用户转化'},
    {'id': 'inventor', 'name': '紫萱', 'emoji': '💡', 'role': '创意', 'color': '#fa709a', 'gradient': ['#fa709a', '#fee140'], 'desc': '创意策划大师，擅长文案撰写、营销方案、品牌传播、社媒运营'},
    {'id': 'pm', 'name': '梓萱', 'emoji': '🎯', 'role': '产品', 'color': '#f5576c', 'gradient': ['#f5576c', '#ff6b6b'], 'desc': '产品经理，擅长需求分析、MVP 规划、用户体验优化、原型设计'},
    {'id': 'notes', 'name': '晓琳', 'emoji': '📝', 'role': '笔记', 'color': '#c79081', 'gradient': ['#c79081', '#dab49d'], 'desc': '知识管理专家，擅长学习整理、翻译、文档编写、信息检索'},
    {'id': 'media', 'name': '音韵', 'emoji': '🎨', 'role': '多媒体', 'color': '#a18cd1', 'gradient': ['#a18cd1', '#fbc2eb'], 'desc': '多媒体创作达人，擅长图片设计、视频制作、音频编辑、剧本创作'},
    {'id': 'auto', 'name': '智家', 'emoji': '🏠', 'role': '自动化', 'color': '#89b4c4', 'gradient': ['#89b4c4', '#a8d8ea'], 'desc': '自动化工具专家，擅长脚本编写、批量处理、效率工具开发'},
  ];
  static const Map<String, Map<String, String>> _agentInfo = {
    'lingxi': {'name': '灵犀', 'abbr': 'LX', 'color': '#667eea', 'role': '队长', 'desc': '智能调度队长'},
    'captain': {'name': '灵犀', 'abbr': 'LX', 'color': '#667eea', 'role': '队长', 'desc': '智能调度队长'},
    'coder': {'name': '云溪', 'abbr': 'YX', 'color': '#4facfe', 'role': '代码', 'desc': '全栈开发专家'},
    'operator': {'name': '若曦', 'abbr': 'RX', 'color': '#43e97b', 'role': '运营', 'desc': '数据分析专家'},
    'ops': {'name': '若曦', 'abbr': 'RX', 'color': '#43e97b', 'role': '运营', 'desc': '数据分析专家'},
    'inventor': {'name': '紫萱', 'abbr': 'ZX', 'color': '#fa709a', 'role': '创意', 'desc': '创意策划大师'},
    'pm': {'name': '梓萱', 'abbr': 'ZX', 'color': '#f5576c', 'role': '产品', 'desc': '产品经理'},
    'notes': {'name': '晓琳', 'abbr': 'XL', 'color': '#c79081', 'role': '笔记', 'desc': '知识管理专家'},
    'noter': {'name': '晓琳', 'abbr': 'XL', 'color': '#c79081', 'role': '笔记', 'desc': '知识管理专家'},
    'media': {'name': '音韵', 'abbr': 'YY', 'color': '#a18cd1', 'role': '多媒体', 'desc': '多媒体创作达人'},
    'auto': {'name': '智家', 'abbr': 'ZJ', 'color': '#89b4c4', 'role': '自动化', 'desc': '自动化工具专家'},
    'smart': {'name': '智家', 'abbr': 'ZJ', 'color': '#89b4c4', 'role': '自动化', 'desc': '自动化工具专家'},
  };
  static const Map<String, List<String>> _tplMembers = {
    'lingxi-team': ['lingxi', 'coder', 'operator', 'inventor', 'pm', 'notes', 'media', 'auto'],
    'dev-team': ['lingxi', 'coder', 'pm'],
    'content-team': ['lingxi', 'inventor', 'media', 'notes'],
  };

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 9, vsync: this);
    _breathCtrl = AnimationController(vsync: this, duration: const Duration(seconds: 3))..repeat();
    _typeCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))..repeat();
    _loadStatus();
    _loadOpenClawAgents();
    _loadTemplates();
  }
  @override
  void dispose() {
    _tabController.dispose();
    _breathCtrl.dispose();
    _typeCtrl.dispose();
    super.dispose();
  }

  static const Map<String, String> _agentIdMap = {
    'main': 'captain', 'coder': 'coder', 'ops': 'operator', 'inventor': 'inventor',
    'pm': 'pm', 'noter': 'notes', 'media': 'media', 'smart': 'auto',
  };

  void _applyDefaultAgents({String source = 'local'}) {
    if (!mounted) return;
    setState(() {
      _agents = _defaultAgents.map((a) => Map<String, dynamic>.from(a)..['status'] = 'idle').toList();
      _source = source;
      _isLoading = false;
    });
  }

  Future<bool> _loadStatusViaLume() async {
    try {
      if (!rpcConnected) {
        final lume = LumeWebSocketService();
        if (!lume.isConnecting) await lume.connect().catchError((_) {});
        await Future.delayed(const Duration(milliseconds: 600));
      }
      if (!rpcConnected) return false;
      final res = await rpcGatewayCall('tools.invoke', {
        'name': 'sessions_list',
        'args': {'activeMinutes': 60, 'limit': 50, 'messageLimit': 1},
      });
      final payload = rpcGatewayPayload(res);
      if (payload == null || !mounted) return false;
      dynamic raw = payload['output'];
      if (raw is Map && raw['content'] is List) {
        for (final block in raw['content']) {
          if (block is Map && block['type'] == 'text' && block['text'] is String) {
            try {
              raw = jsonDecode(block['text'] as String);
            } catch (_) {}
            break;
          }
        }
      }
      final sessions = raw is Map ? (raw['sessions'] as List? ?? []) : (raw is List ? raw : []);
      final statusByAgent = <String, String>{};
      for (final s in sessions) {
        if (s is! Map) continue;
        final key = (s['key'] ?? s['sessionKey'] ?? '').toString();
        final m = RegExp(r'^agent:(\w+)').firstMatch(key);
        if (m == null) continue;
        final agentKey = m.group(1)!;
        final uiId = _agentIdMap[agentKey] ?? agentKey;
        statusByAgent[uiId] = (s['isRunning'] == true || s['running'] == true) ? 'working' : 'idle';
      }
      final newAgents = _defaultAgents.map((a) {
        final copy = Map<String, dynamic>.from(a);
        copy['status'] = statusByAgent[a['id']] ?? 'idle';
        return copy;
      }).toList();
      if (!mounted) return false;
      setState(() { _agents = newAgents; _source = 'lume'; _isLoading = false; });
      return true;
    } catch (e, st) {
      debugPrint('[workspace] Lume status failed: $e\n$st');
      return false;
    }
  }

  Future<void> _loadOpenClawAgents() async {
    await _ensureRpc();
    if (!rpcConnected) return;
    try {
      final list = await GatewayAgentsService.fetchAgents();
      if (mounted && list != null) setState(() => _openClawAgents = list);
    } catch (e) {
      debugPrint('[workspace] load OpenClaw agents failed: $e');
    }
  }

  Future<void> _onTeamChanged() async {
    if (mounted) setState(() => _marketRefreshNonce++);
    await Future.wait([_loadOpenClawAgents(), _loadStatus()]);
  }

  Future<void> _syncMarketUninstall(String agentId) async {
    try {
      await ApiService().post('/api/market/uninstall-by-agent', data: {'agentId': agentId});
    } catch (e) {
      debugPrint('[workspace] sync market uninstall failed: $e');
    }
  }

  List<Map<String, dynamic>> get _customOpenClawAgents => _openClawAgents.where((a) {
    final id = a['id']?.toString() ?? '';
    return id.isNotEmpty && !_presetOpenClawIds.contains(id);
  }).toList();

  Future<void> _loadStatus() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    if (await _loadStatusViaLume()) return;
    try {
      final api = ApiService();
      final uid = Provider.of<AppProvider>(context, listen: false).user?.id ?? '';
      final resp = await api.get('/api/agent-workspace/status', queryParameters: uid.isNotEmpty ? {'userId': uid} : null);
      final data = resp.data;
      if (!mounted) return;
      if (data is Map && data['agents'] is List) {
        final newAgents = List<Map<String, dynamic>>.from(data['agents'] as List);
        for (final a in newAgents) {
          final old = _agents.cast<Map<String, dynamic>?>().firstWhere((e) => e?['id'] == a['id'], orElse: () => null);
          if (old != null && old['status'] != a['status']) {
            _addLog(a['id'] ?? '', a['status'] ?? 'idle', a['currentTask']?['title'] ?? '');
          }
        }
        setState(() {
          _agents = newAgents;
          _source = data['source']?.toString() ?? 'mock';
          _isLoading = false;
        });
        return;
      }
      _applyDefaultAgents(source: 'local');
    } catch (e) {
      debugPrint('[workspace] HTTP status failed: $e');
      _applyDefaultAgents(source: 'local');
    }
  }

  Future<void> _loadTemplates() async {
    if (_templatesLoading) return;
    setState(() => _templatesLoading = true);
    try {
      final t = await ApiService().getTemplates();
      if (mounted) setState(() {
        _templates = t.isNotEmpty ? t : [
          {'templateId': 'lingxi-team', 'templateName': '灵犀全能团队', 'description': '灵犀 + 多个专业 Agent', 'memberCount': 8, 'category': 'assistant'},
          {'templateId': 'dev-team', 'templateName': '敏捷开发团队', 'description': '灵犀 + 云溪 + 梓萱', 'memberCount': 3, 'category': 'development'},
          {'templateId': 'content-team', 'templateName': '内容创作团队', 'description': '灵犀 + 紫萱 + 音韵 + 晓琳', 'memberCount': 4, 'category': 'marketing'},
        ];
        _templatesLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _templates = [
          {'templateId': 'lingxi-team', 'templateName': '灵犀全能团队', 'description': '灵犀 + 多个专业 Agent', 'memberCount': 8, 'category': 'assistant'},
          {'templateId': 'dev-team', 'templateName': '敏捷开发团队', 'description': '灵犀 + 云溪 + 梓萱', 'memberCount': 3, 'category': 'development'},
          {'templateId': 'content-team', 'templateName': '内容创作团队', 'description': '灵犀 + 紫萱 + 音韵 + 晓琳', 'memberCount': 4, 'category': 'marketing'},
        ];
        _templatesLoading = false;
      });
    }
  }

  void _addLog(String agentId, String status, String taskTitle) {
    final info = _agentInfo[agentId];
    final name = info?['name'] ?? agentId;
    final color = info?['color'] ?? '#888888';
    String msg;
    switch (status) {
      case 'working': msg = taskTitle.isNotEmpty ? '开始 $taskTitle' : '开始新任务'; break;
      case 'idle': msg = taskTitle.isNotEmpty ? '完成 $taskTitle' : '进入空闲'; break;
      case 'error': msg = '任务异常'; break;
      case 'queued': msg = '排队等待中'; break;
      default: msg = status;
    }
    _logs.insert(0, {'time': DateTime.now().toString().substring(11, 16), 'name': name, 'color': color, 'msg': msg, 'status': status});
    if (_logs.length > 100) _logs = _logs.sublist(0, 100);
  }

  Color _pc(String h) => Color(int.parse('FF${h.replaceAll('#', '')}', radix: 16));
  Color _sc(String s) => const {'working': Color(0xFF22C55E), 'queued': Color(0xFFF59E0B), 'error': Color(0xFFEF4444), 'offline': Color(0xFF9CA3AF)}[s] ?? const Color(0xFF6B7280);
  String _sl(String s) => const {'working': '工作中', 'queued': '排队中', 'error': '异常', 'offline': '离线'}[s] ?? '空闲';
  String _cid(String id) {
    if (id == 'captain') return 'lingxi';
    if (id == 'noter') return 'notes';
    if (id == 'smart') return 'auto';
    if (id == 'ops') return 'operator';
    return id;
  }

  @override
  Widget build(BuildContext context) {
    final dk = Theme.of(context).brightness == Brightness.dark;
    final bg = dk ? const Color(0xFF1A1A2E) : const Color(0xFFF5F1EB);
    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        title: const Text('办公区'), backgroundColor: dk ? const Color(0xFF1A1A2E) : Colors.white, elevation: 0,
        actions: [
          if (_source == 'openclaw' || _source == 'lume')
            Container(
              margin: const EdgeInsets.only(right: 8, top: 14),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(color: const Color(0xFF22C55E).withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                const Icon(Icons.cloud_done, size: 14, color: Color(0xFF22C55E)),
                const SizedBox(width: 4),
                Text(_source == 'lume' ? 'Lume' : '实时', style: const TextStyle(fontSize: 12, color: Color(0xFF22C55E))),
              ]),
            ),
          IconButton(icon: const Icon(Icons.refresh, size: 20), onPressed: _loadStatus),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          labelColor: const Color(0xFF667eea),
          unselectedLabelColor: dk ? Colors.white54 : Colors.black38,
          indicatorColor: const Color(0xFF667eea),
          labelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          unselectedLabelStyle: TextStyle(fontSize: 12),
          tabs: const [
            Tab(icon: Icon(Icons.grid_view_outlined, size: 18), text: '概览'),
            Tab(icon: Icon(Icons.people_outline, size: 18), text: '管理'),
            Tab(icon: Icon(Icons.dashboard_outlined, size: 18), text: '模板'),
            Tab(icon: Icon(Icons.receipt_long_outlined, size: 18), text: '日志'),
            Tab(icon: Icon(Icons.menu_book_outlined, size: 18), text: '知识库'),
            Tab(icon: Icon(Icons.storefront_outlined, size: 18), text: '市场'),
            Tab(icon: Icon(Icons.account_tree_outlined, size: 18), text: '工作流'),
            Tab(icon: Icon(Icons.psychology_outlined, size: 18), text: '记忆'),
            Tab(icon: Icon(Icons.bolt_outlined, size: 18), text: '触发器'),
          ],
        ),
      ),
      body: TabBarView(controller: _tabController, children: [
        _buildOverviewTab(dk),
        _buildManageTab(dk),
        _buildTemplatesTab(dk),
        _buildLogsTab(dk),
        KnowledgeTab(dk: dk),
        MarketTab(dk: dk, onTeamChanged: _onTeamChanged, refreshNonce: _marketRefreshNonce),
        WorkflowTab(dk: dk),
        MemoryTab(dk: dk),
        TriggerTab(dk: dk),
      ]),
    );
  }

  // ======================== OVERVIEW TAB ========================
  Widget _buildOverviewTab(bool dk) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _loadStatus,
      child: Column(children: [
        const SizedBox(height: 8),
        Expanded(
          child: OfficeScene(
            agents: _agents,
            onAgentTap: (agent) => _detail(agent),
          ),
        ),
      ]),
    );
  }

  // ======================== MANAGE TAB ========================
  Widget _buildManageTab(bool dk) {
    final appProvider = Provider.of<AppProvider>(context);
    final myAgents = appProvider.user?.agents ?? [];
    final textColor = dk ? Colors.white : Colors.black87;
    final cardBg = dk ? const Color(0xFF252540) : Colors.white;
    final seen = <String>{};
    final display = <String>[];
    for (final id in myAgents) { final c = _cid(id); if (!seen.contains(c)) { seen.add(c); display.add(id); } }
    final avail = <String>[];
    final seenA = <String>{};
    for (final id in _agentInfo.keys) {
      final c = _cid(id);
      if (!seen.contains(c) && !seenA.contains(c)) { seenA.add(c); avail.add(id); }
    }
    final customAgents = _customOpenClawAgents;
    final totalCount = display.length + customAgents.length;
    return RefreshIndicator(
      onRefresh: () async { await _loadOpenClawAgents(); await _loadStatus(); },
      child: ListView(padding: EdgeInsets.all(16), children: [
        Row(children: [
          Text('团队成员', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: textColor)),
          const Spacer(),
          Container(padding: EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: (_source == 'openclaw' || _source == 'lume') ? const Color(0xFF22C55E).withOpacity(0.1) : Colors.grey.withOpacity(0.1), borderRadius: BorderRadius.circular(10)), child: Text('$totalCount 人', style: TextStyle(fontSize: 11, color: (_source == 'openclaw' || _source == 'lume') ? const Color(0xFF22C55E) : Colors.grey))),
        ]),
        const SizedBox(height: 12),
        ...display.map((id) {
          final info = _agentInfo[id] ?? {'name': id, 'abbr': 'AI', 'color': '#888888', 'role': '', 'desc': ''};
          final isCaptain = id == 'lingxi' || id == 'captain';
          final as_ = _agents.cast<Map<String, dynamic>?>().firstWhere((a) => a?['id'] == id, orElse: () => null);
          final status = as_?['status'] ?? 'idle';
          return Container(margin: EdgeInsets.only(bottom: 8), padding: EdgeInsets.all(12), decoration: BoxDecoration(color: cardBg, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))]), child: Row(children: [
            Container(width: 40, height: 40, decoration: BoxDecoration(gradient: LinearGradient(colors: [_pc(info['color']!), _pc(info['color']!).withOpacity(0.7)]), borderRadius: BorderRadius.circular(12)), child: Center(child: Text(info['abbr']!, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)))),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Text(info['name']!, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: textColor)), const SizedBox(width: 6), Text(info['role']!, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)), const SizedBox(width: 6), Container(width: 6, height: 6, decoration: BoxDecoration(color: _sc(status), shape: BoxShape.circle))]),
              const SizedBox(height: 2), Text(info['desc']!, style: TextStyle(fontSize: 11, color: Colors.grey.shade400), maxLines: 1, overflow: TextOverflow.ellipsis),
            ])),
            if (isCaptain) Container(padding: EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: const Color(0xFF667eea).withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: const Text('队长', style: TextStyle(color: Color(0xFF667eea), fontSize: 11, fontWeight: FontWeight.w600)))
            else IconButton(icon: Icon(Icons.remove_circle_outline, color: Colors.red.shade300, size: 20), onPressed: () => _removeMember(id, appProvider)),
          ]));
        }),
        ...customAgents.map((agent) {
          final id = agent['id']?.toString() ?? '';
          final name = agent['name']?.toString() ?? id;
          final abbr = name.length >= 2 ? name.substring(0, 2) : (name.isNotEmpty ? name : 'AI');
          return Container(margin: EdgeInsets.only(bottom: 8), padding: EdgeInsets.all(12), decoration: BoxDecoration(color: cardBg, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))]), child: Row(children: [
            Container(width: 40, height: 40, decoration: BoxDecoration(gradient: LinearGradient(colors: [const Color(0xFF667eea), const Color(0xFF764ba2)]), borderRadius: BorderRadius.circular(12)), child: Center(child: Text(abbr, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)))),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Text(name, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: textColor)), const SizedBox(width: 6), Container(padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: const Color(0xFF667eea).withOpacity(0.1), borderRadius: BorderRadius.circular(4)), child: const Text('市场', style: TextStyle(fontSize: 9, color: Color(0xFF667eea), fontWeight: FontWeight.w600)))]),
              const SizedBox(height: 2), Text(id, style: TextStyle(fontSize: 11, color: Colors.grey.shade400), maxLines: 1, overflow: TextOverflow.ellipsis),
            ])),
            IconButton(icon: Icon(Icons.remove_circle_outline, color: Colors.red.shade300, size: 20), onPressed: () => _removeCustomAgent(id, name)),
          ]));
        }),
        const SizedBox(height: 20),
        Container(padding: EdgeInsets.all(16), decoration: BoxDecoration(color: dk ? const Color(0xFF1E1E38) : const Color(0xFFF8F9FA), borderRadius: BorderRadius.circular(16)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('添加成员', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: textColor)),
          const SizedBox(height: 10),
          if (avail.isEmpty) Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('已添加全部成员', style: TextStyle(color: Colors.grey.shade400, fontSize: 12)))
          else Wrap(spacing: 8, runSpacing: 8, children: avail.map((id) {
            final info = _agentInfo[id]!;
            return ActionChip(avatar: Icon(Icons.add_circle_outline, size: 16, color: _pc(info['color']!)), label: Text(info['name']!), onPressed: () => _addMember(id, appProvider));
          }).toList()),
        ])),
      ]),
    );
  }

  Future<void> _ensureRpc() async {
    if (rpcConnected) return;
    final lume = LumeWebSocketService();
    if (!lume.isConnecting) await lume.connect().catchError((_) {});
    await Future.delayed(const Duration(milliseconds: 700));
  }

  Future<void> _removeCustomAgent(String openClawId, String name) async {
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(title: const Text('移除成员'), content: Text('确定移除 $name？将从 OpenClaw 配置中移除。'), actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('取消')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('确定', style: TextStyle(color: Colors.red)))]));
    if (ok != true) return;
    await _ensureRpc();
    if (!rpcConnected) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('未连接服务器'), backgroundColor: Colors.red));
      return;
    }
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('正在移除 $name...')));
    final gwOk = await GatewayAgentsService.removeAgent(openClawId);
    if (!gwOk) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('OpenClaw 移除失败'), backgroundColor: Colors.red));
      return;
    }
    await _syncMarketUninstall(openClawId);
    await _onTeamChanged();
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('已移除 $name')));
  }

  Future<void> _removeMember(String id, AppProvider p) async {
    final info = _agentInfo[id] ?? {'name': id};
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(title: const Text('移除成员'), content: Text('确定移除 ${info['name']}？将从 OpenClaw 配置中移除。'), actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('取消')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('确定', style: TextStyle(color: Colors.red)))]));
    if (ok != true) return;
    final uid = p.user?.id ?? '';
    final na = p.user?.agents.where((a) => a != id).toList() ?? [];
    if (na.isEmpty) { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('至少保留一个成员'))); return; }
    await _ensureRpc();
    if (!rpcConnected) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('未连接服务器'), backgroundColor: Colors.red));
      return;
    }
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('正在移除 ${info['name']}...')));
    final resolvedId = GatewayAgentsService.resolveOpenClawId(id, _openClawAgents)
        ?? GatewayAgentsService.toOpenClawId(id);
    final gwOk = await GatewayAgentsService.removeAgent(id);
    if (!gwOk) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('OpenClaw 移除失败'), backgroundColor: Colors.red));
      return;
    }
    await _syncMarketUninstall(resolvedId);
    final r = await ApiService().updateMyAgents(uid, na);
    if (r && p.user != null) {
      p.setUser(p.user!.copyWith(agents: na));
      if (mounted) setState(() { _source = 'lume'; });
    }
    await _onTeamChanged();
  }

  Future<void> _addMember(String id, AppProvider p) async {
    final info = _agentInfo[id] ?? {'name': id, 'abbr': 'AI'};
    final uid = p.user?.id ?? '';
    final na = [...?p.user?.agents, id];
    await _ensureRpc();
    if (!rpcConnected) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('未连接服务器'), backgroundColor: Colors.red));
      return;
    }
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('正在添加 ${info['name']}...')));
    final gwOk = await GatewayAgentsService.addAgent(id, name: info['name'], emoji: info['abbr']);
    if (!gwOk) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('OpenClaw 添加失败'), backgroundColor: Colors.red));
      return;
    }
    final r = await ApiService().updateMyAgents(uid, na);
    if (r && p.user != null) {
      p.setUser(p.user!.copyWith(agents: na));
      if (mounted) setState(() { _source = 'lume'; });
    }
    await _loadOpenClawAgents();
  }

  // ======================== TEMPLATES TAB ========================
  Widget _buildTemplatesTab(bool dk) {
    final textColor = dk ? Colors.white : Colors.black87;
    final cardBg = dk ? const Color(0xFF252540) : Colors.white;
    if (_selectedTemplate != null) return _buildTplDetail(dk, textColor, cardBg);
    const cats = ['all', 'development', 'marketing', 'assistant', 'custom'];
    const catLabels = {'all': '全部', 'development': '开发', 'marketing': '营销', 'assistant': '通用', 'custom': '我的模板'};
    final filtered = _tplCategory == 'all' ? _templates
        : _tplCategory == 'custom' ? _templates.where((t) => t['isCustom'] == true).toList()
        : _templates.where((t) => t['category'] == _tplCategory).toList();
    return Column(children: [
      Container(height: 44, color: dk ? const Color(0xFF1A1A2E) : Colors.white, child: ListView(scrollDirection: Axis.horizontal, padding: EdgeInsets.symmetric(horizontal: 8), children: cats.map((c) {
        final active = _tplCategory == c;
        return GestureDetector(onTap: () => setState(() => _tplCategory = c), child: Container(padding: EdgeInsets.symmetric(horizontal: 16, vertical: 10), decoration: BoxDecoration(border: Border(bottom: BorderSide(color: active ? const Color(0xFF667eea) : Colors.transparent, width: 2))), child: Text(catLabels[c]!, style: TextStyle(fontSize: 13, fontWeight: active ? FontWeight.w600 : FontWeight.normal, color: active ? const Color(0xFF667eea) : (dk ? Colors.white54 : Colors.black45)))));
      }).toList())),
      const Divider(height: 1),
      Expanded(child: _templatesLoading ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(onRefresh: _loadTemplates, child: filtered.isEmpty
          ? ListView(children: [SizedBox(height: 200, child: Center(child: Text('暂无模板', style: TextStyle(color: Colors.grey.shade400))))])
        : GridView.builder(padding: EdgeInsets.all(16), gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.82), itemCount: filtered.length, itemBuilder: (_, i) => _tplCard(filtered[i], dk, cardBg)))),
    ]);
  }

  Widget _tplCard(Map<String, dynamic> t, bool dk, Color cardBg) {
    final name = t['templateName'] ?? t['name'] ?? '';
    final desc = t['description'] ?? '';
    final mc = t['memberCount'] ?? (t['members'] as List?)?.length ?? 0;
    final cat = t['category'] ?? 'general';
    final snap = t['isSnapshot'] == true;
    final cc = {'development': '#4facfe', 'marketing': '#fa709a', 'assistant': '#667eea'};
    final cl = {'development': '开发', 'marketing': '营销', 'assistant': '通用'};
    final color = _pc(cc[cat] ?? '#888888');
    final abbr = name.length >= 2 ? name.substring(0, 2) : 'TP';
    return GestureDetector(onTap: () async {
      final tid = t['templateId'] ?? t['id'];
      if (tid != null) { final d = await ApiService().getTemplateDetail(tid.toString()); if (d != null && mounted) { setState(() => _selectedTemplate = d); return; } }
      setState(() => _selectedTemplate = t);
    }, child: Container(padding: EdgeInsets.all(16), decoration: BoxDecoration(color: cardBg, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))], border: snap ? Border.all(color: const Color(0xFF43e97b), width: 2) : null), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(width: 40, height: 40, decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(10)), child: Center(child: snap ? Icon(Icons.save, color: color, size: 20) : Text(abbr, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 13)))),
      const SizedBox(height: 10),
      Text(name, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: dk ? Colors.white : Colors.black87), maxLines: 1, overflow: TextOverflow.ellipsis),
      const SizedBox(height: 4),
      Expanded(child: Text(desc, style: TextStyle(fontSize: 11, color: Colors.grey.shade500, height: 1.4), maxLines: 2, overflow: TextOverflow.ellipsis)),
      const SizedBox(height: 8),
      Row(children: [
        if (mc > 0) Container(padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: Colors.grey.withOpacity(0.1), borderRadius: BorderRadius.circular(6)), child: Text('$mc 人', style: TextStyle(fontSize: 10, color: Colors.grey.shade600))),
        const SizedBox(width: 6),
        Container(padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: Colors.grey.withOpacity(0.1), borderRadius: BorderRadius.circular(6)), child: Text(cl[cat] ?? '通用', style: TextStyle(fontSize: 10, color: Colors.grey.shade600))),
      ]),
    ])));
  }

  Widget _buildTplDetail(bool dk, Color textColor, Color cardBg) {
    final t = _selectedTemplate!;
    final name = t['templateName'] ?? t['name'] ?? '';
    final desc = t['description'] ?? '';
    final members = t['members'] as List? ?? [];
    final tid = (t['templateId'] ?? t['id'] ?? '').toString();
    List<Map<String, dynamic>> dm;
    if (members.isEmpty && _tplMembers.containsKey(tid)) {
      dm = _tplMembers[tid]!.map((id) { final info = _agentInfo[id] ?? {'name': id, 'abbr': 'AI', 'color': '#888888', 'role': '', 'desc': ''}; return <String, dynamic>{'id': id, ...info}; }).toList();
    } else { dm = members.cast<Map<String, dynamic>>(); }
    return ListView(padding: EdgeInsets.all(16), children: [
      GestureDetector(onTap: () => setState(() => _selectedTemplate = null), child: Padding(padding: EdgeInsets.only(bottom: 12), child: Row(children: [const Icon(Icons.arrow_back, size: 16, color: Color(0xFF667eea)), const SizedBox(width: 4), const Text('返回模板列表', style: TextStyle(color: Color(0xFF667eea), fontSize: 13))]))),
      Text(name, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: textColor)),
      if (desc.isNotEmpty) ...[const SizedBox(height: 8), Text(desc, style: TextStyle(fontSize: 13, color: Colors.grey.shade600, height: 1.5))],
      const SizedBox(height: 16),
      if (dm.isNotEmpty) ...[
        Text('团队成员 (${dm.length})', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: textColor)),
        const SizedBox(height: 10),
        ...dm.map((m) {
          final mId = (m['id'] ?? '') as String;
          final info = _agentInfo[mId] ?? {'name': m['name'] ?? mId, 'abbr': 'AI', 'color': '#888888', 'role': m['role'] ?? '', 'desc': m['desc'] ?? ''};
          final isD = m['isDefault'] == true || mId == 'lingxi' || mId == 'captain';
          return Container(margin: EdgeInsets.only(bottom: 8), padding: EdgeInsets.all(14), decoration: BoxDecoration(color: dk ? const Color(0xFF1E1E38) : const Color(0xFFF8F9FA), borderRadius: BorderRadius.circular(12)), child: Row(children: [
            Container(width: 36, height: 36, decoration: BoxDecoration(gradient: LinearGradient(colors: [_pc(info['color']!), _pc(info['color']!).withOpacity(0.7)]), borderRadius: BorderRadius.circular(10)), child: Center(child: Text(info['abbr']!, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)))),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(info['name']!, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: textColor)), if ((info['role'] ?? '').isNotEmpty) Text(info['role']!, style: TextStyle(fontSize: 11, color: Colors.grey.shade500))])),
            if (isD) Container(padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: const Color(0xFF667eea).withOpacity(0.1), borderRadius: BorderRadius.circular(6)), child: const Text('队长', style: TextStyle(color: Color(0xFF667eea), fontSize: 10, fontWeight: FontWeight.w600))),
          ]));
        }),
      ],
      const SizedBox(height: 20),
      SizedBox(width: double.infinity, child: ElevatedButton(
        onPressed: () async {
          final appProvider = Provider.of<AppProvider>(context, listen: false);
          final uid = appProvider.user?.id ?? '';
          final ok = await ApiService().applyTemplate(uid, tid);
          if (ok && mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('模板应用成功')));
            setState(() => _selectedTemplate = null);
            _loadStatus();
          } else if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('操作失败')));
          }
        },
        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF667eea), foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), padding: EdgeInsets.symmetric(vertical: 14)),
        child: const Text('应用此模板', style: TextStyle(fontWeight: FontWeight.w600)),
      )),
    ]);
  }

  // ======================== LOGS TAB ========================
  Widget _buildLogsTab(bool dk) {
    if (_logs.isEmpty) return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.receipt_long, size: 48, color: Colors.grey.shade300), const SizedBox(height: 12), Text('暂无工作日志', style: TextStyle(color: Colors.grey.shade400, fontSize: 14))]));
    return RefreshIndicator(
      onRefresh: () async { _logs.clear(); setState(() {}); await _loadStatus(); },
      child: ListView.separated(
        padding: EdgeInsets.all(16),
        itemCount: _logs.length,
        separatorBuilder: (_, __) => Divider(height: 1, color: Colors.grey.withOpacity(0.1)),
        itemBuilder: (_, i) {
          final log = _logs[i];
          final time = log['time'] ?? '--:--';
          final name = log['name'] ?? '';
          final color = log['color'] ?? '#888888';
          final msg = log['msg'] ?? '';
          final status = log['status'] ?? '';
          return Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 40, child: Text(time, style: TextStyle(fontSize: 10, color: Colors.grey.shade400))),
            Container(width: 6, height: 6, margin: EdgeInsets.only(top: 5), decoration: BoxDecoration(color: _sc(status), shape: BoxShape.circle)),
            const SizedBox(width: 6),
            SizedBox(width: 32, child: Text(name, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: _pc(color)))),
            Expanded(child: Text(msg, style: TextStyle(fontSize: 12, color: dk ? Colors.white70 : Colors.black54))),
          ]));
        },
      ),
    );
  }

  // ======================== DETAIL MODAL ========================
  void _detail(Map<String, dynamic> a) {
    final s = a['status'] ?? 'idle';
    final t = a['currentTask'] as Map<String, dynamic>?;
    final st = a['stats'] as Map<String, dynamic>?;
    final color = _pc(a['color'] ?? '#667eea');
    final grad = a['gradient'] as List?;
    final g0 = grad?[0] as String? ?? '#667eea';
    final g1 = grad?[1] as String? ?? '#764ba2';
    final name = a['name'] ?? '未知';
    final role = a['role'] ?? '';
    final hair = a['hair'] ?? 'purple-cape';

    showModalBottomSheet(context: context, backgroundColor: Colors.transparent, builder: (ctx) => Container(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      padding: EdgeInsets.all(20),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Character portrait + info
        Row(children: [
          Container(
            width: 90, height: 110,
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [color.withOpacity(0.08), color.withOpacity(0.03)]),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Center(child: _buildFrontChar(g0, g1, hair, s)),
          ),
          const SizedBox(width: 16),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 2),
            Text(role, style: TextStyle(fontSize: 14, color: Colors.grey)),
            const SizedBox(height: 4),
            Text(a['desc'] ?? '', style: TextStyle(fontSize: 12, color: Colors.black45), maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 6),
            Container(
              padding: EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(color: _sc(s).withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
              child: Text(_sl(s), style: TextStyle(color: _sc(s), fontWeight: FontWeight.w600, fontSize: 13)),
            ),
          ]),
          ),
        ]),
        if (t != null) ...[const SizedBox(height: 16), const Text('当前任务', style: TextStyle(fontWeight: FontWeight.w600)), const SizedBox(height: 8), Container(width: double.infinity, padding: EdgeInsets.all(12), decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(10), border: Border.all(color: color.withOpacity(0.1))), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(t['title'] ?? '', style: TextStyle(fontWeight: FontWeight.w600)), const SizedBox(height: 6), ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: ((t['progress'] as int?) ?? 0) / 100.0, backgroundColor: Colors.black.withOpacity(0.05), valueColor: AlwaysStoppedAnimation(color), minHeight: 6)), const SizedBox(height: 4), Text('步骤 ${t['step'] ?? 0}/${t['totalSteps'] ?? 0} · ${t['stepName'] ?? ''}', style: TextStyle(fontSize: 12, color: Colors.grey))]))],
        if (st != null) ...[const SizedBox(height: 12), Row(children: [_chip('✅ 完成', '${st['tasksCompleted'] ?? 0}'), const SizedBox(width: 12), _chip('📅 今日', '${st['tasksToday'] ?? 0}'), const SizedBox(width: 12), _chip('⏱️ 响应', '${st['avgResponseTime'] ?? '-'}')])],
        const SizedBox(height: 20),
      ]),
    ));
  }

  Widget _buildFrontChar(String g0, String g1, String hair, String status) {
    return AnimatedBuilder(
      animation: status == 'working' ? _typeCtrl : _breathCtrl,
      builder: (_, child) {
        final t = (status == 'working' ? _typeCtrl : _breathCtrl).value;
        final dy = status == 'working' ? -1.0 * math.sin(t * math.pi) : -2.0 * math.sin(t * math.pi * 2);
        return Transform.translate(offset: Offset(0, dy), child: child);
      },
      child: SizedBox(width: 80, height: 100, child: CustomPaint(painter: _FrontCharPainter(g0, g1, hair))),
    );
  }

  Widget _chip(String l, String v) => Container(padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6), decoration: BoxDecoration(color: Colors.black.withOpacity(0.03), borderRadius: BorderRadius.circular(8)), child: Column(children: [Text(v, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)), Text(l, style: TextStyle(fontSize: 10, color: Colors.grey))]));
}

// ======================== FRONT-FACING CHARACTER PAINTER ========================
class _FrontCharPainter extends CustomPainter {
  final String g0, g1, hairStyle;
  _FrontCharPainter(this.g0, this.g1, this.hairStyle);
  Color _c(String h) => Color(int.parse('FF${h.replaceAll('#', '')}', radix: 16));

  @override
  void paint(Canvas c, Size s) {
    final sx = s.width / 90, sy = s.height / 100;
    c.save();
    c.scale(sx, sy);
    c.translate(0, 5);

    final bodyColor = _c(g0);
    final hairColor = _c(g1);
    final skinColor = const Color(0xFFF5DEB3);

    final shadowPaint = Paint()..color = bodyColor.withOpacity(0.4);
    c.drawOval(Rect.fromCenter(center: const Offset(45, 80), width: 40, height: 16), shadowPaint);

    c.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(28, 58, 34, 22), const Radius.circular(10)), Paint()..color = bodyColor.withOpacity(0.7));

    c.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(40, 52, 10, 10), const Radius.circular(4)), Paint()..color = skinColor.withOpacity(0.9));

    c.drawCircle(const Offset(45, 36), 17, Paint()..color = skinColor.withOpacity(0.95));

    c.drawOval(Rect.fromCenter(center: const Offset(27, 38), width: 8, height: 10), Paint()..color = const Color(0xFFF0D5A8).withOpacity(0.6));
    c.drawOval(Rect.fromCenter(center: const Offset(63, 38), width: 8, height: 10), Paint()..color = const Color(0xFFF0D5A8).withOpacity(0.6));

    _drawHair(c, hairStyle, hairColor);

    final eyePaint = Paint()..color = const Color(0xFF3A2518).withOpacity(0.7);
    final eyeWhite = Paint()..color = Colors.white.withOpacity(0.6);
    c.drawOval(Rect.fromCenter(center: const Offset(37, 36), width: 7, height: 8), eyePaint);
    c.drawCircle(const Offset(37, 35), 1.5, eyeWhite);
    c.drawOval(Rect.fromCenter(center: const Offset(53, 36), width: 7, height: 8), eyePaint);
    c.drawCircle(const Offset(53, 35), 1.5, eyeWhite);

    final smilePaint = Paint()..color = const Color(0xFFC49060).withOpacity(0.5)..style = PaintingStyle.stroke..strokeWidth = 1.2..strokeCap = StrokeCap.round;
    c.drawPath(Path()..moveTo(41, 44)..quadraticBezierTo(45, 48, 49, 44), smilePaint);

    c.drawOval(Rect.fromCenter(center: const Offset(33, 42), width: 10, height: 6), Paint()..color = const Color(0xFFF5B8B8).withOpacity(0.25));
    c.drawOval(Rect.fromCenter(center: const Offset(57, 42), width: 10, height: 6), Paint()..color = const Color(0xFFF5B8B8).withOpacity(0.25));

    final armPaint = Paint()..color = bodyColor.withOpacity(0.4)..style = PaintingStyle.stroke..strokeWidth = 5..strokeCap = StrokeCap.round;
    c.drawPath(Path()..moveTo(28, 64)..quadraticBezierTo(20, 68, 16, 72), armPaint);
    c.drawPath(Path()..moveTo(62, 64)..quadraticBezierTo(70, 68, 74, 72), armPaint);

    c.restore();
  }

  void _drawHair(Canvas c, String style, Color color) {
    final paint = Paint()..color = color;
    final strokePaint = Paint()..color = color.withOpacity(0.5)..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;

    switch (style) {
      case 'purple-cape':
        c.drawPath(Path()
          ..moveTo(28, 22)..quadraticBezierTo(28, 12, 45, 10)..quadraticBezierTo(62, 12, 62, 22)
          ..lineTo(60, 34)..quadraticBezierTo(45, 26, 30, 34)..close(), paint..color = color.withOpacity(0.85));
        c.drawPath(Path()..moveTo(30, 34)..quadraticBezierTo(32, 40, 28, 44), strokePaint..strokeWidth = 3);
        break;
      case 'blue-short':
        c.drawPath(Path()
          ..moveTo(30, 24)..quadraticBezierTo(30, 14, 45, 12)..quadraticBezierTo(60, 14, 60, 24)
          ..lineTo(58, 32)..quadraticBezierTo(45, 28, 32, 32)..close(), paint..color = color.withOpacity(0.8));
        break;
      case 'green-twintail':
        c.drawPath(Path()
          ..moveTo(28, 24)..quadraticBezierTo(28, 12, 45, 10)..quadraticBezierTo(62, 12, 62, 24)
          ..lineTo(60, 32)..quadraticBezierTo(45, 26, 30, 32)..close(), paint..color = color.withOpacity(0.8));
        c.drawOval(Rect.fromCenter(center: const Offset(20, 42), width: 10, height: 24), paint..color = color.withOpacity(0.6));
        c.drawOval(Rect.fromCenter(center: const Offset(70, 42), width: 10, height: 24), paint..color = color.withOpacity(0.6));
        break;
      case 'pink-wavy':
        c.drawPath(Path()
          ..moveTo(26, 24)..quadraticBezierTo(26, 10, 45, 8)..quadraticBezierTo(64, 10, 64, 24)
          ..lineTo(58, 32)..quadraticBezierTo(45, 26, 32, 32)..close(), paint..color = color.withOpacity(0.85));
        c.drawPath(Path()..moveTo(26, 34)..quadraticBezierTo(24, 42, 22, 48), strokePaint..strokeWidth = 4);
        c.drawPath(Path()..moveTo(64, 34)..quadraticBezierTo(66, 42, 68, 48), strokePaint..strokeWidth = 4);
        break;
      case 'red-ponytail':
        c.drawPath(Path()
          ..moveTo(30, 22)..quadraticBezierTo(30, 12, 45, 10)..quadraticBezierTo(60, 12, 60, 22)
          ..lineTo(58, 32)..quadraticBezierTo(45, 26, 32, 32)..close(), paint..color = color.withOpacity(0.85));
        c.drawPath(Path()..moveTo(56, 16)..quadraticBezierTo(64, 14, 68, 22)..quadraticBezierTo(72, 32, 66, 42), strokePaint..strokeWidth = 5);
        break;
      case 'brown-bob':
        c.drawPath(Path()
          ..moveTo(28, 24)..quadraticBezierTo(26, 14, 45, 10)..quadraticBezierTo(64, 14, 62, 24)
          ..lineTo(60, 36)..quadraticBezierTo(45, 28, 30, 36)..close(), paint..color = color.withOpacity(0.8));
        break;
      case 'indigo-long':
        c.drawPath(Path()
          ..moveTo(26, 22)..quadraticBezierTo(26, 10, 45, 8)..quadraticBezierTo(64, 10, 64, 22)
          ..lineTo(62, 34)..quadraticBezierTo(45, 26, 28, 34)..close(), paint..color = color.withOpacity(0.85));
        c.drawPath(Path()..moveTo(28, 34)..quadraticBezierTo(26, 48, 24, 58), strokePaint..strokeWidth = 4);
        c.drawPath(Path()..moveTo(62, 34)..quadraticBezierTo(64, 48, 66, 58), strokePaint..strokeWidth = 4);
        break;
      case 'cyan-bun':
        c.drawPath(Path()
          ..moveTo(32, 24)..quadraticBezierTo(32, 18, 45, 14)..quadraticBezierTo(58, 18, 58, 24)
          ..lineTo(56, 32)..quadraticBezierTo(45, 26, 34, 32)..close(), paint..color = color.withOpacity(0.8));
        c.drawCircle(const Offset(45, 10), 6, paint..color = color.withOpacity(0.65));
        break;
      default:
        c.drawPath(Path()
          ..moveTo(28, 22)..quadraticBezierTo(28, 12, 45, 10)..quadraticBezierTo(62, 12, 62, 22)
          ..lineTo(60, 34)..quadraticBezierTo(45, 26, 30, 34)..close(), paint..color = color.withOpacity(0.85));
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
