import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/services/websocket_service.dart';

/// 定时任务页面
class CronPage extends StatefulWidget {
  final String? sessionKey;
  const CronPage({super.key, this.sessionKey});

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

  static const String _storageKey = 'cron_tasks';

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

  Future<void> _loadTasks() async {
    setState(() => _isLoadingTasks = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final json = prefs.getString(_storageKey);
      if (json != null) {
        final List<dynamic> decoded = const JsonDecoder().convert(json);
        setState(() {
          _tasks = decoded.cast<Map<String, dynamic>>();
        });
      }
    } catch (_) {}
    setState(() => _isLoadingTasks = false);
  }

  Future<void> _saveTasks() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_storageKey, jsonEncode(_tasks));
  }

  /// 构建 cron 表达式
  String _buildCronExpr() {
    final hour = _time.split(':')[0];
    final minute = _time.split(':')[1];

    switch (_frequency) {
      case '仅一次':
        // 返回相对时间描述，AI 会处理
        return 'once_$_time';
      case '每天':
        return '$minute $hour * * *';
      case '每周':
        final dayNum = _weekDays.indexOf(_selectedDay ?? '周一') + 1;
        return '$minute $hour * * $dayNum';
      case '每小时':
        return '0 * * * *';
      case '自定义':
        return '$minute $hour * * *';
      default:
        return '$minute $hour * * *';
    }
  }

  /// 构建自然语言提示
  String _buildPrompt() {
    String timeDesc;
    switch (_frequency) {
      case '仅一次':
        timeDesc = '在今天 $_time 执行一次';
      case '每天':
        timeDesc = '每天 $_time';
      case '每周':
        timeDesc = '每周${_selectedDay ?? "周一"} $_time';
      case '每小时':
        timeDesc = '每小时执行一次';
      case '自定义':
        timeDesc = '每天 $_time';
      default:
        timeDesc = '每天 $_time';
    }

    return '请帮我创建一个定时任务：${_frequency} ${timeDesc} 执行以下任务：${_taskController.text}';
  }

  /// 通过 AI 创建定时任务
  Future<void> _createTask() async {
    if (_taskController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请输入任务内容'), backgroundColor: Colors.red),
      );
      return;
    }

    setState(() => _isCreating = true);

    final prompt = _buildPrompt();

    // 通过 WebSocket 发送给 AI，AI 会自动调用 cron add
    final ws = WebSocketService();
    if (!ws.isConnected) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('WebSocket 未连接，请先连接服务器'), backgroundColor: Colors.red),
      );
      setState(() => _isCreating = false);
      return;
    }

    // 构建 sessionKey
    final sessionKey = widget.sessionKey ?? 'main';

    ws.sendRequest('chat.send', {
      'sessionKey': sessionKey,
      'message': prompt,
    });

    // 保存任务到本地列表
    final newTask = {
      'id': 'cron_${DateTime.now().millisecondsSinceEpoch}',
      'title': _taskController.text.trim(),
      'frequency': _frequency,
      'time': _time,
      'day': _selectedDay,
      'status': 'active',
      'createdAt': DateTime.now().toIso8601String(),
    };

    setState(() {
      _tasks.insert(0, newTask);
    });
    await _saveTasks();

    _taskController.clear();
    setState(() => _isCreating = false);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('✅ 任务已发送给 AI，正在创建...'),
          backgroundColor: Constants.primaryColor,
        ),
      );
    }
  }

  Future<void> _toggleTask(int index) async {
    final task = _tasks[index];
    final isActive = task['status'] == 'active';
    final newStatus = isActive ? 'paused' : 'active';

    // 通过 AI 操作
    final ws = WebSocketService();
    if (ws.isConnected) {
      final action = isActive ? '暂停' : '恢复';
      ws.sendRequest('chat.send', {
        'sessionKey': widget.sessionKey ?? 'main',
        'message': '请${action}定时任务：${task['title']}（任务ID: ${task['id']}）',
      });
    }

    setState(() {
      _tasks[index]['status'] = newStatus;
    });
    await _saveTasks();
  }

  Future<void> _deleteTask(int index) async {
    final task = _tasks[index];

    // 通过 AI 操作
    final ws = WebSocketService();
    if (ws.isConnected) {
      ws.sendRequest('chat.send', {
        'sessionKey': widget.sessionKey ?? 'main',
        'message': '请删除定时任务：${task['title']}（任务ID: ${task['id']}）',
      });
    }

    setState(() {
      _tasks.removeAt(index);
    });
    await _saveTasks();
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
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ===== 创建任务卡片 =====
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

                // 任务输入
                TextField(
                  controller: _taskController,
                  maxLines: 2,
                  style: TextStyle(color: textColor, fontSize: 15),
                  decoration: InputDecoration(
                    hintText: '描述任务内容...\n例如：提醒我查看邮件、生成日报、播报天气',
                    hintStyle: TextStyle(color: subColor, fontSize: 14),
                    filled: true,
                    fillColor: fieldBg,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                    contentPadding: const EdgeInsets.all(14),
                  ),
                ),
                const SizedBox(height: 14),

                // 频率选择
                Row(
                  children: [
                    Text('🕐 频率', style: TextStyle(fontSize: 13, color: subColor, fontWeight: FontWeight.w500)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                          color: fieldBg,
                          borderRadius: BorderRadius.circular(10),
                        ),
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
                                if (_frequency == '每周' && _selectedDay == null) {
                                  _selectedDay = '周一';
                                }
                              });
                            },
                          ),
                        ),
                      ),
                    ),
                  ],
                ),

                // 时间和星期选择
                const SizedBox(height: 10),
                Row(
                  children: [
                    // 时间选择
                    if (_frequency != '每小时')
                      Expanded(
                        child: Row(
                          children: [
                            Text('⏰ 时间', style: TextStyle(fontSize: 13, color: subColor, fontWeight: FontWeight.w500)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12),
                                decoration: BoxDecoration(
                                  color: fieldBg,
                                  borderRadius: BorderRadius.circular(10),
                                ),
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
                    // 星期选择
                    if (_frequency == '每周') ...[
                      const SizedBox(width: 8),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          decoration: BoxDecoration(
                            color: fieldBg,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                              value: _selectedDay ?? '周一',
                              isExpanded: true,
                              icon: Icon(Icons.expand_more, color: subColor, size: 18),
                              style: TextStyle(fontSize: 14, color: textColor),
                              items: _weekDays.map((d) => DropdownMenuItem(value: d, child: Text(d))).toList(),
                              onChanged: (v) => setState(() => _selectedDay = v!),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),

                const SizedBox(height: 18),

                // 启动按钮
                SizedBox(
                  width: double.infinity,
                  height: 46,
                  child: ElevatedButton(
                    onPressed: _isCreating ? null : _createTask,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF8B5CF6),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 0,
                    ),
                    child: _isCreating
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.rocket_launch, size: 18),
                              SizedBox(width: 6),
                              Text('启动任务', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                            ],
                          ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // ===== 任务列表 =====
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
                child: Text(
                  '${_tasks.length}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: _tasks.isEmpty ? Colors.grey : const Color(0xFF8B5CF6),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          if (_isLoadingTasks)
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))

          else if (_tasks.isEmpty)
            Container(
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                color: cardColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                children: [
                  Icon(Icons.schedule, size: 40, color: subColor),
                  const SizedBox(height: 12),
                  Text('暂无定时任务', style: TextStyle(fontSize: 15, color: subColor)),
                  const SizedBox(height: 4),
                  Text('创建你的第一个任务吧', style: TextStyle(fontSize: 13, color: subColor)),
                ],
              ),
            )

          else
            ...List.generate(_tasks.length, (i) {
              final task = _tasks[i];
              final isActive = task['status'] == 'active';
              final freq = task['frequency'] ?? '每天';
              final time = task['time'] ?? '09:00';
              final day = task['day'] ?? '';
              final createdAt = task['createdAt'] ?? '';

              String scheduleDesc;
              switch (freq) {
                case '仅一次':
                  scheduleDesc = '单次 · $time';
                case '每天':
                  scheduleDesc = '每天 · $time';
                case '每周':
                  scheduleDesc = '每周${day} · $time';
                case '每小时':
                  scheduleDesc = '每小时';
                default:
                  scheduleDesc = '$freq · $time';
              }

              // 格式化创建时间
              String createdStr = '';
              if (createdAt.isNotEmpty) {
                try {
                  final dt = DateTime.parse(createdAt);
                  createdStr = '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
                } catch (_) {}
              }

              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: cardColor,
                    borderRadius: BorderRadius.circular(14),
                    border: isActive ? Border.all(color: const Color(0xFF8B5CF6).withOpacity(0.2)) : null,
                  ),
                  child: Row(
                    children: [
                      // 状态指示
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isActive ? const Color(0xFF22C55E) : Colors.grey,
                        ),
                      ),
                      const SizedBox(width: 12),

                      // 任务信息
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              task['title'] ?? '',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w500,
                                color: textColor,
                                decoration: isActive ? null : TextDecoration.lineThrough,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 3),
                            Text(
                              '$scheduleDesc · $createdStr',
                              style: TextStyle(fontSize: 12, color: subColor),
                            ),
                          ],
                        ),
                      ),

                      // 操作按钮
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // 暂停/恢复
                          GestureDetector(
                            onTap: () => _toggleTask(i),
                            child: Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                color: isActive
                                    ? Colors.orange.withOpacity(0.1)
                                    : const Color(0xFF22C55E).withOpacity(0.1),
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
                          // 删除
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
