import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:window_manager/window_manager.dart';

import '../app_commands.dart';
import '../models/lume_model.dart';
import '../models/lume_session.dart';
import '../services/auth_storage.dart';
import '../services/deep_link_service.dart';
import '../services/session_service.dart';
import '../widgets/about_lume_dialog.dart';
import '../widgets/chat_composer.dart';
import '../widgets/desktop_tools_bar.dart';
import '../widgets/session_sidebar.dart';
import '../widgets/settings_sheet.dart';
import '../widgets/web_chat_view.dart';

/// Cursor / Web aligned shell: native sessions | chat center | web right rail.
class DesktopShellPage extends StatefulWidget {
  const DesktopShellPage({
    super.key,
    required this.session,
    required this.onLogout,
    required this.deepLinks,
  });

  final AuthSession session;
  final VoidCallback onLogout;
  final DeepLinkService deepLinks;

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
  bool _chatReady = false;
  LumeModelState? _modelState;

  @override
  void initState() {
    super.initState();
    AppCommands.onRefresh = _refreshAll;
    AppCommands.onShowAbout = () {
      if (mounted) showLumeAboutDialog(context);
    };
    AppCommands.onNewChat = _onNewChat;
    AppCommands.onOpenSettings = _openSettings;

    widget.deepLinks.setHandler(_handleDeepLink);
    _bootstrapSessions();
  }

  @override
  void dispose() {
    AppCommands.onRefresh = null;
    AppCommands.onShowAbout = null;
    AppCommands.onNewChat = null;
    AppCommands.onOpenSettings = null;
    super.dispose();
  }

  Future<void> _bootstrapSessions() async {
    final cached = await _sessionService.readCachedSessions();
    if (cached != null && cached.isNotEmpty) {
      setState(() {
        _sessions = cached;
        _loadingSessions = false;
        _selectedKey ??= cached.first.key;
      });
      _syncWindowTitle();
    }
    _loadSessions();
  }

  Future<void> _loadSessions() async {
    if (_sessions.isEmpty) {
      setState(() {
        _loadingSessions = true;
        _sessionError = null;
      });
    }
    try {
      final list = await _sessionService.fetchSessions(widget.session.token);
      if (!mounted) return;
      setState(() {
        _sessions = list;
        _loadingSessions = false;
        _selectedKey ??= list.isNotEmpty ? list.first.key : null;
      });
      _syncWindowTitle();
    } on SessionException catch (e) {
      if (!mounted) return;
      setState(() {
        _sessionError = e.message;
        _loadingSessions = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        if (_sessions.isEmpty) _sessionError = '加载会话失败';
        _loadingSessions = false;
      });
    }
  }

  Future<void> _refreshModels() async {
    final state = await _chatKey.currentState?.getModelState();
    if (state != null && mounted) setState(() => _modelState = state);
  }

  Future<void> _selectModel(String id) async {
    await _chatKey.currentState?.selectModel(id);
    await _refreshModels();
  }

  void _syncWindowTitle() {
    if (_selectedKey == null) {
      windowManager.setTitle('Lume');
      return;
    }
    final match = _sessions.where((s) => s.key == _selectedKey).toList();
    if (match.isEmpty) {
      windowManager.setTitle('Lume');
      return;
    }
    final title = match.first.title.trim();
    windowManager.setTitle(title.isEmpty ? 'Lume' : title);
  }

  void _refreshAll() {
    _chatKey.currentState?.reloadChat();
    _loadSessions();
  }

  Future<void> _onSelectSession(LumeSession item) async {
    setState(() => _selectedKey = item.key);
    _syncWindowTitle();
    await _chatKey.currentState?.switchToSession(item.key);
  }

  Future<void> _onNewChat() async {
    await _chatKey.currentState?.createNewSession();
    setState(() => _selectedKey = null);
    windowManager.setTitle('新对话');
    await Future.delayed(const Duration(milliseconds: 400));
    _loadSessions();
  }

  Future<void> _onSendMessage(String text) async {
    final ok = await _chatKey.currentState?.sendUserMessage(text) ?? false;
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('发送失败，请稍后重试'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    await Future.delayed(const Duration(milliseconds: 500));
    _loadSessions();
  }

  void _openSettings() {
    showLumeSettingsSheet(
      context,
      session: widget.session,
      token: widget.session.token,
      onLogout: () => _confirmLogout(),
    );
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

  void _onChatReady() {
    if (!_chatReady) {
      setState(() => _chatReady = true);
    }
    _loadSessions();
    _refreshModels();
  }

  Future<void> _handleDeepLink(DeepLinkAction action) async {
    if (!_chatReady) {
      await Future.delayed(const Duration(milliseconds: 800));
    }
    switch (action.kind) {
      case DeepLinkKind.session:
        if (action.sessionKey != null) {
          setState(() => _selectedKey = action.sessionKey);
          await _chatKey.currentState?.switchToSession(action.sessionKey!);
          _syncWindowTitle();
        }
        break;
      case DeepLinkKind.view:
        if (action.view != null) {
          await _chatKey.currentState?.switchView(action.view!);
        }
        break;
      case DeepLinkKind.chat:
        break;
    }
    await windowManager.focus();
  }

  @override
  Widget build(BuildContext context) {
    return Shortcuts(
      shortcuts: {
        LogicalKeySet(LogicalKeyboardKey.meta, LogicalKeyboardKey.keyR):
            const RefreshIntent(),
        LogicalKeySet(LogicalKeyboardKey.meta, LogicalKeyboardKey.keyN):
            const NewChatIntent(),
        LogicalKeySet(LogicalKeyboardKey.meta, LogicalKeyboardKey.comma):
            const OpenSettingsIntent(),
      },
      child: Actions(
        actions: {
          RefreshIntent: CallbackAction<RefreshIntent>(
            onInvoke: (_) {
              _refreshAll();
              return null;
            },
          ),
          NewChatIntent: CallbackAction<NewChatIntent>(
            onInvoke: (_) {
              _onNewChat();
              return null;
            },
          ),
          OpenSettingsIntent: CallbackAction<OpenSettingsIntent>(
            onInvoke: (_) {
              _openSettings();
              return null;
            },
          ),
        },
        child: Focus(
          autofocus: true,
          child: Scaffold(
            body: Row(
              children: [
                SessionSidebar(
                  session: widget.session,
                  sessions: _sessions,
                  loading: _loadingSessions,
                  error: _sessionError,
                  selectedKey: _selectedKey,
                  onNewChat: _onNewChat,
                  onSelect: _onSelectSession,
                  onRefresh: _loadSessions,
                  onOpenSettings: _openSettings,
                ),
                Expanded(
                  child: Column(
                    children: [
                      Expanded(
                        child: WebChatView(
                          key: _chatKey,
                          session: widget.session,
                          onReady: _onChatReady,
                        ),
                      ),
                      DesktopToolsBar(
                        onWorkspace: () =>
                            _chatKey.currentState?.switchView('workspace'),
                        onSkills: () =>
                            _chatKey.currentState?.switchView('skills'),
                        onServers: () =>
                            _chatKey.currentState?.switchView('servers'),
                        onToggleRail: () =>
                            _chatKey.currentState?.toggleRightRail(),
                      ),
                      ChatComposer(
                        enabled: _chatReady,
                        modelState: _modelState,
                        onRefreshModels: _refreshModels,
                        onSelectModel: _selectModel,
                        onSend: _onSendMessage,
                      ),
                    ],
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

class NewChatIntent extends Intent {
  const NewChatIntent();
}

class OpenSettingsIntent extends Intent {
  const OpenSettingsIntent();
}
