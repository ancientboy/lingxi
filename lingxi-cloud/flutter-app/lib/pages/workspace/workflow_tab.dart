import 'package:flutter/material.dart';
import 'package:lingxicloud/services/api_service.dart';

class WorkflowTab extends StatefulWidget {
  final bool dk;
  const WorkflowTab({super.key, required this.dk});

  @override
  State<WorkflowTab> createState() => _WorkflowTabState();
}

class _WorkflowTabState extends State<WorkflowTab> {
  List<Map<String, dynamic>> _available = [];
  List<Map<String, dynamic>> _active = [];
  bool _loading = true;
  String _view = 'active'; // 'active' | 'available'
  String? _errorMessage;
  Set<String> _expandedCards = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _errorMessage = null; });
    try {
      final api = ApiService();
      final results = await Future.wait([
        api.get('/api/team/workflows/available').catchError((_) => _.data),
        api.get('/api/team/workflows/list').catchError((_) => _.data),
      ]);
      final availData = results[0].data;
      final activeData = results[1].data;

      List<Map<String, dynamic>> avail = [];
      List<Map<String, dynamic>> activeRaw = [];

      if (availData is Map && availData['success'] == true && availData['workflows'] != null) {
        avail = List<Map<String, dynamic>>.from(availData['workflows']);
      } else if (availData is List) {
        avail = List<Map<String, dynamic>>.from(availData);
      }

      if (activeData is Map && activeData['success'] == true && activeData['workflows'] != null) {
        activeRaw = List<Map<String, dynamic>>.from(activeData['workflows']);
      } else if (activeData is List) {
        activeRaw = List<Map<String, dynamic>>.from(activeData);
      }

      // Build a lookup from available list for name/description/steps
      final availMap = <String, Map<String, dynamic>>{};
      for (final w in avail) {
        final id = (w['id'] ?? '').toString();
        if (id.isNotEmpty) availMap[id] = w;
      }

      // Merge: enrich active entries with available data
      final List<Map<String, dynamic>> active = [];
      final seenIds = <String>{};
      for (final a in activeRaw) {
        final wfId = (a['workflowId'] ?? a['id'] ?? '').toString();
        if (wfId.isEmpty || seenIds.contains(wfId)) continue;
        seenIds.add(wfId);

        final availInfo = availMap[wfId];
        if (availInfo != null) {
          // Merge available info into active entry
          active.add({
            ...a,
            'id': wfId,
            'name': availInfo['name'] ?? wfId,
            'description': availInfo['description'] ?? '',
            'steps': availInfo['steps'] ?? [],
            'agents': availInfo['agents'] ?? [],
            'mode': availInfo['mode'] ?? '',
            'estimatedDuration': availInfo['estimatedDuration'] ?? '',
          });
        } else {
          // Not in available list — could be deleted or unknown
          active.add({
            ...a,
            'id': wfId,
            'name': a['name'] ?? wfId,
            'description': a['description'] ?? '',
          });
        }
      }

      if (mounted) setState(() {
        _available = avail;
        _active = active;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() {
        _errorMessage = '加载失败: $e';
        _loading = false;
      });
    }
  }

  Future<void> _activate(Map<String, dynamic> wf) async {
    final confirm = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: const Text('激活工作流'),
      content: Text('确定要激活「${wf['name']}」吗？激活后将自动开始运行。'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('取消')),
        ElevatedButton(
          onPressed: () => Navigator.pop(c, true),
          style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF667eea), foregroundColor: Colors.white),
          child: const Text('确定激活'),
        ),
      ],
    ));
    if (confirm != true) return;

    try {
      final resp = await ApiService().post('/api/team/workflows/activate', data: {
        'workflowIds': [wf['id']],
        'serverId': null,
      });
      if (resp.data is Map && resp.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${wf['name']} 已激活')));
          _load();
        }
      } else {
        final msg = (resp.data is Map) ? (resp.data['message'] ?? resp.data['error'] ?? '未知错误') : '未知错误';
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('激活失败: $msg')));
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('激活失败: $e')));
      }
    }
  }

  Future<void> _deactivate(Map<String, dynamic> wf) async {
    final confirm = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: const Text('停用工作流'),
      content: Text('确定要停用「${wf['name']}」吗？'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('取消')),
        TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('停用', style: TextStyle(color: Colors.red))),
      ],
    ));
    if (confirm != true) return;

    try {
      final resp = await ApiService().post('/api/team/workflows/deactivate', data: {
        'workflowId': wf['workflowId'] ?? wf['id'],
      });
      if (resp.data is Map && resp.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${wf['name']} 已停用')));
          _load();
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('停用失败')));
        }
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${wf['name']} 已停用')));
      }
    }
  }

  String _statusLabel(Map<String, dynamic> item) {
    if (item['pending'] == true) return '激活中';
    if (item['custom'] == true) return '自定义';
    if (item['fromDevice'] == true) return '运行中';
    if (item['verified'] == true) return '已确认';
    return '已激活';
  }

  Color _statusColor(String label) {
    switch (label) {
      case '激活中': return Colors.orange;
      case '自定义': return const Color(0xFF667eea);
      case '运行中': return const Color(0xFF22C55E);
      default: return const Color(0xFF22C55E);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dk = widget.dk;
    final textColor = dk ? Colors.white : Colors.black87;
    final cardBg = dk ? const Color(0xFF252540) : Colors.white;

    return Column(children: [
      // Toggle active/available
      Container(
        height: 44,
        color: dk ? const Color(0xFF1A1A2E) : Colors.white,
        child: Row(children: [
          _tabBtn('已激活 (${_active.length})', _view == 'active', () => setState(() => _view = 'active')),
          _tabBtn('可安装 (${_available.length})', _view == 'available', () => setState(() => _view = 'available')),
        ]),
      ),
      const Divider(height: 1),
      Expanded(child: _loading
        ? const Center(child: CircularProgressIndicator())
        : _errorMessage != null
          ? _buildError(dk)
          : RefreshIndicator(
          onRefresh: _load,
          child: _view == 'active'
            ? (_active.isEmpty
              ? ListView(children: [SizedBox(height: 200, child: Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.account_tree_outlined, size: 48, color: Colors.grey.shade300),
                  const SizedBox(height: 12),
                  Text('暂无激活的工作流', style: TextStyle(color: Colors.grey.shade400, fontSize: 14)),
                  const SizedBox(height: 8),
                  Text('切换到「可安装」查看更多', style: TextStyle(color: Colors.grey.shade400, fontSize: 12)),
                ])))])
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: _active.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => _buildActiveCard(_active[i], dk, cardBg, textColor),
                ))
            : (_available.isEmpty
              ? ListView(children: [SizedBox(height: 200, child: Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.cloud_download_outlined, size: 48, color: Colors.grey.shade300),
                  const SizedBox(height: 12),
                  Text('暂无可安装的工作流', style: TextStyle(color: Colors.grey.shade400, fontSize: 14)),
                ])))])
              : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: _available.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) => _buildAvailableCard(_available[i], dk, cardBg, textColor),
              )),
        ),
      ),
    ]);
  }

  Widget _buildError(bool dk) {
    return Center(child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.error_outline, size: 48, color: Colors.red.shade300),
        const SizedBox(height: 12),
        Text(_errorMessage ?? '加载失败', style: TextStyle(color: Colors.red.shade400, fontSize: 14), textAlign: TextAlign.center),
        const SizedBox(height: 16),
        ElevatedButton.icon(
          onPressed: _load,
          icon: const Icon(Icons.refresh, size: 16),
          label: const Text('重试'),
          style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF667eea), foregroundColor: Colors.white),
        ),
      ]),
    ));
  }

  Widget _tabBtn(String text, bool active, VoidCallback onTap) {
    return Expanded(child: GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: active ? const Color(0xFF667eea) : Colors.transparent, width: 2))),
        alignment: Alignment.center,
        child: Text(text, style: TextStyle(
          fontSize: 13,
          fontWeight: active ? FontWeight.w600 : FontWeight.normal,
          color: active ? const Color(0xFF667eea) : (widget.dk ? Colors.white54 : Colors.black45),
        )),
      ),
    ));
  }

  Widget _buildActiveCard(Map<String, dynamic> wf, bool dk, Color cardBg, Color textColor) {
    final name = (wf['name'] ?? wf['workflowId'] ?? '未知').toString();
    final desc = (wf['description'] ?? '').toString();
    final activatedAt = (wf['activatedAt'] ?? wf['activated_at'] ?? '').toString();
    final statusLabel = _statusLabel(wf);
    final statusColor = _statusColor(statusLabel);
    final steps = _parseSteps(wf['steps']);
    final agents = _parseAgents(wf['agents']);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Header row
        Row(children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(color: const Color(0xFF667eea).withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.account_tree, size: 18, color: Color(0xFF667eea)),
          ),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: textColor)),
            if (desc.isNotEmpty) Text(desc, style: TextStyle(fontSize: 11, color: Colors.grey.shade500), maxLines: 1, overflow: TextOverflow.ellipsis),
          ])),
        ]),
        const SizedBox(height: 8),
        // Agent tags
        if (agents.isNotEmpty) Wrap(spacing: 4, runSpacing: 4, children: agents.map((a) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(color: const Color(0xFF4facfe).withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.smart_toy, size: 10, color: Color(0xFF4facfe)),
            const SizedBox(width: 2),
            Text(a, style: const TextStyle(fontSize: 10, color: Color(0xFF4facfe))),
          ]),
        )).toList()),
        const SizedBox(height: 8),
        // Status + time
        Wrap(spacing: 8, runSpacing: 6, children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: statusColor.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
            child: Text(statusLabel, style: TextStyle(fontSize: 11, color: statusColor, fontWeight: FontWeight.w600)),
          ),
          if (activatedAt.isNotEmpty) Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: Colors.grey.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.access_time, size: 12, color: Colors.grey.shade500),
              const SizedBox(width: 4),
              Text(activatedAt.length > 10 ? activatedAt.substring(0, 10) : activatedAt,
                style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
            ]),
          ),
        ]),
        // Steps preview
        if (steps.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(children: [
            Icon(Icons.route, size: 12, color: Colors.grey.shade400),
            const SizedBox(width: 4),
            Text('${steps.length} 个步骤', style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
          ]),
        ],
        const SizedBox(height: 10),
        // Deactivate button
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          TextButton.icon(
            onPressed: () => _deactivate(wf),
            icon: const Icon(Icons.stop_circle_outlined, size: 16),
            label: const Text('停用'),
            style: TextButton.styleFrom(foregroundColor: Colors.red.shade400, padding: const EdgeInsets.symmetric(horizontal: 12)),
          ),
        ]),
      ]),
    );
  }

  Widget _buildAvailableCard(Map<String, dynamic> wf, bool dk, Color cardBg, Color textColor) {
    final name = (wf['name'] ?? '').toString();
    final desc = (wf['description'] ?? '').toString();
    final steps = _parseSteps(wf['steps']);
    final agents = _parseAgents(wf['agents']);
    final estimatedDuration = (wf['estimatedDuration'] ?? wf['estimated_duration'] ?? '').toString();
    final mode = (wf['mode'] ?? '').toString();
    final id = (wf['id'] ?? '').toString();
    final isActive = _active.any((a) => (a['workflowId'] ?? a['id']) == id);
    final expanded = _expandedCards.contains(id);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Header
        GestureDetector(
          onTap: () => setState(() {
            if (_expandedCards.contains(id)) { _expandedCards.remove(id); } else { _expandedCards.add(id); }
          }),
          child: Row(children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: const Color(0xFF667eea).withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
              child: const Icon(Icons.add_circle_outline, size: 18, color: Color(0xFF667eea)),
            ),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: textColor)),
              if (mode.isNotEmpty) Text(
                mode == 'single-agent' ? '单 Agent 模式' : '多 Agent 模式',
                style: TextStyle(fontSize: 10, color: const Color(0xFF667eea)),
              ),
            ])),
            // Status or expand icon
            if (isActive) Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: const Color(0xFF22C55E).withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
              child: const Text('已激活', style: TextStyle(fontSize: 10, color: Color(0xFF22C55E), fontWeight: FontWeight.w600)),
            ) else Icon(
              expanded ? Icons.expand_less : Icons.expand_more,
              color: Colors.grey.shade400, size: 20,
            ),
          ]),
        ),
        const SizedBox(height: 6),
        Text(desc, style: TextStyle(fontSize: 12, color: Colors.grey.shade500, height: 1.4), maxLines: 2, overflow: TextOverflow.ellipsis),

        // Agent tags
        if (agents.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(spacing: 4, runSpacing: 4, children: agents.map((a) => Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(color: const Color(0xFF4facfe).withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.smart_toy, size: 10, color: Color(0xFF4facfe)),
              const SizedBox(width: 2),
              Text(a, style: const TextStyle(fontSize: 10, color: Color(0xFF4facfe))),
            ]),
          )).toList()),
        ],

        // Steps bar
        if (steps.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(value: 0.0, minHeight: 4, backgroundColor: Colors.grey.withOpacity(0.15), valueColor: const AlwaysStoppedAnimation(Color(0xFF667eea))),
            )),
            const SizedBox(width: 8),
            Text('${steps.length} 步', style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
            if (estimatedDuration.isNotEmpty) ...[
              const SizedBox(width: 8),
              Icon(Icons.schedule, size: 10, color: Colors.grey.shade400),
              const SizedBox(width: 2),
              Text(estimatedDuration, style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
            ],
          ]),
        ],

        // Expanded steps detail
        if (expanded && steps.isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: (dk ? const Color(0xFF1A1A2E) : const Color(0xFFF5F5FA)),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('工作原理', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: textColor)),
              const SizedBox(height: 8),
              ...steps.asMap().entries.map((entry) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(
                    width: 22, height: 22,
                    decoration: BoxDecoration(color: const Color(0xFF667eea).withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                    child: Center(child: Text('${entry.key + 1}', style: const TextStyle(fontSize: 10, color: Color(0xFF667eea), fontWeight: FontWeight.w600))),
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(entry.value['name'] ?? entry.value['step'] ?? '', style: TextStyle(fontSize: 12, color: textColor, fontWeight: FontWeight.w500)),
                    if ((entry.value['agent'] ?? '').isNotEmpty)
                      Text('Agent: ${entry.value['agent']}', style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
                  ])),
                ]),
              )),
            ]),
          ),
        ],

        // Activate button
        if (!isActive) ...[
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            height: 36,
            child: ElevatedButton(
              onPressed: () => _activate(wf),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF667eea),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 0),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text('激活', style: TextStyle(fontSize: 12)),
            ),
          ),
        ],
      ]),
    );
  }

  List<Map<String, dynamic>> _parseSteps(dynamic stepsRaw) {
    if (stepsRaw is List) {
      return stepsRaw.map<Map<String, dynamic>>((s) {
        if (s is Map) return Map<String, dynamic>.from(s);
        return {'name': s.toString(), 'step': s.toString()};
      }).toList();
    }
    return [];
  }

  List<String> _parseAgents(dynamic agentsRaw) {
    if (agentsRaw is List) {
      return agentsRaw.map<String>((a) {
        if (a is Map) return (a['name'] ?? a['id'] ?? '').toString();
        return a.toString();
      }).toList();
    }
    return [];
  }
}
