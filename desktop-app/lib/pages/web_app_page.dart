import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import '../config/app_config.dart';
import '../services/auth_storage.dart';
import '../theme/lume_theme.dart';
import '../widgets/lume_mark.dart';

/// WebView chat shell — lumeword.cn chat.html with native chrome.
class WebAppPage extends StatefulWidget {
  const WebAppPage({
    super.key,
    required this.session,
    required this.onLogout,
  });

  final AuthSession session;
  final VoidCallback onLogout;

  @override
  State<WebAppPage> createState() => _WebAppPageState();
}

class _WebAppPageState extends State<WebAppPage> {
  late final WebViewController _controller;
  bool _authInjected = false;
  int _loadGeneration = 0;

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
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: _onPageFinished,
        ),
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
    }
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

  void _refresh() {
    _authInjected = false;
    _controller.loadRequest(Uri.parse(AppConfig.chatUrl));
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.session.displayName ?? 'Lume';

    return Scaffold(
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
            tooltip: '刷新',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _refresh,
          ),
          IconButton(
            tooltip: '退出',
            icon: const Icon(Icons.logout_rounded),
            onPressed: _confirmLogout,
          ),
        ],
      ),
      body: WebViewWidget(controller: _controller),
    );
  }
}
