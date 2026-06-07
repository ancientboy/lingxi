import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:provider/provider.dart';
import 'dart:math' as math;

class WorkspacePage extends StatefulWidget {
  const WorkspacePage({super.key});
  @override
  State<WorkspacePage> createState() => _WorkspacePageState();
}

class _WorkspacePageState extends State<WorkspacePage> with TickerProviderStateMixin {
  bool _isLoading = true;
  List<Map<String, dynamic>> _agents = [];
  String _source = 'mock';
  late AnimationController _breathCtrl;
  late AnimationController _typeCtrl;
  late AnimationController _screenCtrl;

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
  static const _idleMsgs = ['💭 发呆中...', '☕ 休息一下', '🎵 哼歌中~', '👀 看窗外', '📖 看文档'];

  @override
  void initState() {
    super.initState();
    _breathCtrl = AnimationController(vsync: this, duration: const Duration(seconds: 3))..repeat();
    _typeCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))..repeat();
    _screenCtrl = AnimationController(vsync: this, duration: const Duration(seconds: 4))..repeat();
    _loadStatus();
  }
  @override
  void dispose() { _breathCtrl.dispose(); _typeCtrl.dispose(); _screenCtrl.dispose(); super.dispose(); }

  Future<void> _loadStatus() async {
    setState(() => _isLoading = true);
    try {
      final api = ApiService();
      final uid = Provider.of<AppProvider>(context, listen: false).user?.id ?? '';
      final resp = await api.get('/api/agent-workspace/status', queryParameters: uid.isNotEmpty ? {'userId': uid} : null);
      final data = resp.data;
      if (data is Map && data['agents'] != null && mounted) {
        setState(() { _agents = List<Map<String, dynamic>>.from(data['agents']); _source = data['source'] ?? 'mock'; _isLoading = false; });
      }
    } catch (_) {
      if (mounted) setState(() {
        _agents = _defaultAgents.map((a) => Map<String, dynamic>.from(a)..['status'] = 'idle').toList();
        _source = 'local'; _isLoading = false;
      });
    }
  }

  Color _pc(String h) => Color(int.parse('FF${h.replaceAll('#', '')}', radix: 16));
  Color _sc(String s) => const {'working': Color(0xFF22C55E), 'queued': Color(0xFFF59E0B), 'error': Color(0xFFEF4444), 'offline': Color(0xFF9CA3AF)}[s] ?? const Color(0xFF6B7280);
  String _sl(String s) => const {'working': '工作中', 'queued': '排队中', 'error': '异常', 'offline': '离线'}[s] ?? '空闲';

  @override
  Widget build(BuildContext context) {
    final dk = Theme.of(context).brightness == Brightness.dark;
    final bg = dk ? const Color(0xFF1A1A2E) : const Color(0xFFF5F1EB);
    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        title: const Text('🏢 办公区'), backgroundColor: dk ? const Color(0xFF1A1A2E) : Colors.white, elevation: 0,
        actions: [
          if (_source == 'openclaw') Container(margin: const EdgeInsets.only(right: 8, top: 14), padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: const Color(0xFF22C55E).withOpacity(0.1), borderRadius: BorderRadius.circular(12)), child: const Row(children: [Icon(Icons.cloud_done, size: 14, color: Color(0xFF22C55E)), SizedBox(width: 4), Text('实时', style: TextStyle(fontSize: 12, color: Color(0xFF22C55E)))])),
          IconButton(icon: const Icon(Icons.refresh, size: 20), onPressed: _loadStatus),
        ],
      ),
      body: _isLoading ? const Center(child: CircularProgressIndicator()) : RefreshIndicator(
        onRefresh: _loadStatus,
        child: ListView(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8), children: [
          // 我的团队
          _buildTeamSection(),
          const SizedBox(height: 16),
          ...List.generate((_agents.length / 2).ceil(), (row) {
            final pair = [row * 2, row * 2 + 1].where((i) => i < _agents.length).map((i) => _agents[i]).toList();
            return Padding(padding: const EdgeInsets.only(bottom: 14), child: Row(children: pair.map((a) => Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: _desk(a)))).toList()));
          }),
        ]),
      ),
    );
  }

  Widget _actBtn(IconData icon, String title, Color c, bool dk, VoidCallback onTap) {
    return Material(color: dk ? const Color(0xFF252540) : Colors.white, borderRadius: BorderRadius.circular(12), elevation: 2, shadowColor: Colors.black.withOpacity(0.05),
      child: InkWell(borderRadius: BorderRadius.circular(12), onTap: onTap, child: Padding(padding: const EdgeInsets.all(14), child: Row(children: [
        Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: c.withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: Icon(icon, color: c, size: 20)),
        const SizedBox(width: 10), Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
      ]))));
  }

  // ======================== 我的团队 ========================
  Widget _buildTeamSection() {
    final appProvider = Provider.of<AppProvider>(context, listen: false);
    final user = appProvider.user;
    final agents = user?.agents ?? [];
    final dk = Theme.of(context).brightness == Brightness.dark;
    final textColor = dk ? Colors.white : Colors.black87;

    const allAgents = {
      'lingxi': {'name': '灵犀', 'icon': Icons.auto_awesome, 'color': Color(0xFF667eea)},
      'coder': {'name': '云溪', 'icon': Icons.code, 'color': Color(0xFF4facfe)},
      'ops': {'name': '若曦', 'icon': Icons.bar_chart, 'color': Color(0xFF43e97b)},
      'inventor': {'name': '紫萱', 'icon': Icons.lightbulb, 'color': Color(0xFFfa709a)},
      'pm': {'name': '梓萱', 'icon': Icons.track_changes, 'color': Color(0xFFf5576c)},
      'noter': {'name': '晓琳', 'icon': Icons.note, 'color': Color(0xFFc79081)},
      'media': {'name': '音韵', 'icon': Icons.palette, 'color': Color(0xFFa18cd1)},
      'smart': {'name': '智家', 'icon': Icons.home, 'color': Color(0xFF89b4c4)},
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Text('👥 我的团队', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: textColor)),
          const Spacer(),
          GestureDetector(
            onTap: () => _showTeamManageDialog(agents, allAgents),
            child: Text('管理', style: TextStyle(fontSize: 13, color: Constants.primaryColor, fontWeight: FontWeight.w500)),
          ),
        ]),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: agents.map((id) {
            final info = allAgents[id] ?? {'name': id, 'icon': Icons.person, 'color': Color(0xFF888888)};
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: (info['color'] as Color).withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(info['icon'] as IconData, size: 14, color: info['color'] as Color),
                const SizedBox(width: 4),
                Text(info['name'] as String, style: TextStyle(fontSize: 12, color: info['color'] as Color, fontWeight: FontWeight.w500)),
              ]),
            );
          }).toList(),
        ),
      ],
    );
  }

  void _showTeamManageDialog(List<String> myAgents, Map<String, Map<String, dynamic>> allAgents) {
    final appProvider = Provider.of<AppProvider>(context, listen: false);
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          final available = allAgents.keys.where((id) => !myAgents.contains(id)).toList();
          return AlertDialog(
            title: const Row(children: [Icon(Icons.people_outline, color: Constants.primaryColor), SizedBox(width: 8), Text('团队管理')]),
            content: SizedBox(width: 350, child: SingleChildScrollView(child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('当前成员', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                const SizedBox(height: 8),
                ...myAgents.map((id) {
                  final info = allAgents[id] ?? {'name': id, 'icon': Icons.smart_toy};
                  return Card(margin: const EdgeInsets.only(bottom: 6), child: ListTile(
                    dense: true,
                    leading: CircleAvatar(backgroundColor: Constants.primaryColor.withOpacity(0.1), child: Icon(info['icon'] as IconData, color: Constants.primaryColor, size: 20)),
                    title: Text(info['name'] as String),
                    trailing: id == 'lingxi' ? Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: Constants.primaryColor, borderRadius: BorderRadius.circular(10)), child: const Text('队长', style: TextStyle(color: Colors.white, fontSize: 11))) : IconButton(icon: const Icon(Icons.remove_circle_outline, color: Colors.red, size: 20), onPressed: () async {
                      final newAgents = myAgents.where((a) => a != id).toList();
                      if (newAgents.isEmpty) { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('至少保留一个'))); return; }
                      final ok = await ApiService().updateMyAgents(appProvider.user!.id, newAgents);
                      if (ok && appProvider.user != null) { appProvider.setUser(appProvider.user!.copyWith(agents: newAgents)); setDialogState(() { myAgents = newAgents; }); }
                    }),
                  ));
                }),
                if (available.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  const Text('可添加', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, runSpacing: 8, children: available.map((id) {
                    final info = allAgents[id]!;
                    return ActionChip(avatar: Icon(info['icon'] as IconData, size: 16, color: Constants.primaryColor), label: Text(info['name'] as String), onPressed: () async {
                      final newAgents = [...myAgents, id];
                      final ok = await ApiService().updateMyAgents(appProvider.user!.id, newAgents);
                      if (ok && appProvider.user != null) { appProvider.setUser(appProvider.user!.copyWith(agents: newAgents)); setDialogState(() { myAgents = newAgents; }); }
                    });
                  }).toList()),
                ],
              ],
            ))),
            actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('关闭'))],
          );
        },
      ),
    );
  }

  // ======================== DESK UNIT ========================
  // Exact match of web version layout:
  //   Desk is the container. Everything positioned relative to it.
  //   Z-order (bottom to top): desk surface → chair body → character → monitor → chair back
  //
  //   Web z-indices: chair-body=3, agent-char=5, monitor=6, chair-back=8
  //
  //   Visual (our view from behind):
  //     [Thought Bubble]  ← topmost
  //     [Monitor on desk]
  //     [Character head] peeking above chair back
  //     [Chair Back] covering char body  ← frontmost
  //     [Desk Surface] with nameplate + coffee
  //     [Desk Front + Legs]
  //     [Chair Seat + Pole + Casters] extending below desk

  Widget _desk(Map<String, dynamic> a) {
    final status = a['status'] ?? 'idle';
    final task = a['currentTask'] as Map<String, dynamic>?;
    final color = _pc(a['color'] ?? '#667eea');
    final grad = a['gradient'] as List?;
    final g0 = grad?[0] as String? ?? '#667eea';
    final g1 = grad?[1] as String? ?? '#764ba2';
    final name = a['name'] ?? '未知';
    final emoji = a['emoji'] ?? '🤖';
    final role = a['role'] ?? '';
    final offline = status == 'offline';
    final idleIdx = a['id'].hashCode.abs() % _idleMsgs.length;

    return GestureDetector(
      onTap: () => _detail(a),
      child: Container(
        height: 220,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 10, offset: const Offset(0, 3))],
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            // ==================== DESK (back layer, z=1) ====================
            // Desk surface (top of desk)
            Positioned(
              bottom: 62,
              left: 6, right: 6,
              child: Container(height: 10, decoration: const BoxDecoration(
                gradient: LinearGradient(colors: [Color(0xFFC49060), Color(0xFFD4A574), Color(0xFFDBB68A), Color(0xFFC49060)]),
                borderRadius: BorderRadius.vertical(top: Radius.circular(2)),
                boxShadow: [BoxShadow(color: Color(0xFFA07040), offset: Offset(0, 2)), BoxShadow(color: Color(0x14000000), blurRadius: 8, offset: Offset(0, 4))],
              )),
            ),
            // Desk front panel
            Positioned(
              bottom: 36,
              left: 10, right: 10,
              child: Container(height: 28, decoration: const BoxDecoration(
                gradient: LinearGradient(colors: [Color(0xFFB87E48), Color(0xFFA06830)]),
                borderRadius: BorderRadius.vertical(bottom: Radius.circular(4)),
                boxShadow: [BoxShadow(color: Color(0x10000000), blurRadius: 4, offset: Offset(0, 2))],
              )),
            ),
            // Desk legs
            Positioned(bottom: 0, left: 16, child: Container(width: 6, height: 36, decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF9A6028), Color(0xFFA86E3C), Color(0xFF9A6028)]), borderRadius: BorderRadius.vertical(bottom: Radius.circular(2))))),
            Positioned(bottom: 0, right: 16, child: Container(width: 6, height: 36, decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF9A6028), Color(0xFFA86E3C), Color(0xFF9A6028)]), borderRadius: BorderRadius.vertical(bottom: Radius.circular(2))))),
            // Desk items
            Positioned(bottom: 72, left: 12, child: Text('☕', style: TextStyle(fontSize: 13, color: offline ? Colors.grey : null))),
            Positioned(bottom: 72, left: 32, child: Text('🌵', style: TextStyle(fontSize: 11, color: offline ? Colors.grey : null))),
            // Nameplate
            Positioned(
              bottom: 46, left: 14,
              child: Container(
                padding: const EdgeInsets.fromLTRB(3, 2, 5, 2),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(3), border: Border.all(color: const Color(0xFFE8E2DA)), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 3)]),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Container(width: 14, height: 14, decoration: BoxDecoration(gradient: LinearGradient(colors: [_pc(g0), _pc(g1)]), borderRadius: BorderRadius.circular(2)), child: Center(child: Text(emoji, style: const TextStyle(fontSize: 8)))),
                  const SizedBox(width: 3),
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(name, style: const TextStyle(fontSize: 7, fontWeight: FontWeight.w700, color: Color(0xFF2D3748), height: 1)),
                    Text(role, style: const TextStyle(fontSize: 5, color: Color(0xFF999999), height: 1.2)),
                  ]),
                ]),
              ),
            ),

            // ==================== CHAIR BODY (z=3, behind character) ====================
            // Chair seat, pole, base, casters — extends below desk
            Positioned(
              bottom: -2, left: 0, right: 0,
              child: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                // Seat
                Container(width: 48, height: 8, decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFF686868), Color(0xFF525252)]), borderRadius: BorderRadius.circular(3), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 3)])),
                // Pole
                Container(width: 4, height: 16, decoration: BoxDecoration(color: const Color(0xFF6A6A6A), borderRadius: BorderRadius.circular(1))),
                // Hub
                Container(width: 10, height: 4, decoration: const BoxDecoration(color: Color(0xFF777777), borderRadius: BorderRadius.all(Radius.circular(2)))),
                // Star base + casters
                SizedBox(width: 56, height: 22, child: CustomPaint(painter: _ChairBasePainter())),
              ])),
            ),

            // ==================== CHARACTER (z=5, in front of chair body) ====================
            // Character sits on desk, bottom: 8px above desk surface
            Positioned(
              bottom: 70, left: 0, right: 0,
              child: Align(alignment: Alignment.center,
                child: AnimatedBuilder(
                  animation: status == 'working' ? _typeCtrl : _breathCtrl,
                  builder: (_, child) {
                    final t = (status == 'working' ? _typeCtrl : _breathCtrl).value;
                    final dy = status == 'working' ? -1.0 * math.sin(t * math.pi) : -2.0 * math.sin(t * math.pi * 2);
                    return Transform.translate(offset: Offset(0, dy), child: child);
                  },
                  child: Opacity(opacity: offline ? 0.4 : 1.0, child: _charHead(g0, g1)),
                ),
              ),
            ),

            // ==================== MONITOR (z=6, on desk surface) ====================
            // Monitor sits ON the desk surface, bottom: 42px from desk bottom
            Positioned(
              bottom: 98, right: 8,
              child: _monitor(status, task, color),
            ),

            // ==================== CHAIR BACK (z=8, frontmost) ====================
            // Covers character body — positioned relative to desk, bottom: -6px
            Positioned(
              bottom: 56, left: 0, right: 0,
              child: Center(
                child: Container(
                  width: 52, height: 28,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF5E5E5E), Color(0xFF4A4A4A)]),
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(8), bottom: Radius.circular(3)),
                    boxShadow: [
                      BoxShadow(color: Colors.white.withOpacity(0.1), offset: const Offset(0, 1)), // inset top highlight
                      BoxShadow(color: Colors.black.withOpacity(0.15), blurRadius: 6, offset: const Offset(0, 3)),
                    ],
                  ),
                  child: Container(
                    margin: const EdgeInsets.fromLTRB(5, 3, 5, 4),
                    decoration: BoxDecoration(border: Border.all(color: Colors.white.withOpacity(0.07)), borderRadius: const BorderRadius.vertical(top: Radius.circular(5), bottom: Radius.circular(2))),
                  ),
                ),
              ),
            ),

            // ==================== OVERLAYS (z=30) ====================
            // Thought bubble
            Positioned(bottom: 150, left: 6, right: 6, child: _bubble(status, task, idleIdx)),
            // Status dot
            Positioned(top: 6, right: 6, child: Container(width: 8, height: 8, decoration: BoxDecoration(color: _sc(status), shape: BoxShape.circle, boxShadow: status == 'working' ? [BoxShadow(color: _sc(status).withOpacity(0.5), blurRadius: 4)] : null))),
            // Work FX
            if (status == 'working')
              ...List.generate(3, (i) => Positioned(
                bottom: 110.0 + i * 12.0, left: 15.0 + i * 22.0,
                child: AnimatedBuilder(
                  animation: _screenCtrl,
                  builder: (_, __) {
                    final phase = (_screenCtrl.value * 3 + i * 0.33) % 1.0;
                    return Opacity(opacity: (1 - phase) * 0.7, child: Transform.translate(offset: Offset(0, -phase * 20), child: Text([emoji, '✨', '⚡'][i], style: const TextStyle(fontSize: 7))));
                  },
                ),
              )),
          ],
        ),
      ),
    );
  }

  // ======================== THOUGHT BUBBLE ========================
  Widget _bubble(String status, Map<String, dynamic>? task, int idleIdx) {
    if (status == 'offline') return const SizedBox.shrink();
    final isErr = status == 'error';
    final text = task != null ? '📋 ${task['title'] ?? ''}' : status == 'working' ? '🔧 处理中...' : status == 'queued' ? '⏳ 排队中...' : status == 'error' ? '❌ 出错了！' : _idleMsgs[idleIdx];

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: isErr ? const Color(0xFFFFF5F5) : const Color(0xFFFFFFFF),
            borderRadius: BorderRadius.circular(10),
            border: isErr ? Border.all(color: const Color(0xFFF5576C), width: 0.5) : Border.all(color: const Color(0xFFE0E0E0), width: 0.5),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 6, offset: const Offset(0, 2))],
          ),
          child: Column(children: [
            Text(text, style: TextStyle(fontSize: 9, color: _sc(status), fontWeight: FontWeight.w500), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
            if (task != null) ...[
              const SizedBox(height: 3),
              ClipRRect(borderRadius: BorderRadius.circular(2), child: LinearProgressIndicator(value: ((task['progress'] as int?) ?? 0) / 100.0, backgroundColor: Colors.black.withOpacity(0.06), valueColor: AlwaysStoppedAnimation(_sc(status)), minHeight: 3)),
              const SizedBox(height: 1),
              Text('${task['step'] ?? 0}/${task['totalSteps'] ?? 0} · ${task['progress'] ?? 0}%', style: TextStyle(fontSize: 7, color: Colors.grey.shade500)),
            ],
          ]),
        ),
        // Bubble tail
        Transform.translate(offset: const Offset(0, -1), child: Container(width: 6, height: 6, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle))),
        Transform.translate(offset: const Offset(0, -2), child: Container(width: 4, height: 4, decoration: BoxDecoration(color: const Color(0xFFFFFFFF), shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 2)]))),
      ],
    );
  }

  // ======================== MONITOR ========================
  Widget _monitor(String status, Map<String, dynamic>? task, Color color) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 68, height: 42,
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xFF3A3F4B), Color(0xFF2D323E)]),
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: const Color(0xFF4A4F5A), width: 2),
            boxShadow: [
              BoxShadow(color: Colors.black.withOpacity(0.15), blurRadius: 6),
              if (status == 'working') BoxShadow(color: color.withOpacity(0.15), blurRadius: 10),
            ],
          ),
          child: Container(
            margin: const EdgeInsets.all(2),
            decoration: BoxDecoration(color: status == 'offline' ? const Color(0xFF111111) : const Color(0xFF1A202C), borderRadius: BorderRadius.circular(2)),
            child: status == 'offline'
                ? const Center(child: Text('—', style: TextStyle(color: Color(0xFF333333), fontSize: 12)))
                : _screenContent(status, task, color),
          ),
        ),
        Container(width: 6, height: 4, color: const Color(0xFF3A3A3A)),
        Container(width: 24, height: 3, decoration: BoxDecoration(color: const Color(0xFF4A4A4A), borderRadius: BorderRadius.circular(1))),
      ],
    );
  }

  Widget _screenContent(String status, Map<String, dynamic>? task, Color color) {
    return AnimatedBuilder(
      animation: _screenCtrl,
      builder: (_, __) {
        final phase = _screenCtrl.value;

        if (task != null) {
          return Padding(
            padding: const EdgeInsets.all(3),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(width: 4, height: 4, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
                const SizedBox(width: 2),
                Expanded(child: Text(task['title'] ?? '', style: const TextStyle(fontSize: 4, color: Color(0xFFCCCCCC), fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis)),
              ]),
              const SizedBox(height: 2),
              Text('${task['step'] ?? 0}/${task['totalSteps'] ?? 0} ${task['stepName'] ?? ''}', style: const TextStyle(fontSize: 3.5, color: Color(0xFF888888))),
              const SizedBox(height: 2),
              ClipRRect(borderRadius: BorderRadius.circular(1), child: LinearProgressIndicator(value: ((task['progress'] as int?) ?? 0) / 100.0, backgroundColor: const Color(0xFF1A202C), valueColor: AlwaysStoppedAnimation(color), minHeight: 2)),
              const SizedBox(height: 3),
              // Animated code lines
              ...List.generate(3, (i) {
                final offset = (phase * 6).toInt();
                final w = [0.7, 0.5, 0.8][(i + offset) % 3];
                return Padding(padding: const EdgeInsets.only(bottom: 1.5), child: Container(height: 1.5, width: 48 * w, decoration: BoxDecoration(color: i % 2 == 0 ? const Color(0xFF1AFF96).withOpacity(0.15) : const Color(0xFF64B4FF).withOpacity(0.12), borderRadius: BorderRadius.circular(0.5))));
              }),
            ]),
          );
        }

        if (status == 'working') {
          return Padding(
            padding: const EdgeInsets.all(4),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: List.generate(7, (i) {
              final offset = (phase * 8).toInt();
              final w = [1.0, 0.7, 0.5, 0.9, 0.6, 0.8, 0.4][(i + offset) % 7];
              return Padding(
                padding: const EdgeInsets.only(bottom: 1.5),
                child: Row(children: [
                  Expanded(child: Container(height: 1.5, decoration: BoxDecoration(color: i % 3 == 0 ? const Color(0xFF64B4FF).withOpacity(0.12) : const Color(0xFF1AFF96).withOpacity(0.15), borderRadius: BorderRadius.circular(0.5)))),
                  // Blinking cursor
                  if (i == (offset % 7)) Container(width: 2, height: 2, color: const Color(0xFF1AFF96).withOpacity((phase * 4 % 1.0) < 0.5 ? 0.7 : 0.0)),
                ]),
              );
            })),
          );
        }

        // Idle: clock + blinking cursor
        final now = DateTime.now();
        return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text('${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}', style: TextStyle(fontSize: 10, color: Colors.white.withOpacity(0.25), fontWeight: FontWeight.w300)),
          const SizedBox(height: 3),
          Opacity(opacity: (phase * 2).toInt() == 0 ? 0.7 : 0.0, child: Container(width: 10, height: 1.5, color: const Color(0xFF1AFF96).withOpacity(0.5))),
        ]));
      },
    );
  }

  // ======================== CHARACTER HEAD ========================
  Widget _charHead(String g0, String g1) {
    return SizedBox(width: 48, height: 44, child: CustomPaint(painter: _CharPainter(g0, g1)));
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
      decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      padding: const EdgeInsets.all(20),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Character portrait + info — with animated character
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
            Text(name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 2),
            Text(role, style: const TextStyle(fontSize: 14, color: Colors.grey)),
            const SizedBox(height: 4),
            Text(a['desc'] ?? '', style: const TextStyle(fontSize: 12, color: Colors.black45), maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(color: _sc(s).withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
              child: Text(_sl(s), style: TextStyle(color: _sc(s), fontWeight: FontWeight.w600, fontSize: 13)),
            ),
          ]),
          ),
        ]),
        if (t != null) ...[const SizedBox(height: 16), const Text('当前任务', style: TextStyle(fontWeight: FontWeight.w600)), const SizedBox(height: 8), Container(width: double.infinity, padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(10), border: Border.all(color: color.withOpacity(0.1))), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(t['title'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600)), const SizedBox(height: 6), ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: ((t['progress'] as int?) ?? 0) / 100.0, backgroundColor: Colors.black.withOpacity(0.05), valueColor: AlwaysStoppedAnimation(color), minHeight: 6)), const SizedBox(height: 4), Text('步骤 ${t['step'] ?? 0}/${t['totalSteps'] ?? 0} · ${t['stepName'] ?? ''}', style: const TextStyle(fontSize: 12, color: Colors.grey))]))],
        if (st != null) ...[const SizedBox(height: 12), Row(children: [_chip('✅ 完成', '${st['tasksCompleted'] ?? 0}'), const SizedBox(width: 12), _chip('📅 今日', '${st['tasksToday'] ?? 0}'), const SizedBox(width: 12), _chip('⏱️ 响应', '${st['avgResponseTime'] ?? '-'}')])],
        const SizedBox(height: 20),
      ]),
    ));
  }

  /// Build animated front-facing character for detail modal
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

  Widget _chip(String l, String v) => Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6), decoration: BoxDecoration(color: Colors.black.withOpacity(0.03), borderRadius: BorderRadius.circular(8)), child: Column(children: [Text(v, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)), Text(l, style: const TextStyle(fontSize: 10, color: Colors.grey))]));
}

