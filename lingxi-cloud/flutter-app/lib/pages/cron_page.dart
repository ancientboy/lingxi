import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/services/rpc_ws.dart';
import 'package:lingxicloud/services/lume_websocket_service.dart';

/// 定时任务页面 — 通过 Lume gateway.call / Gateway cron.* 直连
class CronPage extends StatefulWidget {
  final String? sessionKey;
  CronPage({super.key, this.sessionKey});

  @override
  State<CronPage> createState() => _CronPageState();
}

class _CronPageState extends State<CronPage> {
  final _taskController = TextEditingController();
  String _frequency = '每天';
  String _time = '09:00';
  String? _selectedDay;
  bool _isCreating = false;
  List<Map<String, dynamic>> _tasks = [];
  bool _isLoadingTasks = false;
  String? _loadError;
  final Set<String> _expandedTaskIds = {};

  final List<String> _frequencies = ['仅一次', '每天', '每周', '每小时', '自定义'];
  final List<String> _weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  final List<String> _timeSlots = [
    '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
    '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
    '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
  ];

  @override
  void initState() {
    super.initState();
    _loadTasks();
  }

  @override
  void dispose() {
    _taskController.dispose();
    super.dispose();
  }

  Future<void> _ensureConnected() async {
    if (rpcConnected) return;
    final lume = LumeWebSocketService();
    if (!lume.isConnecting) await lume.connect().catchError((_) {});
    await Future.delayed(const Duration(milliseconds: 800));
  }

  String _formatMs(dynamic ms) {
    if (ms is! num) return '—';
    try {
      final dt = DateTime.fromMillisecondsSinceEpoch(ms.toInt()).toLocal();
      return '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return '—';
    }
  }

  Map<String, dynamic> _buildSchedule() {
    final parts = _time.split(':');
    final hour = int.parse(parts[0]);
    final minute = int.parse(parts[1]);
    switch (_frequency) {
      case '仅一次':
        final now = DateTime.now();
        var target = DateTime(now.year, now.month, now.day, hour, minute);
        if (target.isBefore(now)) target = target.add(const Duration(days: 1));
        return {
          'kind': 'at',
          'at': target.toIso8601String(),
          'tz': 'Asia/Shanghai',
        };
      case '每天':
      case '自定义':
        return {'kind': 'cron', 'expr': '$minute $hour * * *', 'tz': 'Asia/Shanghai'};
      case '每周':
        final dayNum = _weekDays.indexOf(_selectedDay ?? '周一') + 1;
        return {'kind': 'cron', 'expr': '$minute $hour * * $dayNum', 'tz': 'Asia/Shanghai'};
      case '每小时':
        return {'kind': 'cron', 'expr': '0 * * * *', 'tz': 'Asia/Shanghai'};
      default:
        return {'kind': 'cron', 'expr': '$minute $hour * * *', 'tz': 'Asia/Shanghai'};
    }
  }

  Map<String, dynamic> _jobToTask(Map<String, dynamic> job) {
    final schedule = job['schedule'];
    String frequency = '自定义';
    String time = '';
    String? day;
    String scheduleRaw = '';
    if (schedule is Map) {
      scheduleRaw = schedule['expr']?.toString() ?? schedule['at']?.toString() ?? '';
      if (schedule['kind'] == 'cron') {
        final expr = schedule['expr']?.toString() ?? '';
        final p = expr.split(RegExp(r'\s+'));
        if (p.length >= 5) {
          time = '${p[1].padLeft(2, '0')}:${p[0].padLeft(2, '0')}';
          if (p[1] == '*' && p[0] == '0') {
            frequency = '每小时';
            time = '';
          } else if (p[4] != '*' && p[2] == '*') {
            frequency = '每周';
            final d = int.tryParse(p[4]) ?? 1;
            day = _weekDays[(d - 1).clamp(0, 6)];
          } else {
            frequency = '每天';
          }
        }
      } else if (schedule['kind'] == 'at') {
        frequency = '仅一次';
        final at = schedule['at']?.toString();
        if (at != null) {
          try {
            final dt = DateTime.parse(at).toLocal();
            time = '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
          } catch (_) {}
        }
      }
    }
    final payload = job['payload'];
    final message = payload is Map ? payload['message']?.toString() ?? '' : '';
    final state = job['state'] is Map ? Map<String, dynamic>.from(job['state'] as Map) : <String, dynamic>{};
    final createdMs = job['createdAtMs'];
    return {
      'id': job['id']?.toString() ?? '',
      'title': job['name']?.toString() ?? message,
      'frequency': frequency,
      'time': time,
      'day': day,
      'status': job['enabled'] == true ? 'active' : 'paused',
      'message': message,
      'scheduleRaw': scheduleRaw,
      'agentId': job['agentId']?.toString() ?? 'main',
      'sessionKey': job['sessionKey']?.toString() ?? '',
      'lastRunAt': _formatMs(state['lastRunAtMs'] ?? job['lastRunAtMs']),
      'nextRunAt': _formatMs(state['nextRunAtMs']),
      'createdAt': createdMs is num
          ? DateTime.fromMillisecondsSinceEpoch(createdMs.toInt()).toIso8601String()
          : DateTime.now().toIso8601String(),
      'raw': job,
    };
  }

