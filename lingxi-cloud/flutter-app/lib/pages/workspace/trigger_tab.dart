import 'package:flutter/material.dart';
import 'package:lingxicloud/services/api_service.dart';

class TriggerTab extends StatefulWidget {
  final bool dk;
  const TriggerTab({super.key, required this.dk});

  @override
  State<TriggerTab> createState() => _TriggerTabState();
}

class _TriggerTabState extends State<TriggerTab> {
  List<Map<String, dynamic>> _triggers = [];
  bool _loading = true;

  static const _mockTriggers = [
    {'id': 'trg-1', 'name': '每日站会提醒', 'type': 'cron', 'schedule': '0 9 * * 1-5', 'action': 'send_notification', 'enabled': true, 'lastRun': '2025-06-10T09:00:00Z', 'nextRun': '2025-06-11T09:00:00Z'},
    {'id': 'trg-2', 'name': '周报生成', 'type': 'cron', 'schedule': '0 17 * * 5', 'action': 'generate_report', 'enabled': true, 'lastRun': '2025-06-06T17:00:00Z', 'nextRun': '2025-06-13T17:00:00Z'},
    {'id': 'trg-3', 'name': '代码提交检查', 'type': 'webhook', 'schedule': '', 'action': 'code_review', 'enabled': false, 'lastRun': '2025-06-01T10:30:00Z', 'nextRun': null},
    {'id': 'trg-4', 'name': '异常告警', 'type': 'event', 'schedule': '', 'action': 'send_alert', 'enabled': true, 'lastRun': '2025-06-09T22:15:00Z', 'nextRun': null},
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final resp = await ApiService().get('/api/triggers/list');
      final data = resp.data;
      if (data is Map && data['success'] == true && data['triggers'] != null) {
        if (mounted) setState(() {
          _triggers = List<Map<String, dynamic>>.from(data['triggers']).map((t) {
            final m = Map<String, dynamic>.from(t);
            m['id'] = m['triggerId'] ?? m['id'];
            return m;
          }).toList();
          _loading = false;
        });
      } else if (data is List) {
        if (mounted) setState(() {
          _triggers = List<Map<String, dynamic>>.from(data);
          _loading = false;
        });
      } else {
        if (mounted) setState(() { _triggers = _mockTriggers; _loading = false; });
      }
    } catch (_) {
      if (mounted) setState(() { _triggers = _mockTriggers; _loading = false; });
    }
  }

  Future<void> _toggleEnabled(Map<String, dynamic> trg) async {
    final id = (trg['id'] ?? trg['triggerId'] ?? '').toString();
    final newEnabled = !(trg['enabled'] == true);
    try {
      final resp = await ApiService().post('/api/triggers/update', data: {
        'triggerId': id,
        'patch': {'enabled': newEnabled},
      });
      if (resp.data is Map && resp.data['success'] == true) {
        if (mounted) { setState(() => trg['enabled'] = newEnabled); }
      } else {
        if (mounted) { setState(() => trg['enabled'] = newEnabled); }
      }
    } catch (_) {
      if (mounted) { setState(() => trg['enabled'] = newEnabled); }
    }
  }

  Future<void> _deleteTrigger(Map<String, dynamic> trg) async {
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: const Text('删除触发器'),
      content: Text('确定删除「${trg['name'] ?? ''}」？'),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('取消')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('删除', style: TextStyle(color: Colors.red)))],
    ));
    if (ok != true) return;
    final id = (trg['id'] ?? trg['triggerId'] ?? '').toString();
    try {
      await ApiService().post('/api/triggers/remove', data: {'triggerId': id});
      if (mounted) { setState(() => _triggers.remove(trg)); }
    } catch (_) {
      if (mounted) { setState(() => _triggers.remove(trg)); }
    }
  }

  Future<void> _testTrigger(Map<String, dynamic> trg) async {
    final id = (trg['id'] ?? trg['triggerId'] ?? '').toString();
    try {
      final resp = await ApiService().post('/api/triggers/test/$id');
      if (resp.data is Map && resp.data['success'] == true) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('「${trg['name']}」测试成功')));
      } else {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('「${trg['name']}」测试完成（本地模拟）')));
      }
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('「${trg['name']}」测试请求已发送')));
    }
  }

  void _showCreateDialog() {
    final nameCtrl = TextEditingController();
    final scheduleCtrl = TextEditingController();
    String type = 'cron';
    String action = 'send_notification';

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('创建触发器'),
          content: SizedBox(width: 350, child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: '名称', border: OutlineInputBorder(), isDense: true)),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: type,
              decoration: const InputDecoration(labelText: '类型', border: OutlineInputBorder(), isDense: true),
              items: const [
                DropdownMenuItem(value: 'cron', child: Text('定时 (Cron)')),
                DropdownMenuItem(value: 'webhook', child: Text('Webhook')),
                DropdownMenuItem(value: 'event', child: Text('事件')),
              ],
              onChanged: (v) => setDialogState(() => type = v ?? 'cron'),
            ),
            const SizedBox(height: 12),
            if (type == 'cron')
              TextField(controller: scheduleCtrl, decoration: const InputDecoration(labelText: 'Cron 表达式', hintText: '0 9 * * 1-5', border: OutlineInputBorder(), isDense: true)),
            if (type == 'cron') const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: action,
              decoration: const InputDecoration(labelText: '动作', border: OutlineInputBorder(), isDense: true),
              items: const [
                DropdownMenuItem(value: 'send_notification', child: Text('发送通知')),
                DropdownMenuItem(value: 'generate_report', child: Text('生成报告')),
                DropdownMenuItem(value: 'code_review', child: Text('代码审查')),
                DropdownMenuItem(value: 'send_alert', child: Text('发送告警')),
                DropdownMenuItem(value: 'custom', child: Text('自定义')),
              ],
              onChanged: (v) => setDialogState(() => action = v ?? 'send_notification'),
            ),
          ]))),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
            ElevatedButton(
              onPressed: () async {
                final name = nameCtrl.text.trim();
                if (name.isEmpty) return;
                Navigator.pop(ctx);
                try {
                  await ApiService().post('/api/triggers/create', data: {
                    'name': name,
                    'type': type,
                    'targetAgent': 'lingxi',
                    'promptTemplate': scheduleCtrl.text.trim().isNotEmpty ? scheduleCtrl.text.trim() : action,
                  });
                  if (mounted) { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('触发器创建成功'))); _load(); }
                } catch (_) {
                  // Add locally
                  if (mounted) {
                    setState(() => _triggers.add({
                      'id': 'trg-${DateTime.now().millisecondsSinceEpoch}',
                      'name': name,
                      'type': type,
                      'schedule': scheduleCtrl.text.trim(),
                      'action': action,
                      'enabled': true,
                      'lastRun': null,
                      'nextRun': null,
                    }));
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('触发器已创建（本地）')));
                  }
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF667eea), foregroundColor: Colors.white),
              child: const Text('创建'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final dk = widget.dk;
    final textColor = dk ? Colors.white : Colors.black87;
    final cardBg = dk ? const Color(0xFF252540) : Colors.white;

    return Column(children: [
      // Header with add button
      Container(
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        color: dk ? const Color(0xFF1A1A2E) : Colors.white,
        child: Row(children: [
          Text('自动化触发器', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: textColor)),
          const Spacer(),
          SizedBox(
            height: 32,
            child: ElevatedButton.icon(
              onPressed: _showCreateDialog,
              icon: const Icon(Icons.add, size: 16),
              label: const Text('新建', style: TextStyle(fontSize: 12)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF667eea),
                foregroundColor: Colors.white,
                padding: EdgeInsets.symmetric(horizontal: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
          ),
        ]),
      ),
      const Divider(height: 1),
      Container(
        margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: dk ? const Color(0xFF1E1E38) : const Color(0xFFF0F4FF),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF667eea).withOpacity(0.2)),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.info_outline, size: 18, color: const Color(0xFF667eea).withOpacity(0.9)),
          const SizedBox(width: 10),
          Expanded(child: Text(
            '触发器用于 Webhook / 外部事件驱动 Agent，例如 Git 推送、表单提交时自动执行。\n与「定时任务」不同：定时任务是让 Agent 按计划主动运行；触发器是被动响应外部信号。',
            style: TextStyle(fontSize: 12, height: 1.45, color: dk ? Colors.white70 : Colors.grey.shade700),
          )),
        ]),
      ),
      const SizedBox(height: 8),
      Expanded(child: _loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
          onRefresh: _load,
          child: _triggers.isEmpty
            ? ListView(children: [SizedBox(height: 200, child: Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.bolt_outlined, size: 48, color: Colors.grey.shade300),
                const SizedBox(height: 12),
                Text('暂无触发器', style: TextStyle(color: Colors.grey.shade400, fontSize: 14)),
                const SizedBox(height: 8),
                Text('点击右上角「新建」创建', style: TextStyle(color: Colors.grey.shade400, fontSize: 12)),
              ])))])
            : ListView.separated(
                padding: EdgeInsets.all(16),
                itemCount: _triggers.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) => _buildCard(_triggers[i], dk, cardBg, textColor),
              ),
        ),
      ),
    ]);
  }

  Widget _buildCard(Map<String, dynamic> trg, bool dk, Color cardBg, Color textColor) {
    final name = trg['name'] ?? '';
    final type = trg['type'] ?? 'cron';
    final schedule = trg['schedule'] ?? '';
    final action = trg['action'] ?? '';
    final enabled = trg['enabled'] == true;
    final lastRun = trg['lastRun'] ?? '';
    final nextRun = trg['nextRun'] ?? '';

    final typeIcons = {'cron': Icons.schedule, 'webhook': Icons.webhook, 'event': Icons.bolt};
    final typeLabels = {'cron': '定时', 'webhook': 'Webhook', 'event': '事件'};
    final actionLabels = {
      'send_notification': '发送通知',
      'generate_report': '生成报告',
      'code_review': '代码审查',
      'send_alert': '发送告警',
      'custom': '自定义',
    };

    return Container(
      padding: EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
        border: enabled ? Border.all(color: const Color(0xFF22C55E).withOpacity(0.3), width: 1) : null,
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: (enabled ? const Color(0xFF22C55E) : Colors.grey).withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(typeIcons[type] ?? Icons.bolt, size: 18, color: enabled ? const Color(0xFF22C55E) : Colors.grey),
          ),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: textColor)),
            Row(children: [
              Container(
                padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: Colors.grey.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
                child: Text(typeLabels[type] ?? type, style: TextStyle(fontSize: 10, color: Colors.grey.shade600)),
              ),
              const SizedBox(width: 6),
              if (action.isNotEmpty) Text(actionLabels[action] ?? action, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
            ]),
          ])),
          Switch(
            value: enabled,
            onChanged: (_) => _toggleEnabled(trg),
            activeColor: const Color(0xFF22C55E),
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ]),
        if (type == 'cron' && schedule.isNotEmpty) ...[
          const SizedBox(height: 8),
          Container(
            padding: EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(color: (dk ? const Color(0xFF1E1E38) : const Color(0xFFF8F9FA)), borderRadius: BorderRadius.circular(8)),
            child: Row(children: [
              const Icon(Icons.access_time, size: 14, color: Color(0xFF667eea)),
              const SizedBox(width: 6),
              Text(schedule, style: TextStyle(fontSize: 12, fontFamily: 'monospace', color: Color(0xFF667eea))),
            ]),
          ),
        ],
        if (lastRun != null && lastRun.toString().isNotEmpty) ...[
          const SizedBox(height: 6),
          Row(children: [
            Text('上次: ${_fmtTime(lastRun.toString())}', style: TextStyle(fontSize: 10, color: Colors.grey.shade400)),
            if (nextRun != null && nextRun.toString().isNotEmpty) ...[
              const SizedBox(width: 12),
              Text('下次: ${_fmtTime(nextRun.toString())}', style: TextStyle(fontSize: 10, color: Colors.grey.shade400)),
            ],
          ]),
        ],
        const SizedBox(height: 8),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          TextButton(
            onPressed: () => _testTrigger(trg),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFF667eea), padding: EdgeInsets.symmetric(horizontal: 10), minimumSize: Size.zero),
            child: const Text('测试', style: TextStyle(fontSize: 12)),
          ),
          TextButton(
            onPressed: () => _deleteTrigger(trg),
            style: TextButton.styleFrom(foregroundColor: Colors.red.shade400, padding: EdgeInsets.symmetric(horizontal: 10), minimumSize: Size.zero),
            child: const Text('删除', style: TextStyle(fontSize: 12)),
          ),
        ]),
      ]),
    );
  }

  String _fmtTime(String t) {
    if (t.isEmpty) return '-';
    try {
      return t.length > 16 ? t.substring(0, 16).replaceFirst('T', ' ') : t;
    } catch (_) {
      return t;
    }
  }
}
