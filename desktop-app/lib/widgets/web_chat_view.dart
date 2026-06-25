import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import '../config/app_config.dart';
import '../models/connection_mode.dart';
import '../models/lume_model.dart';
import '../services/auth_storage.dart';
import '../services/connection_mode_service.dart';
import '../services/local_openclaw_service.dart';
import '../services/notification_service.dart';
import '../services/team_service.dart';
import '../theme/lume_theme.dart';

/// WKWebView chat surface — auth injection + JS bridge.
class WebChatView extends StatefulWidget {
  const WebChatView({
    super.key,
    required this.session,
    this.lumeSecret,
    this.localGatewayToken,
    this.localSessionId,
    this.onReady,
    this.onBridgeMessage,
  });

  final AuthSession session;
  final String? lumeSecret;
  final String? localGatewayToken;
  final String? localSessionId;
  final VoidCallback? onReady;
  final void Function(String raw)? onBridgeMessage;

  @override
  State<WebChatView> createState() => WebChatViewState();
}

class WebChatViewState extends State<WebChatView> {
  late final WebViewController _controller;
  final _connectionMode = ConnectionModeService();
  bool _authInjected = false;
  int _loadGeneration = 0;
  ConnectionMode _connectionPreference = ConnectionMode.auto;
  EffectiveConnection _effectiveConnection = EffectiveConnection.cloud;
  LocalOpenClawStatus? _localStatus;

  WebViewController get controller => _controller;
  ConnectionMode get connectionPreference => _connectionPreference;
  EffectiveConnection get effectiveConnection => _effectiveConnection;
  LocalOpenClawStatus? get localStatus => _localStatus;

  @override
  void initState() {
    super.initState();
    _controller = _buildController();
    _controller.loadRequest(Uri.parse(AppConfig.chatUrl));
  }