  Future<void> _loadTasks() async {
    setState(() {
      _isLoadingTasks = true;
      _loadError = null;
    });
    await _ensureConnected();
    if (!rpcConnected) {
      if (mounted) {
        setState(() {
          _isLoadingTasks = false;
          _loadError = '未连接服务器';
        });
      }
      return;
    }
    // OpenClaw 默认 cron.list 不返回已暂停任务，必须带 includeDisabled
    final res = await rpcGatewayCall('cron.list', {'includeDisabled': true});
    final payload = rpcGatewayPayload(res);
    if (!mounted) return;
    if (payload == null) {
      setState(() {
        _isLoadingTasks = false;
        _loadError = rpcGatewayError(res) ?? '加载失败';
      });
      return;
    }
    final jobs = payload['jobs'];
    final list = jobs is List
        ? jobs.whereType<Map>().map((e) => _jobToTask(Map<String, dynamic>.from(e))).toList()
        : <Map<String, dynamic>>[];
    setState(() {
      _tasks = list;
      _isLoadingTasks = false;
      _loadError = null;
      _expandedTaskIds.removeWhere((id) => !list.any((t) => t['id'] == id));
    });
  }

  Future<void> _createTask() async {
    final title = _taskController.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请输入任务内容'), backgroundColor: Colors.red),
      );
      return;
    }
    setState(() => _isCreating = true);
    await _ensureConnected();
    if (!rpcConnected) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('未连接服务器，请先打开聊天页'), backgroundColor: Colors.red),
      );
      setState(() => _isCreating = false);
      return;
    }
    final name = title.length > 40 ? '${title.substring(0, 40)}…' : title;
    final res = await rpcGatewayCall('cron.add', {
      'name': name,
      'schedule': _buildSchedule(),
      'payload': {'kind': 'agentTurn', 'message': title},
      'enabled': true,
    }, timeout: const Duration(seconds: 20));
    if (!mounted) return;
    setState(() => _isCreating = false);
    if (!rpcGatewayOk(res)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('创建失败：${rpcGatewayError(res)}'), backgroundColor: Colors.red),
      );
      return;
    }
    _taskController.clear();
    await _loadTasks();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: const Text('定时任务已创建'), backgroundColor: Constants.primaryColor),
    );
  }

  Future<void> _toggleTask(int index) async {
    final task = _tasks[index];
    final jobId = task['id']?.toString() ?? '';
    if (jobId.isEmpty) return;
    final isActive = task['status'] == 'active';
    final res = await rpcGatewayCall('cron.update', {
      'id': jobId,
      'patch': {'enabled': !isActive},
    });
    if (!rpcGatewayOk(res)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('操作失败：${rpcGatewayError(res)}'), backgroundColor: Colors.red),
        );
      }
      return;
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isActive ? '任务已暂停' : '任务已恢复'),
          backgroundColor: Constants.primaryColor,
        ),
      );
    }
    await _loadTasks();
  }

  Future<void> _deleteTask(int index) async {
    final task = _tasks[index];
    final jobId = task['id']?.toString() ?? '';
    final title = task['title']?.toString() ?? '此任务';
    if (jobId.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除定时任务'),
        content: Text('确定删除「$title」？\n\n此操作不可恢复。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('删除', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final res = await rpcGatewayCall('cron.remove', {'id': jobId});
    if (!rpcGatewayOk(res)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('删除失败：${rpcGatewayError(res)}'), backgroundColor: Colors.red),
        );
      }
      return;
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('任务已删除'), backgroundColor: Constants.primaryColor),
      );
    }
    await _loadTasks();
  }

  void _toggleExpand(String taskId) {
    setState(() {
      if (_expandedTaskIds.contains(taskId)) {
        _expandedTaskIds.remove(taskId);
      } else {
        _expandedTaskIds.add(taskId);
      }
    });
  }

  Widget _buildTaskDetail(Map<String, dynamic> task, Color subColor, Color textColor, Color fieldBg) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: fieldBg,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _detailRow('任务内容', task['message']?.toString() ?? '—', subColor, textColor),
          const SizedBox(height: 8),
          _detailRow('执行计划', task['scheduleRaw']?.toString().isNotEmpty == true ? task['scheduleRaw'] : '—', subColor, textColor),
          const SizedBox(height: 8),
          _detailRow('Agent', task['agentId']?.toString() ?? 'main', subColor, textColor),
          if ((task['sessionKey']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 8),
            _detailRow('会话', task['sessionKey']?.toString() ?? '', subColor, textColor),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _detailRow('上次执行', task['lastRunAt']?.toString() ?? '—', subColor, textColor, compact: true)),
              Expanded(child: _detailRow('下次执行', task['nextRunAt']?.toString() ?? '—', subColor, textColor, compact: true)),
            ],
          ),
          const SizedBox(height: 8),
          _detailRow('任务 ID', task['id']?.toString() ?? '', subColor, textColor, mono: true),
        ],
      ),
    );
  }

  Widget _detailRow(String label, String value, Color subColor, Color textColor, {bool compact = false, bool mono = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 11, color: subColor, fontWeight: FontWeight.w500)),
        if (!compact) const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(
            fontSize: compact ? 12 : 13,
            color: textColor,
            fontFamily: mono ? 'monospace' : null,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final dk = Theme.of(context).brightness == Brightness.dark;
    final bg = dk ? const Color(0xFF1A1A2E) : const Color(0xFFF5F5F7);
    final cardColor = dk ? const Color(0xFF252540) : Colors.white;
    final textColor = dk ? Colors.white : Colors.black87;
    final subColor = dk ? Colors.white54 : Colors.black45;
    final fieldBg = dk ? const Color(0xFF2A2A45) : const Color(0xFFF0F0F5);

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        title: const Text('⏰ 定时任务'),
        backgroundColor: bg,
        foregroundColor: textColor,
        elevation: 0,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadTasks, tooltip: '刷新'),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_loadError != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(_loadError!, style: TextStyle(color: Colors.orange.shade700, fontSize: 13)),
            ),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: cardColor,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF8B5CF6).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.add_circle_outline, color: Color(0xFF8B5CF6), size: 20),
                    ),
                    const SizedBox(width: 10),
                    Text('创建任务', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: textColor)),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _taskController,
                  maxLines: 2,
                  style: TextStyle(color: textColor, fontSize: 15),
                  decoration: InputDecoration(
                    hintText: '描述任务内容...\n例如：提醒我查看邮件、生成日报、播报天气',
                    hintStyle: TextStyle(color: subColor, fontSize: 14),
                    filled: true,
                    fillColor: fieldBg,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                    contentPadding: const EdgeInsets.all(14),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Text('🕐 频率', style: TextStyle(fontSize: 13, color: subColor, fontWeight: FontWeight.w500)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(color: fieldBg, borderRadius: BorderRadius.circular(10)),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: _frequency,
                            isExpanded: true,
                            icon: Icon(Icons.expand_more, color: subColor, size: 18),
                            style: TextStyle(fontSize: 14, color: textColor),
                            items: _frequencies.map((f) => DropdownMenuItem(value: f, child: Text(f))).toList(),
                            onChanged: (v) {
                              setState(() {
                                _frequency = v!;
                                if (_frequency == '每周' && _selectedDay == null) _selectedDay = '周一';
                              });
                            },
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    if (_frequency != '每小时')
                      Expanded(
                        child: Row(
                          children: [
                            Text('⏰ 时间', style: TextStyle(fontSize: 13, color: subColor, fontWeight: FontWeight.w500)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12),
                                decoration: BoxDecoration(color: fieldBg, borderRadius: BorderRadius.circular(10)),
                                child: DropdownButtonHideUnderline(
                                  child: DropdownButton<String>(
                                    value: _time,
                                    isExpanded: true,
                                    icon: Icon(Icons.expand_more, color: subColor, size: 18),
                                    style: TextStyle(fontSize: 14, color: textColor),
                                    items: _timeSlots.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                                    onChanged: (v) => setState(() => _time = v!),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (_frequency == '每周') ...[
                      const SizedBox(width: 8),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          decoration: BoxDecoration(color: fieldBg, borderRadius: BorderRadius.circular(10)),
                          child: DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                              value: _selectedDay ?? '周一',
                              isExpanded: true,
                              icon: Icon(Icons.expand_more, color: subColor, size: 18),
                              style: TextStyle(fontSize: 14, color: textColor),
                              items: _weekDays.map((d) => DropdownMenuItem(value: d, child: Text(d))).toList(),
                              onChanged: (v) => setState(() => _selectedDay = v),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isCreating ? null : _createTask,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF8B5CF6),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: _isCreating
                        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('创建定时任务', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Text('我的任务', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: textColor)),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: _tasks.isEmpty ? Colors.grey.withOpacity(0.1) : const Color(0xFF8B5CF6).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text('${_tasks.length}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _tasks.isEmpty ? Colors.grey : const Color(0xFF8B5CF6))),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_isLoadingTasks)
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
          else if (_tasks.isEmpty)
            Container(
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(16)),
              child: Column(
                children: [
                  Icon(Icons.schedule, size: 40, color: subColor),
                  const SizedBox(height: 12),
                  Text('暂无定时任务', style: TextStyle(fontSize: 15, color: subColor)),
                ],
              ),
            )
          else
            ...List.generate(_tasks.length, (i) {
              final task = _tasks[i];
              final taskId = task['id']?.toString() ?? '';
              final isActive = task['status'] == 'active';
              final expanded = _expandedTaskIds.contains(taskId);
              final freq = task['frequency'] ?? '每天';
              final time = task['time'] ?? '';
              final day = task['day'] ?? '';
              String scheduleDesc;
              switch (freq) {
                case '仅一次':
                  scheduleDesc = '单次 · $time';
                case '每天':
                  scheduleDesc = '每天 · $time';
                case '每周':
                  scheduleDesc = '每周$day · $time';
                case '每小时':
                  scheduleDesc = '每小时';
                default:
                  scheduleDesc = '$freq · $time';
              }
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: cardColor,
                    borderRadius: BorderRadius.circular(14),
                    border: isActive
                        ? Border.all(color: const Color(0xFF8B5CF6).withOpacity(0.2))
                        : Border.all(color: Colors.grey.withOpacity(0.15)),
                  ),
                  child: Column(
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            margin: const EdgeInsets.only(top: 6),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isActive ? const Color(0xFF22C55E) : Colors.grey,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: InkWell(
                              onTap: taskId.isEmpty ? null : () => _toggleExpand(taskId),
                              borderRadius: BorderRadius.circular(8),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(vertical: 2),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            task['title'] ?? '',
                                            style: TextStyle(
                                              fontSize: 15,
                                              fontWeight: FontWeight.w500,
                                              color: textColor,
                                              decoration: isActive ? null : TextDecoration.lineThrough,
                                            ),
                                            maxLines: expanded ? null : 2,
                                            overflow: expanded ? null : TextOverflow.ellipsis,
                                          ),
                                        ),
                                        Icon(
                                          expanded ? Icons.expand_less : Icons.expand_more,
                                          size: 18,
                                          color: subColor,
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      '${isActive ? '运行中' : '已暂停'} · $scheduleDesc',
                                      style: TextStyle(fontSize: 12, color: subColor),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          GestureDetector(
                            onTap: () => _toggleTask(i),
                            child: Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                color: isActive ? Colors.orange.withOpacity(0.1) : const Color(0xFF22C55E).withOpacity(0.1),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Icon(
                                isActive ? Icons.pause_rounded : Icons.play_arrow_rounded,
                                size: 18,
                                color: isActive ? Colors.orange : const Color(0xFF22C55E),
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          GestureDetector(
                            onTap: () => _deleteTask(i),
                            child: Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                color: Colors.red.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Icon(Icons.delete_outline, size: 18, color: Colors.red.shade400),
                            ),
                          ),
                        ],
                      ),
                      if (expanded) _buildTaskDetail(task, subColor, textColor, fieldBg),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}
