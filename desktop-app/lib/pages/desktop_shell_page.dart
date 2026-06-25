import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_commands.dart';
import '../models/lume_session.dart';
import '../services/auth_storage.dart';
import '../services/session_service.dart';
import '../widgets/about_lume_dialog.dart';
import '../widgets/lume_mark.dart';
import '../widgets/session_sidebar.dart';
import '../widgets/web_chat_view.dart';

/// Native shell: session sidebar + WebView chat (P3 slice).
class DesktopShellPage extends StatefulWidget {
  const DesktopShellPage({
    super.key,
    required this.session,
    required this.onLogout,
  });

  final AuthSession session;
  final VoidCallback onLogout;

  @override
  State<DesktopShellPage> createState() => _DesktopShellPageState();
}

class _DesktopShellPageState extends State<DesktopShellPage> {
  final _sessionService = SessionService();
  final _chatKey = GlobalKey<WebChatViewState>();

  List<LumeSession> _sessions = [];
  bool _loadingSessions = true;
  String? _sessionError;
  String? _selectedKey;

  @override
  void initState() {
    super.initState();
    AppCommands.onRefresh = _refreshAll;
    AppCommands.onShowAbout = () {
      if (mounted) showLumeAboutDialog(context);
    };
    _loadSessions();
  }

  @override
  void dispose() {
    AppCommands.onRefresh = null;
    AppCommands.onShowAbout = null;
    super.dispose();
  }

  Future<void> _loadSessions() async {
    setState(() {
      _loadingSessions = true;
      _sessionError = null;
    });
    try {
      final list = await _sessionService.fetchSessions(widget.session.token);
      if (!mounted) return;
      setState(() {
        _sessions = list;
        _loadingSessions = false;
        _selectedKey ??= list.isNotEmpty ? list.first.key : null;
      });
    } on SessionException catch (e) {
      if (!mounted) return;
      setState(() {
        _sessionError = e.message;
        _loadingSessions = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sessionError = '加载会话失败';
        _loadingSessions = false;
      });
    }
  }

  void _refreshAll() {
    _chatKey.currentState?.reloadChat();
    _loadSessions();
  }

  Future<void> _onSelectSession(LumeSession item) async {
    setState(() => _selectedKey = item.key);
    await _chatKey.currentState?.switchToSession(item.key);
  }

  Future<void> _onNewChat() async {
    await _chatKey.currentState?.createNewSession();
    await Future.delayed(const Duration(milliseconds: 400));
    _loadSessions();
  }

  Future<void> _confirmLogout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('退出登录'),
        content: const Text('确定要退出当前账号吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('退出'),
          ),
        ],
      ),
    );
    if (ok == true) widget.onLogout();
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.session.displayName ?? 'Lume';

    return Shortcuts(
      shortcuts: {
        LogicalKeySet(LogicalKeyboardKey.meta, LogicalKeyboardKey.keyR):
            const RefreshIntent(),
      },
      child: Actions(
        actions: {
          RefreshIntent: CallbackAction<RefreshIntent>(
            onInvoke: (_) {
              _refreshAll();
              return null;
            },
          ),
        },
        child: Focus(
          autofocus: true,
          child: Scaffold(
            appBar: AppBar(
              title: Row(
                children: [
                  const LumeMark(size: 22),
                  const SizedBox(width: 10),
                  Text(name),
                ],
              ),
              actions: [
                IconButton(
                  tooltip: '刷新 (⌘R)',
                  icon: const Icon(Icons.refresh_rounded),
                  onPressed: _refreshAll,
                ),
                IconButton(
                  tooltip: '退出',
                  icon: const Icon(Icons.logout_rounded),
                  onPressed: _confirmLogout,
                ),
              ],
            ),
            body: Row(
              children: [
                SessionSidebar(
                  sessions: _sessions,
                  loading: _loadingSessions,
                  error: _sessionError,
                  selectedKey: _selectedKey,
                  onNewChat: _onNewChat,
                  onSelect: _onSelectSession,
                  onRefresh: _loadSessions,
                ),
                Expanded(
                  child: WebChatView(
                    key: _chatKey,
                    session: widget.session,
                    onReady: _loadSessions,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class RefreshIntent extends Intent {
  const RefreshIntent();
}
