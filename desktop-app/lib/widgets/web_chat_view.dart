import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import '../config/app_config.dart';
import '../services/auth_storage.dart';
import '../theme/lume_theme.dart';

/// WKWebView chat surface — auth injection + JS bridge helpers.
class WebChatView extends StatefulWidget {
  const WebChatView({
    super.key,
    required this.session,
    this.onReady,
  });

  final AuthSession session;
  final VoidCallback? onReady;

  @override
  State<WebChatView> createState() => WebChatViewState();
}

class WebChatViewState extends State<WebChatView> {
  late final WebViewController _controller;
  bool _authInjected = false;
  int _loadGeneration = 0;

  WebViewController get controller => _controller;

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

    return WebViewController.fromPlatformCreationParams(params)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(LumeColors.bg)
      ..setNavigationDelegate(
        NavigationDelegate(onPageFinished: _onPageFinished),
      );
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

    widget.onReady?.call();
  }

  Future<void> _injectSession() async {
    final tokenJs = jsonEncode(widget.session.token);
    final userJs = jsonEncode(widget.session.user);
    final tokenKey = AppConfig.tokenKey;
    final userKey = AppConfig.userKey;

    await _controller.runJavaScript('''
      (function() {
        try {
          localStorage.setItem('$tokenKey', $tokenJs);
          localStorage.setItem('$userKey', $userJs);
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

  @override
  Widget build(BuildContext context) {
    return WebViewWidget(controller: _controller);
  }
}