  WebViewController _buildController() {
    late final PlatformWebViewControllerCreationParams params;
    if (WebViewPlatform.instance is WebKitWebViewPlatform) {
      params = WebKitWebViewControllerCreationParams(
        allowsInlineMediaPlayback: true,
      );
    } else {
      params = const PlatformWebViewControllerCreationParams();
    }

    final controller = WebViewController.fromPlatformCreationParams(params)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(LumeColors.bg)
      ..addJavaScriptChannel(
        'LumeDesktop',
        onMessageReceived: (msg) {
          NotificationService.instance.handleBridgeMessage(msg.message);
          widget.onBridgeMessage?.call(msg.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(onPageFinished: _onPageFinished),
      );

    return controller;
  }

  Future<void> _onPageFinished(String url) async {
    if (!url.startsWith(AppConfig.apiOrigin)) return;

    final gen = ++_loadGeneration;
    await _injectSession();
    if (!mounted || gen != _loadGeneration) return;

    if (!_authInjected) {
      _authInjected = true;
      await _controller.loadRequest(Uri.parse(AppConfig.chatUrl));
      return;
    }

    await _controller.runJavaScript(
      'typeof initRightSidebar === "function" && initRightSidebar();',
    );
    await _controller.runJavaScript(
      'typeof setRightSidebarCollapsed === "function" && setRightSidebarCollapsed(true);',
    );

    widget.onReady?.call();
  }

  Future<void> _injectSession() async {
    await _resolveConnection();
    final tokenJs = jsonEncode(widget.session.token);
    final userJs = jsonEncode(widget.session.user);
    final tokenKey = AppConfig.tokenKey;
    final userKey = AppConfig.userKey;
    final userId = widget.session.userId ?? '';
    final desktopEntries = _connectionMode.desktopStorageEntries(
      effective: _effectiveConnection,
      userId: userId,
      lumeSecret: widget.lumeSecret,
      gatewayToken: widget.localGatewayToken,
      sessionId: widget.localSessionId,
      localStatus: _localStatus,
    );
    final desktopJs = desktopEntries.entries
        .map((e) =>
            'localStorage.setItem(${jsonEncode(e.key)}, ${jsonEncode(e.value)});')
        .join('\n');

    await _controller.runJavaScript('''
      (function() {
        try {
          localStorage.setItem('$tokenKey', $tokenJs);
          localStorage.setItem('$userKey', $userJs);
          $desktopJs
          document.documentElement.classList.add('lume-desktop');
        } catch (e) {
          console.error('Lume desktop auth inject failed', e);
        }
      })();
    ''');
  }

  void reloadChat() {
    _authInjected = false;
    _controller.loadRequest(Uri.parse(AppConfig.chatUrl));
  }

  Future<void> _resolveConnection() async {
    final resolved = await _connectionMode.resolve();
    _connectionPreference = resolved.preference;
    _effectiveConnection = resolved.effective;
    _localStatus = resolved.status;
  }

  Future<void> refreshConnectionAndReload() async {
    await _resolveConnection();
    reloadChat();
  }

  Future<void> switchToSession(String sessionKey) async {
    final keyJs = jsonEncode(sessionKey);
    await _controller.runJavaScript(
      'typeof switchSession === "function" && switchSession($keyJs, true);',
    );
  }

  Future<void> createNewSession() async {
    await _controller.runJavaScript(
      'typeof createNewSession === "function" && createNewSession();',
    );
  }

  Future<bool> sendUserMessage(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return false;
    final textJs = jsonEncode(trimmed);
    final result = await _controller.runJavaScriptReturningResult(
      'typeof lumeDesktopSend === "function" ? lumeDesktopSend($textJs) : false',
    );
    return result == true;
  }

  Future<LumeModelState?> getModelState() async {
    final result = await _controller.runJavaScriptReturningResult(
      'typeof lumeDesktopGetModelState === "function" ? lumeDesktopGetModelState() : null',
    );
    final raw = result.toString();
    if (raw == 'null' || raw.isEmpty) return null;
    try {
      final map = jsonDecode(result.toString()) as Map<String, dynamic>;
      return LumeModelState.fromJson(map);
    } catch (_) {
      return null;
    }
  }

  Future<void> selectModel(String modelId) async {
    final idJs = jsonEncode(modelId);
    await _controller.runJavaScript(
      'typeof lumeDesktopSelectModel === "function" && lumeDesktopSelectModel($idJs);',
    );
  }

  Future<void> switchView(String view) async {
    final viewJs = jsonEncode(view);
    await _controller.runJavaScript(
      'typeof lumeDesktopSwitchView === "function" && lumeDesktopSwitchView($viewJs);',
    );
  }

  Future<void> toggleRightRail() async {
    await _controller.runJavaScript(
      'typeof lumeDesktopToggleRightRail === "function" && lumeDesktopToggleRightRail();',
    );
  }

  Future<TeamState?> getTeamState() async {
    final result = await _controller.runJavaScriptReturningResult(
      'typeof lumeDesktopGetTeamState === "function" ? lumeDesktopGetTeamState() : null',
    );
    final raw = result.toString();
    if (raw == 'null' || raw.isEmpty) return null;
    return TeamService().fromBridgeJson(raw);
  }

  Future<void> switchAgent(String agentId) async {
    final idJs = jsonEncode(agentId);
    await _controller.runJavaScript(
      'typeof lumeDesktopSwitchAgent === "function" && lumeDesktopSwitchAgent($idJs);',
    );
  }

  Future<void> sendQuickMessage(String text) async {
    final textJs = jsonEncode(text);
    await _controller.runJavaScript(
      'typeof lumeDesktopSendQuick === "function" && lumeDesktopSendQuick($textJs);',
    );
  }

  Future<void> openFiles() async {
    await _controller.runJavaScript(
      'typeof lumeDesktopOpenFiles === "function" && lumeDesktopOpenFiles();',
    );
  }

  Future<void> toggleNotifications() async {
    await _controller.runJavaScript(
      'typeof lumeDesktopToggleNotifications === "function" && lumeDesktopToggleNotifications();',
    );
  }

  @override
  Widget build(BuildContext context) {
    return WebViewWidget(controller: _controller);
  }
}
