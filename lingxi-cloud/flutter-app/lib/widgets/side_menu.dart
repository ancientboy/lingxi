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
import 'package:lingxicloud/services/lume_websocket_service.dart';
import 'package:lingxicloud/services/rpc_ws.dart';
import 'package:lingxicloud/pages/main_shell.dart';
import 'package:intl/intl.dart';
import 'dart:convert';
import 'package:lingxicloud/pages/workspace_page.dart';
import 'package:lingxicloud/pages/file_explorer_page.dart';
import 'package:lingxicloud/pages/servers_page.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:lingxicloud/widgets/hive_logo.dart';

class SideMenu extends StatelessWidget {
  final bool asDrawer;
  SideMenu({super.key, this.asDrawer = false});

  @override
  Widget build(BuildContext context) {
    final content = _buildContent(context);
    
    return asDrawer 
        ? Drawer(child: content) 
        : Material(color: Colors.white, child: content);
  }

  Widget _buildContent(BuildContext context) {
    return Consumer<AppProvider>(
      builder: (context, appProvider, child) {
        final user = appProvider.user;
        final credits = user?.points ?? 0;
        return Column(
          children: [
            // 品牌区域 — 蜂巢 logo
            Container(
              padding: EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Constants.surfaceColor,
                border: Border(
                  bottom: BorderSide(color: Constants.borderDefault, width: 1),
                ),
              ),
              child: SafeArea(
                child: Row(
                  children: [
                    // 蜂巢 logo badge
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: Color(0xFFF7F4EF),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: CustomPaint(
                        painter: HiveLogoPainter(),
                        size: Size(26, 26),
                      ),
                    ),
                    SizedBox(width: 10),
                    Text(
                      'Lume',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w500,
                        color: Constants.textPrimaryColor,
                        letterSpacing: -0.3,
                        fontFamily: 'Georgia',
                      ),
                    ),
                  ],
                ),
              ),
            ),

            Spacer(),

            // 用户区域 — credits pill 样式
            Divider(height: 1, color: Constants.borderDefault.withOpacity(0.5)),
            Padding(
              padding: EdgeInsets.all(16),
              child: Row(
                children: [
                  // 头像
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: Constants.primaryColor,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Text(
                        (user?.nickname ?? 'U').isNotEmpty
                          ? user!.nickname![0].toUpperCase()
                          : 'U',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.nickname ?? 'User',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: Constants.textPrimaryColor,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        SizedBox(height: 2),
                        // Credits pill
                        Container(
                          padding: EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: Color(0xFFF3F1EC),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.diamond_outlined, size: 12, color: Constants.textSecondaryColor),
                              SizedBox(width: 3),
                              Text(
                                '$credits',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: Constants.textSecondaryColor,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    'v${Constants.appVersion}',
                    style: TextStyle(
                      fontSize: 11,
                      color: Constants.textLightColor,
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  void _showComingSoon(BuildContext context, String feature) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(feature),
        content: Text('此功能即将上线，敬请期待！'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text('知道了')),
        ],
      ),
    );
  }

  void _showTeamDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(Icons.people_outline, color: Constants.primaryColor),
            SizedBox(width: 8),
            Text('我的团队'),
          ],
        ),
        content: Column(
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
          TextButton(onPressed: () => Navigator.pop(context), child: Text('关闭')),
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
    final sevenDaysAgo = today.subtract(Duration(days: 7));

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
    } else if (date.isAfter(today.subtract(Duration(days: 7)))) {
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
          padding: EdgeInsets.all(24.0),
          child: Row(
            children: [
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
              title: Row(
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
                    leading: Icon(Icons.token),
                    title: Text('积分余额'),
                    trailing: Text(
                      '💎 $credits',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                  ListTile(
                    leading: Icon(Icons.today),
                    title: Text('今日使用'),
                    trailing: Text(
                      _formatNumber(todayTokens) + ' tokens',
                    ),
                  ),
                  ListTile(
                    leading: Icon(Icons.calendar_today),
                    title: Text('本周使用'),
                    trailing: Text(
                      _formatNumber(weekTokens) + ' tokens',
                    ),
                  ),
                  ListTile(
                    leading: Icon(Icons.calendar_month),
                    title: Text('本月使用'),
                    trailing: Text(
                      _formatNumber(monthTokens) + ' tokens',
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: Text('关闭'),
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
      // Gateway 优先拉取会话列表，避免切换设备后被 Lume 抢占连接
      if (!rpcConnected) {
        final ws = WebSocketService();
        if (!ws.isConnecting) {
          await ws.connect().catchError((_) {});
        }
        await Future.delayed(const Duration(milliseconds: 800));
      }

      if (!rpcConnected) {
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

      debugPrint('📋 发送 sessions.list (Gateway 优先)');
      final res = await rpcSendAwait('sessions.list', {
        'limit': 50,
        'includeLastMessage': true,
        'includeDerivedTitles': true,
      });
      List<Map<String, dynamic>> result = [];
      if (res != null && res['ok'] == true && res['payload']?['sessions'] is List) {
        result = (res['payload']['sessions'] as List)
            .map((s) => Map<String, dynamic>.from(s as Map))
            .toList();
        _filterDeletedSessions(result);
      }

      if (mounted) {
        setState(() {
          _sessions = result;
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
    Future.delayed(Duration(milliseconds: timeoutMs)).then((_) {
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
      title: Row(
        children: [
          Icon(Icons.history_outlined, color: Constants.primaryColor),
          SizedBox(width: 8),
          Text('历史会话'),
        ],
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: _loading
            ? Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('加载失败: $_error'),
                        TextButton(
                          onPressed: _loadSessions,
                          child: Text('重试'),
                        ),
                      ],
                    ),
                  )
                : _buildSessionsList(),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text('关闭'),
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
            SizedBox(height: 16),
            Text('暂无历史会话', style: TextStyle(color: Constants.textSecondaryColor)),
          ],
        ),
      );
    }

    final grouped = _groupSessionsByDate(_sessions);

    final List<Widget> children = [];

    // 办公区入口（在"新会话"上面）
    children.add(
      ListTile(
        leading: Icon(Icons.business_outlined, color: Constants.primaryColor),
        title: Text('办公区', style: TextStyle(fontWeight: FontWeight.w600)),
        trailing: Icon(Icons.chevron_right, size: 18, color: Constants.textTertiaryColor),
        onTap: () {
          Navigator.pop(context);
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => WorkspacePage()),
          );
        },
      ),
    );
    children.add(Divider(height: 1, thickness: 0.5));

    // 添加"新会话"按钮
    children.add(
      ListTile(
        leading: Icon(Icons.add, color: Constants.primaryColor),
        title: Text('新会话'),
        subtitle: Text('开始新的对话'),
        onTap: () {
          Navigator.pop(context);
          _createNewSession();
        },
      ),
    );

    // 今天 - 默认收缩
    if (grouped[SessionGroup.today]?.isNotEmpty == true) {
      children.add(
        ExpansionTile(
          initiallyExpanded: false,
          leading: Icon(Icons.today, color: Constants.primaryColor, size: 20),
          title: Text(
            '今天',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: Constants.textPrimaryColor,
            ),
          ),
          trailing: Text(
            '${grouped[SessionGroup.today]!.length}',
            style: TextStyle(
              fontSize: 12,
              color: Constants.textSecondaryColor,
            ),
          ),
          children: _buildSessionTiles(grouped[SessionGroup.today]!),
        ),
      );
    }

    // 最近7天 - 默认收缩
    if (grouped[SessionGroup.last7Days]?.isNotEmpty == true) {
      children.add(
        ExpansionTile(
          initiallyExpanded: false,
          leading: Icon(Icons.date_range, color: Constants.textSecondaryColor, size: 20),
          title: Text(
            '最近7天',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: Constants.textPrimaryColor,
            ),
          ),
          trailing: Text(
            '${grouped[SessionGroup.last7Days]!.length}',
            style: TextStyle(
              fontSize: 12,
              color: Constants.textSecondaryColor,
            ),
          ),
          children: _buildSessionTiles(grouped[SessionGroup.last7Days]!),
        ),
      );
    }

    // 更早 - 默认收缩
    if (grouped[SessionGroup.previous]?.isNotEmpty == true) {
      children.add(
        ExpansionTile(
          initiallyExpanded: false,
          leading: Icon(Icons.history, color: Constants.textSecondaryColor, size: 20),
          title: Text(
            '更早',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: Constants.textPrimaryColor,
            ),
          ),
          trailing: Text(
            '${grouped[SessionGroup.previous]!.length}',
            style: TextStyle(
              fontSize: 12,
              color: Constants.textSecondaryColor,
            ),
          ),
          children: _buildSessionTiles(grouped[SessionGroup.previous]!),
        ),
      );
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

      // 🆕 和 Web 端保持一致：优先使用 title/label，否则显示"新对话"
      final title = session['title'] ?? session['label'] ?? '新对话';
      
      // 🆕 清理附件标记（如果有）
      String cleanTitle = title;
      final attachmentRegex = RegExp(r'\[附件:[^\]]+\]');
      cleanTitle = cleanTitle.replaceAll(attachmentRegex, '').trim();
      if (cleanTitle.isEmpty) cleanTitle = '新对话';

      return ListTile(
        leading: Icon(
          Icons.chat_bubble_outline,
          color: Constants.textSecondaryColor,
        ),
        title: Text(
          cleanTitle,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(timeStr, style: TextStyle(fontSize: 12)),
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
        // 传递 sessionKey 让 ChatPage 切换到指定会话
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(
            builder: (_) => MainShell(),
            settings: RouteSettings(arguments: {'switchToSession': sessionKey}),
          ),
          (route) => route.isFirst,
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('请先连接到服务器')),
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
      SnackBar(content: Text('新会话已创建')),
    );
  }
}

class _MenuSection extends StatelessWidget {
  final String title;
  _MenuSection({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 8, 16, 8),
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

  _MenuItem({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: Constants.textSecondaryColor),
      title: Text(title, style: TextStyle(color: Constants.textPrimaryColor)),
      trailing: Icon(Icons.chevron_right_outlined, color: Constants.textLightColor, size: 20),
      onTap: onTap,
    );
  }
}
