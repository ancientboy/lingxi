import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:window_manager/window_manager.dart';

import '../app_commands.dart';
import '../models/connection_mode.dart';
import '../models/lume_model.dart';
import '../models/lume_session.dart';
import '../services/auth_storage.dart';
import '../services/connection_mode_service.dart';
import '../services/deep_link_service.dart';
import '../services/local_openclaw_service.dart';
import '../services/openclaw_bootstrap_service.dart';
import '../services/openclaw_setup_storage.dart';
import '../services/session_service.dart';
import '../services/subscription_service.dart';
import '../services/team_service.dart';
import '../services/workspace_state_service.dart';
import '../widgets/about_lume_dialog.dart';
import '../widgets/chat_composer.dart';
import '../widgets/session_sidebar.dart';
import '../widgets/openclaw_setup_wizard.dart';
import '../widgets/settings_sheet.dart';
import '../widgets/web_chat_view.dart';
import '../widgets/workspace_panel.dart';

/// Native three-column shell: sessions | chat | workspace (Cursor / Web layout).
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
  final _teamService = TeamService();
  final _workspaceState = WorkspaceStateService();
  final _bootstrapService = OpenClawBootstrapService();
  final _setupStorage = OpenClawSetupStorage();
  final _subscriptionService = SubscriptionService();
  final _connectionService = ConnectionModeService();
  final _localProbe = LocalOpenClawService();
  final _chatKey = GlobalKey<WebChatViewState>();

  String? _lumeSecret;

  List<LumeSession> _sessions = [];
  bool _loadingSessions = true;
  String? _sessionError;
  String? _selectedKey;
  bool _chatReady = false;
  LumeModelState? _modelState;
  TeamState? _teamState;
  bool _workspaceCollapsed = false;
  String? _activeTool;

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
    _teamState = _teamService.fromSession(widget.session);
    _loadWorkspaceCollapsed();
    _bootstrapSessions();
    WidgetsBinding.instance.addPostFrameCallback((_) => _prepareDesktopOpenClaw());
  }

  Future<void> _prepareDesktopOpenClaw() async {
    try {
      final bootstrap = await _bootstrapService.fetch(widget.session.token);
      if (!mounted) return;

      setState(() => _lumeSecret = bootstrap.lumeSecret);
      await _connectionService.ensureDefaultMode(bootstrap.defaultConnectionMode);

      final local = await _localProbe.probeLocal();
      final setupDone = await _setupStorage.isSetupDone();

      if (local.lumePluginOpen) {
        if (!setupDone) await _setupStorage.markSetupDone();
        await _refreshConnectionAfterBootstrap();
        return;
      }

      if (setupDone) {
        await _refreshConnectionAfterBootstrap();
        return;
      }

      // 老用户已有云端：默认云端，不强制本机向导
      if (bootstrap.cloudServerRunning && !bootstrap.recommendLocalFirst) {
        await _refreshConnectionAfterBootstrap();
        return;
      }

      if (!mounted) return;
      final ok = await showOpenClawSetupWizard(
        context,
        token: widget.session.token,
        bootstrap: bootstrap,
        allowSkip: bootstrap.cloudServerRunning,
      );

      if (ok && mounted) {
        await _connectionService.saveMode(ConnectionMode.auto);
        await _refreshConnectionAfterBootstrap();
      }
    } catch (_) {
      await _fallbackToCloudIfAvailable();
    }
  }

  /// 云端老用户：bootstrap 不可用时仍尝试云端连接
  Future<void> _fallbackToCloudIfAvailable() async {
    final info = await _subscriptionService.fetchStatus(widget.session.token);
    final hasCloud =
        info != null && (info.hasServer || info.serverOnline || info.plan != 'free');

    if (hasCloud) {
      await _connectionService.saveMode(ConnectionMode.cloud);
    }

    await _refreshConnectionAfterBootstrap();
    if (mounted) setState(() {});
  }

  Future<void> _refreshConnectionAfterBootstrap() async {
    await _chatKey.currentState?.refreshConnectionAndReload();
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    AppCommands.onRefresh = null;
    AppCommands.onShowAbout = null;
    AppCommands.onNewChat = null;
    AppCommands.onOpenSettings = null;
    super.dispose();
  }

  Future<void> _loadWorkspaceCollapsed() async {
    final collapsed = await _workspaceState.readCollapsed();
    if (mounted) setState(() => _workspaceCollapsed = collapsed);
  }

  Future<void> _toggleWorkspaceCollapsed() async {
    final next = !_workspaceCollapsed;
    setState(() => _workspaceCollapsed = next);
    await _workspaceState.saveCollapsed(next);
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

  Future<void> _refreshTeam() async {
    final state = await _chatKey.currentState?.getTeamState();
    if (state != null && mounted) {
      setState(() => _teamState = state);
    }
  }

  Future<void> _refreshModels() async {
    final state = await _chatKey.currentState?.getModelState();
    if (state != null && mounted) setState(() => _modelState = state);
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
    _refreshTeam();
  }

  Future<void> _onSelectSession(LumeSession item) async {
    setState(() {
      _selectedKey = item.key;
      _activeTool = 'chat';
    });
    _syncWindowTitle();
    await _chatKey.currentState?.switchToSession(item.key);
    await _chatKey.currentState?.switchView('chat');
    await _refreshTeam();
  }

  Future<void> _onNewChat() async {
    await _chatKey.currentState?.createNewSession();
    setState(() {
      _selectedKey = null;
      _activeTool = 'chat';
    });
    windowManager.setTitle('新对话');
    await _chatKey.currentState?.switchView('chat');
    await Future.delayed(const Duration(milliseconds: 400));
    _loadSessions();
    _refreshTeam();
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
    setState(() => _activeTool = 'chat');
    await Future.delayed(const Duration(milliseconds: 500));
    _loadSessions();
  }

  Future<void> _onSwitchAgent(String agentId) async {
    await _chatKey.currentState?.switchAgent(agentId);
    setState(() => _activeTool = 'chat');
    await _chatKey.currentState?.switchView('chat');
    await Future.delayed(const Duration(milliseconds: 600));
    await _refreshTeam();
    _loadSessions();
  }

  Future<void> _onQuickSend(String text) async {
    setState(() => _activeTool = 'chat');
    await _chatKey.currentState?.switchView('chat');
    await _chatKey.currentState?.sendQuickMessage(text);
    await Future.delayed(const Duration(milliseconds: 500));
    _loadSessions();
  }

  Future<void> _openToolView(String view) async {
    setState(() => _activeTool = view);
    await _chatKey.currentState?.switchView(view);
  }

  void _openSettings() {
    final chat = _chatKey.currentState;
    showLumeSettingsSheet(
      context,
      session: widget.session,
      token: widget.session.token,
      onLogout: () => _confirmLogout(),
      initialMode: chat?.connectionPreference,
      effectiveConnection: chat?.effectiveConnection,
      localStatus: chat?.localStatus,
      onConnectionModeChanged: (mode) async {
        await chat?.refreshConnectionAndReload();
        if (mounted) setState(() {});
      },
      onInstallOpenClaw: () => _openOpenClawWizard(),
    );
  }

  Future<void> _openOpenClawWizard() async {
    try {
      final bootstrap = await _bootstrapService.fetch(widget.session.token);
      if (!mounted) return;
      setState(() => _lumeSecret = bootstrap.lumeSecret);
      await showOpenClawSetupWizard(
        context,
        token: widget.session.token,
        bootstrap: bootstrap,
        allowSkip: true,
      );
      await _connectionService.saveMode(ConnectionMode.local);
      await _chatKey.currentState?.refreshConnectionAndReload();
      if (mounted) setState(() {});
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('无法打开安装向导: $e'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
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
    _refreshTeam();
  }

  Future<void> _handleDeepLink(DeepLinkAction action) async {
    if (!_chatReady) {
      await Future.delayed(const Duration(milliseconds: 800));
    }
    switch (action.kind) {
      case DeepLinkKind.session:
        if (action.sessionKey != null) {
          setState(() {
            _selectedKey = action.sessionKey;
            _activeTool = 'chat';
          });
          await _chatKey.currentState?.switchToSession(action.sessionKey!);
          await _chatKey.currentState?.switchView('chat');
          _syncWindowTitle();
        }
        break;
      case DeepLinkKind.view:
        if (action.view != null) {
          await _openToolView(action.view!);
        }
        break;
      case DeepLinkKind.chat:
        setState(() => _activeTool = 'chat');
        await _chatKey.currentState?.switchView('chat');
        break;
    }
    await windowManager.focus();
  }

  @override
  Widget build(BuildContext context) {
    final team = _teamState ?? _teamService.fromSession(widget.session);

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
                          lumeSecret: _lumeSecret,
                          onReady: _onChatReady,
                        ),
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
                WorkspacePanel(
                  teamState: team,
                  collapsed: _workspaceCollapsed,
                  activeTool: _activeTool,
                  onToggleCollapse: _toggleWorkspaceCollapsed,
                  onSwitchAgent: _onSwitchAgent,
                  onQuickSend: _onQuickSend,
                  onOpenView: _openToolView,
                  onOpenFiles: () => _chatKey.currentState?.openFiles(),
                  onOpenNotifications: () =>
                      _chatKey.currentState?.toggleNotifications(),
                  onBackToChat: () => _openToolView('chat'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _selectModel(String id) async {
    await _chatKey.currentState?.selectModel(id);
    await _refreshModels();
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