// ======================== CHARACTER PAINTER (head only) ========================
class _CharPainter extends CustomPainter {
  final String g0, g1;
  _CharPainter(this.g0, this.g1);
  Color _c(String h) => Color(int.parse('FF${h.replaceAll('#', '')}', radix: 16));

  @override
  void paint(Canvas c, Size s) {
    final cx = s.width / 2;
    // Head (skin)
    c.drawCircle(Offset(cx, s.height * 0.55), s.width * 0.28, Paint()..color = const Color(0xFFF5DEB3));
    // Hair
    final p = Path()
      ..moveTo(s.width * 0.22, s.height * 0.55)
      ..quadraticBezierTo(s.width * 0.22, s.height * 0.1, cx, s.height * 0.05)
      ..quadraticBezierTo(s.width * 0.78, s.height * 0.1, s.width * 0.78, s.height * 0.55)
      ..lineTo(s.width * 0.72, s.height * 0.62)
      ..quadraticBezierTo(cx, s.height * 0.48, s.width * 0.28, s.height * 0.62)
      ..close();
    c.drawPath(p, Paint()..color = _c(g1));
    // Neck
    c.drawRect(Rect.fromLTWH(s.width * 0.38, s.height * 0.78, s.width * 0.24, s.height * 0.22), Paint()..color = const Color(0xFFF0D5A8));
  }
  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

// ======================== FRONT-FACING CHARACTER PAINTER (matches web SVG) ========================
class _FrontCharPainter extends CustomPainter {
  final String g0, g1, hairStyle;
  _FrontCharPainter(this.g0, this.g1, this.hairStyle);
  Color _c(String h) => Color(int.parse('FF${h.replaceAll('#', '')}', radix: 16));

  @override
  void paint(Canvas c, Size s) {
    // Scale from SVG viewBox (90x90) to actual size
    final sx = s.width / 90, sy = s.height / 100;
    c.save();
    c.scale(sx, sy);
    // Offset to center in 90x100 space (SVG is 90x90)
    c.translate(0, 5);

    final bodyColor = _c(g0);
    final hairColor = _c(g1);
    final skinColor = const Color(0xFFF5DEB3);

    // Shadow under body
    final shadowPaint = Paint()..color = bodyColor.withOpacity(0.4);
    c.drawOval(Rect.fromCenter(center: const Offset(45, 80), width: 40, height: 16), shadowPaint);

    // Body (rounded rect)
    c.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(28, 58, 34, 22), const Radius.circular(10)), Paint()..color = bodyColor.withOpacity(0.7));

    // Neck
    c.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(40, 52, 10, 10), const Radius.circular(4)), Paint()..color = skinColor.withOpacity(0.9));

    // Head
    c.drawCircle(const Offset(45, 36), 17, Paint()..color = skinColor.withOpacity(0.95));

    // Ears
    c.drawOval(Rect.fromCenter(center: const Offset(27, 38), width: 8, height: 10), Paint()..color = const Color(0xFFF0D5A8).withOpacity(0.6));
    c.drawOval(Rect.fromCenter(center: const Offset(63, 38), width: 8, height: 10), Paint()..color = const Color(0xFFF0D5A8).withOpacity(0.6));

    // Hair (different styles)
    _drawHair(c, hairStyle, hairColor);

    // Eyes
    final eyePaint = Paint()..color = const Color(0xFF3A2518).withOpacity(0.7);
    final eyeWhite = Paint()..color = Colors.white.withOpacity(0.6);
    // Left eye
    c.drawOval(Rect.fromCenter(center: const Offset(37, 36), width: 7, height: 8), eyePaint);
    c.drawCircle(const Offset(37, 35), 1.5, eyeWhite);
    // Right eye
    c.drawOval(Rect.fromCenter(center: const Offset(53, 36), width: 7, height: 8), eyePaint);
    c.drawCircle(const Offset(53, 35), 1.5, eyeWhite);

    // Smile
    final smilePaint = Paint()..color = const Color(0xFFC49060).withOpacity(0.5)..style = PaintingStyle.stroke..strokeWidth = 1.2..strokeCap = StrokeCap.round;
    c.drawPath(Path()..moveTo(41, 44)..quadraticBezierTo(45, 48, 49, 44), smilePaint);

    // Blush
    c.drawOval(Rect.fromCenter(center: const Offset(33, 42), width: 10, height: 6), Paint()..color = const Color(0xFFF5B8B8).withOpacity(0.25));
    c.drawOval(Rect.fromCenter(center: const Offset(57, 42), width: 10, height: 6), Paint()..color = const Color(0xFFF5B8B8).withOpacity(0.25));

    // Arms
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
        // Cape-style hair with side locks
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
        // Twintails
        c.drawOval(Rect.fromCenter(center: const Offset(20, 42), width: 10, height: 24), paint..color = color.withOpacity(0.6));
        c.drawOval(Rect.fromCenter(center: const Offset(70, 42), width: 10, height: 24), paint..color = color.withOpacity(0.6));
        break;
      case 'pink-wavy':
        c.drawPath(Path()
          ..moveTo(26, 24)..quadraticBezierTo(26, 10, 45, 8)..quadraticBezierTo(64, 10, 64, 24)
          ..lineTo(58, 32)..quadraticBezierTo(45, 26, 32, 32)..close(), paint..color = color.withOpacity(0.85));
        // Side waves
        c.drawPath(Path()..moveTo(26, 34)..quadraticBezierTo(24, 42, 22, 48), strokePaint..strokeWidth = 4);
        c.drawPath(Path()..moveTo(64, 34)..quadraticBezierTo(66, 42, 68, 48), strokePaint..strokeWidth = 4);
        break;
      case 'red-ponytail':
        c.drawPath(Path()
          ..moveTo(30, 22)..quadraticBezierTo(30, 12, 45, 10)..quadraticBezierTo(60, 12, 60, 22)
          ..lineTo(58, 32)..quadraticBezierTo(45, 26, 32, 32)..close(), paint..color = color.withOpacity(0.85));
        // Ponytail
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
        // Long side hair
        c.drawPath(Path()..moveTo(28, 34)..quadraticBezierTo(26, 48, 24, 58), strokePaint..strokeWidth = 4);
        c.drawPath(Path()..moveTo(62, 34)..quadraticBezierTo(64, 48, 66, 58), strokePaint..strokeWidth = 4);
        break;
      case 'cyan-bun':
        c.drawPath(Path()
          ..moveTo(32, 24)..quadraticBezierTo(32, 18, 45, 14)..quadraticBezierTo(58, 18, 58, 24)
          ..lineTo(56, 32)..quadraticBezierTo(45, 26, 34, 32)..close(), paint..color = color.withOpacity(0.8));
        // Bun on top
        c.drawCircle(const Offset(45, 10), 6, paint..color = color.withOpacity(0.65));
        break;
      default:
        // Default: purple-cape style
        c.drawPath(Path()
          ..moveTo(28, 22)..quadraticBezierTo(28, 12, 45, 10)..quadraticBezierTo(62, 12, 62, 22)
          ..lineTo(60, 34)..quadraticBezierTo(45, 26, 30, 34)..close(), paint..color = color.withOpacity(0.85));
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

// ======================== CHAIR BASE PAINTER (star base + casters) ========================
class _ChairBasePainter extends CustomPainter {
  @override
  void paint(Canvas c, Size s) {
    final cx = s.width / 2, cy = 6.0;
    final linePaint = Paint()..color = const Color(0xFF6A6A6A)..strokeWidth = 2.5..strokeCap = StrokeCap.round;
    final casterPaint = Paint()..color = const Color(0xFF4A4A4A);
    final casterStroke = Paint()..color = const Color(0xFF333333)..style = PaintingStyle.stroke..strokeWidth = 0.8;

    // 5 legs radiating from center
    final angles = [0.0, 1.2566, 2.5133, 3.7699, 5.0265]; // 72° apart
    for (final a in angles) {
      final ex = cx + 20 * math.sin(a);
      final ey = cy + 14 * math.cos(a);
      c.drawLine(Offset(cx, cy), Offset(ex, ey), linePaint);
      c.drawCircle(Offset(ex, ey), 3, casterPaint);
      c.drawCircle(Offset(ex, ey), 3, casterStroke);
    }
  }
  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
