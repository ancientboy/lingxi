import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/pages/home_page.dart';
import 'package:lingxicloud/pages/subscription_page.dart';
import 'package:lingxicloud/pages/skills_page.dart';
import 'package:lingxicloud/pages/settings_page.dart';
import 'package:lingxicloud/pages/lumeclaw_page.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:lingxicloud/services/websocket_service.dart';
import 'package:lingxicloud/pages/chat_page.dart';
import 'package:intl/intl.dart';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class SideMenu extends StatelessWidget {
  final bool asDrawer;
  const SideMenu({super.key, this.asDrawer = false});

  @override
  Widget build(BuildContext context) {
    final content = _buildContent(context);
    
    return asDrawer 
        ? Drawer(child: content) 
        : Material(color: Colors.white, child: content);
  }

  Widget _buildContent(BuildContext context) {
    return Column(
      children: [
        // 品牌区域
        Container(
          padding: const EdgeInsets.all(16),
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Constants.primaryColor, Color(0xFF4F46E5)],
            ),
          ),
          child: SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.auto_awesome, color: Colors.white, size: 24),
                    ),
                    const SizedBox(width: 12),
                    const Text(
                      '灵犀云',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Consumer<AppProvider>(
                  builder: (context, appProvider, child) {
                    if (appProvider.user == null) {
                      return const SizedBox.shrink();
                    }
                    return Row(
                      children: [
                        CircleAvatar(
                          radius: 16,
                          backgroundColor: Colors.white.withOpacity(0.2),
                          child: Text(
                            appProvider.user!.nickname.isNotEmpty
                                ? appProvider.user!.nickname.substring(0, 1).toUpperCase()
                                : 'U',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          appProvider.user!.nickname,
                          style: const TextStyle(color: Colors.white70, fontSize: 14),
                        ),
                        const Spacer(),
                        Text(
                          '💎 ${appProvider.user!.points}',
                          style: const TextStyle(color: Colors.white70, fontSize: 14),
                        ),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        ),

        // 功能菜单
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              _MenuItem(
                icon: Icons.chat_outlined,
                title: '聊天',
                onTap: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).pushAndRemoveUntil(
                    MaterialPageRoute(builder: (_) => const HomePage()),
                    (route) => route.isFirst,
                  );
                },
              ),
              const Divider(height: 24),
              const _MenuSection(title: '功能'),
              _MenuItem(
                icon: Icons.people_outline,
                title: '我的团队',
                onTap: () {
                  Navigator.of(context).pop();
                  _showTeamDialog(context);
                },
              ),
              _MenuItem(
                icon: Icons.message_outlined,
                title: '飞书配置',
                onTap: () {
                  Navigator.of(context).pop();
                  _showComingSoon(context, '飞书配置');
                },
              ),
              _MenuItem(
                icon: Icons.business_outlined,
                title: '企业微信',
                onTap: () {
                  Navigator.of(context).pop();
                  _showComingSoon(context, '企业微信配置');
                },
              ),
              _MenuItem(
                icon: Icons.segment_outlined,
                title: '技能库',
                onTap: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const SkillsPage()),
                  );
                },
              ),
              // LumeClaw 维护模式
              _MenuItem(
                icon: Icons.build_outlined,
                title: 'LumeClaw',
                onTap: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const LumeClawPage()),
                  );
                },
              ),
              const Divider(height: 24),
              const _MenuSection(title: '历史会话'),
              _MenuItem(
                icon: Icons.history_outlined,
                title: '历史会话',
                onTap: () {
                  Navigator.of(context).pop();
                  _showSessionsDialog(context);
                },
              ),
              _MenuItem(
                icon: Icons.bar_chart_outlined,
                title: '使用量统计',
                onTap: () {
                  Navigator.of(context).pop();
                  _showUsageStatsDialog(context);
                },
              ),
              const Divider(height: 24),
              const _MenuSection(title: '订阅'),
              _MenuItem(
                icon: Icons.star_rounded,
                title: '我的订阅',
                onTap: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const SubscriptionPage()),
                  );
                },
              ),
              const Divider(height: 24),
              const _MenuSection(title: '设置'),
              _MenuItem(
                icon: Icons.settings_outlined,
                title: '设置',
                onTap: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const SettingsPage()),
                  );
                },
              ),
              _MenuItem(
                icon: Icons.info_outline,
                title: '关于',
                onTap: () {
                  Navigator.of(context).pop();
                  showAboutDialog(
                    context: context,
                    applicationName: Constants.appName,
                    applicationVersion: Constants.appVersion,
                    applicationLegalese: '© 2026 灵犀云',
                    children: const [Text('你的 AI 团队，一键拥有')],
                  );
                },
              ),
            ],
          ),
        ),

        // 底部版本信息
        Divider(height: 1, color: Constants.textLightColor.withOpacity(0.2)),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(Icons.info_outlined, color: Constants.textSecondaryColor, size: 16),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Version ${Constants.appVersion}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Constants.textSecondaryColor),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '灵犀云 AI Assistant',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Constants.textLightColor),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _showComingSoon(BuildContext context, String feature) {
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

  void _showTeamDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.people_outline, color: Constants.primaryColor),
            SizedBox(width: 8),
            Text('我的团队'),
          ],
        ),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(Icons.auto_awesome, color: Constants.primaryColor),
              title: Text('灵犀'),
              subtitle: Text('队长 · 智能调度'),
            ),
            ListTile(
              leading: Icon(Icons.code, color: Constants.primaryColor),
              title: Text('云溪'),
              subtitle: Text('编程开发'),
            ),
            ListTile(
              leading: Icon(Icons.bar_chart, color: Constants.primaryColor),
              title: Text('若曦'),
              subtitle: Text('数据分析'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('关闭')),
        ],
      ),
    );
  }

  // 会话分组类型
  enum SessionGroup {
    today,
    last7Days,
    previous,
  }

  // 将会话按时间分组
  Map<SessionGroup, List<Map<String, dynamic>>> _groupSessionsByDate(List<Map<String, dynamic>> sessions) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final sevenDaysAgo = today.subtract(const Duration(days: 7));

    final Map<SessionGroup, List<Map<String, dynamic>>> grouped = {
      SessionGroup.today: [],
      SessionGroup.last7Days: [],
      SessionGroup.previous: [],
    };

    for (final session in sessions) {
      final updatedAt = session['updatedAt'] != null
          ? DateTime.tryParse(session['updatedAt'] as String)
          : null;
      if (updatedAt == null) continue;

      if (updatedAt.isAfter(today)) {
        grouped[SessionGroup.today]?.add(session);
      } else if (updatedAt.isAfter(sevenDaysAgo)) {
        grouped[SessionGroup.last7Days]?.add(session);
      } else {
        grouped[SessionGroup.previous]?.add(session);
      }
    }

    // 排序每组内的会话（最新的在前）
    for (final group in grouped.values) {
      group.sort((a, b) {
        final timeA = a['updatedAt'] != null ? DateTime.tryParse(a['updatedAt'] as String) : null;
        final timeB = b['updatedAt'] != null ? DateTime.tryParse(b['updatedAt'] as String) : null;
        if (timeA == null || timeB == null) return 0;
        return timeB.compareTo(timeA);
      });
    }

    return grouped;
  }

  // 格式化时间
  String _formatSessionTime(DateTime? date) {
    if (date == null) return '未知时间';
    
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    
    if (date.isAfter(today)) {
      return '今天 ${date.hour}:${date.minute.toString().padLeft(2, '0')}';
    } else if (date.isAfter(today.subtract(const Duration(days: 7)))) {
      final daysAgo = today.difference(date).inDays;
      if (daysAgo == 1) return '昨天';
      if (daysAgo == 2) return '前天';
      return '${daysAgo + 1}天前';
    } else {
      return '${date.month}/${date.day}';
    }
  }

  void _showSessionsDialog(BuildContext context) async {
    showDialog(
      context: context,
      builder: (_) => _SessionsDialog(),
    );
  }

  void _showUsageStatsDialog(BuildContext context) async {
    // 显示加载对话框
    final loadingDialog = showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => Dialog(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Row(
            children: const [
              SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              SizedBox(width: 16),
              Text('加载中...'),
            ],
          ),
        ),
      ),
    );

    try {
      final apiService = ApiService();
      final stats = await apiService.getUsageStats();

      // 关闭加载对话框
      if (Navigator.canPop(context)) {
        Navigator.pop(context);
      }

      showDialog(
        context: context,
        builder: (context) => Consumer<AppProvider>(
          builder: (context, appProvider, child) {
            // 解析数据
            final todayTokens = stats?['today']?['tokens'] ?? 0;
            final weekTokens = stats?['week']?['tokens'] ?? 0;
            final monthTokens = stats?['month']?['tokens'] ?? 0;
            final credits = appProvider.user?.points ?? 0;

            return AlertDialog(
              title: const Row(
                children: [
                  Icon(Icons.bar_chart_outlined, color: Constants.primaryColor),
                  SizedBox(width: 8),
                  Text('使用量统计'),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ListTile(
                    leading: const Icon(Icons.token),
                    title: const Text('积分余额'),
                    trailing: Text(
                      '💎 $credits',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                  ListTile(
                    leading: const Icon(Icons.today),
                    title: const Text('今日使用'),
                    trailing: Text(
                      _formatNumber(todayTokens) + ' tokens',
                    ),
                  ),
                  ListTile(
                    leading: const Icon(Icons.calendar_today),
                    title: const Text('本周使用'),
                    trailing: Text(
                      _formatNumber(weekTokens) + ' tokens',
                    ),
                  ),
                  ListTile(
                    leading: const Icon(Icons.calendar_month),
                    title: const Text('本月使用'),
                    trailing: Text(
                      _formatNumber(monthTokens) + ' tokens',
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
            );
          },
        ),
      );
    } catch (e) {
      debugPrint('加载使用量统计失败: $e');
      // 关闭加载对话框
      if (Navigator.canPop(context)) {
        Navigator.pop(context);
      }
      // 显示错误提示
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('加载失败: $e')),
      );
    }
  }

  // 格式化数字（添加千分位）
  String _formatNumber(int number) {
    return number.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (Match m) => '${m[1]},',
    );
  }
}

// 历史会话对话框
class _SessionsDialog extends StatefulWidget {
  @override
  State<_SessionsDialog> createState() => _SessionsDialogState();
}

class _SessionsDialogState extends State<_SessionsDialog> {
  List<Map<String, dynamic>> _sessions = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadSessions();
  }

  Future<void> _loadSessions() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // 尝试通过 WebSocket 加载会话列表
      final ws = WebSocketService();
      
      if (!ws.isConnected) {
        // WebSocket 未连接，尝试从本地加载
        final prefs = await SharedPreferences.getInstance();
        final sessionsJson = prefs.getString('chat_sessions');
        if (sessionsJson != null) {
          final List<dynamic> decoded = json.decode(sessionsJson);
          if (mounted) {
            setState(() {
              _sessions = decoded.cast<Map<String, dynamic>>();
              _loading = false;
            });
          }
          return;
        }
        
        if (mounted) {
          setState(() {
            _loading = false;
            _error = '请先连接到服务器';
          });
        }
        return;
      }

      // 通过 WebSocket 获取会话列表
      debugPrint('📋 发送 sessions.list 请求');
      ws.sendRequest('sessions.list', {});
      
      // 等待 WebSocket 响应（最多 10 秒）
      final result = await _waitForSessionList(ws, 10000);
      
      if (mounted) {
        setState(() {
          _sessions = result ?? [];
          _loading = false;
        });
      }
    } catch (e) {
      debugPrint('加载会话列表失败: $e');
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  // 等待 WebSocket 会话列表响应
  Future<List<Map<String, dynamic>>?> _waitForSessionList(
    WebSocketService ws, 
    int timeoutMs,
  ) async {
    final completer = Completer<List<Map<String, dynamic>>?>();
    final List<Map<String, dynamic>> collectedSessions = [];
    
    void listener(Map<String, dynamic> data) {
      debugPrint('📋 收到 WebSocket 消息: ${data['type']} ${data['event'] ?? ''}');
      
      // sessions.list 响应 (检查 ok 和 payload.sessions)
      if (data['type'] == 'res' && data['ok'] == true && data['payload']?['sessions'] != null) {
        final List<dynamic> sessions = data['payload']['sessions'] as List;
        collectedSessions.addAll(
          sessions.map((s) => s as Map<String, dynamic>).toList(),
        );

        // 过滤掉本地已删除的会话
        _filterDeletedSessions(collectedSessions);

        // 🔧 去重：基于 sessionKey 或 id
        final seenKeys = <String>{};
        collectedSessions.retainWhere((session) {
          final key = session['sessionKey'] ?? session['id'] ?? '';
          if (seenKeys.contains(key)) {
            return false;
          }
          seenKeys.add(key);
          return true;
        });

        // 按更新时间排序（最新的在前）
        collectedSessions.sort((a, b) {
          final timeA = a['updatedAt'] != null
              ? DateTime.tryParse(a['updatedAt'] as String)
              : null;
          final timeB = b['updatedAt'] != null
              ? DateTime.tryParse(b['updatedAt'] as String)
              : null;
          if (timeA == null || timeB == null) return 0;
          return timeB!.compareTo(timeA!);
        });

        // 限制最多 50 个会话
        if (collectedSessions.length > 50) {
          collectedSessions.removeRange(50, collectedSessions.length);
        }

        if (!completer.isCompleted) {
          completer.complete(collectedSessions);
        }
      }
    }

    ws.addListener(listener);
    
    // 超时处理
    Duration(timeoutMs: timeoutMs).then((_) {
      ws.removeListener(listener);
      if (!completer.isCompleted) {
        completer.complete(collectedSessions);
      }
    });

    return completer.future;
  }

  // 过滤本地已删除的会话
  void _filterDeletedSessions(List<Map<String, dynamic>> sessions) {
    // TODO: 实现本地删除会话的持久化
    // 这里先不过滤
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.history_outlined, color: Constants.primaryColor),
          SizedBox(width: 8),
          Text('历史会话'),
        ],
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('加载失败: $_error'),
                        TextButton(
                          onPressed: _loadSessions,
                          child: const Text('重试'),
                        ),
                      ],
                    ),
                  )
                : _buildSessionsList(),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('关闭'),
        ),
      ],
    );
  }

  Widget _buildSessionsList() {
    if (_sessions.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.chat_outlined, size: 48, color: Constants.textLightColor),
            const SizedBox(height: 16),
            Text('暂无历史会话', style: TextStyle(color: Constants.textSecondaryColor)),
          ],
        ),
      );
    }

    final grouped = _groupSessionsByDate(_sessions);

    final List<Widget> children = [];

    // 添加"新会话"按钮
    children.add(
      ListTile(
        leading: const Icon(Icons.add, color: Constants.primaryColor),
        title: const Text('新会话'),
        subtitle: const Text('开始新的对话'),
        onTap: () {
          Navigator.pop(context);
          // 创建新会话逻辑
          _createNewSession();
        },
      ),
    );

    if (grouped[SessionGroup.today]?.isNotEmpty == true) {
      children.add(
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(
            '今天',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: Constants.textSecondaryColor,
            ),
          ),
        ),
      );
      children.addAll(_buildSessionTiles(grouped[SessionGroup.today]!));
    }

    if (grouped[SessionGroup.last7Days]?.isNotEmpty == true) {
      children.add(
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(
            '最近7天',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: Constants.textSecondaryColor,
            ),
          ),
        ),
      );
      children.addAll(_buildSessionTiles(grouped[SessionGroup.last7Days]!));
    }

    if (grouped[SessionGroup.previous]?.isNotEmpty == true) {
      children.add(
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(
            '更早',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: Constants.textSecondaryColor,
            ),
          ),
        ),
      );
      children.addAll(_buildSessionTiles(grouped[SessionGroup.previous]!));
    }

    return ListView.builder(
      shrinkWrap: true,
      padding: EdgeInsets.zero,
      itemCount: children.length,
      itemBuilder: (context, index) => children[index],
    );
  }

  List<Widget> _buildSessionTiles(List<Map<String, dynamic>> sessions) {
    return sessions.map((session) {
      final updatedAt = session['updatedAt'] != null
          ? DateTime.tryParse(session['updatedAt'] as String)
          : null;
      final timeStr = _formatSessionTime(updatedAt);

      return ListTile(
        leading: Icon(
          Icons.chat_bubble_outline,
          color: Constants.textSecondaryColor,
        ),
        title: Text(
          session['title'] ?? '无标题',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(timeStr, style: const TextStyle(fontSize: 12)),
        trailing: Icon(
          Icons.chevron_right,
          color: Constants.textLightColor,
          size: 20,
        ),
        onTap: () {
          Navigator.pop(context);
          _openSession(session);
        },
      );
    }).toList();
  }

  Future<void> _openSession(Map<String, dynamic> session) async {
    final sessionKey = session['key'] ?? session['id'];
    if (sessionKey == null) return;

    // 加载该会话的最近10条消息
    try {
      final ws = WebSocketService();
      if (ws.isConnected) {
        // TODO: 实际加载历史消息
        // 这里先跳转到聊天页面
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const ChatPage()),
          (route) => route.isFirst,
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('请先连接到服务器')),
        );
      }
    } catch (e) {
      debugPrint('打开会话失败: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('打开会话失败: $e')),
      );
    }
  }

  void _createNewSession() {
    // 创建新会话逻辑
    // TODO: 实际创建新会话
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('新会话已创建')),
    );
  }
}

class _MenuSection extends StatelessWidget {
  final String title;
  const _MenuSection({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: Constants.textSecondaryColor,
        ),
      ),
    );
  }
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  const _MenuItem({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: Constants.textSecondaryColor),
      title: Text(title, style: const TextStyle(color: Constants.textPrimaryColor)),
      trailing: const Icon(Icons.chevron_right_outlined, color: Constants.textLightColor, size: 20),
      onTap: onTap,
    );
  }
}
