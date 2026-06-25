import 'dart:async';

import 'package:app_links/app_links.dart';

/// Handles lume:// deep links (chat, session, workspace).
class DeepLinkService {
  DeepLinkService() : _appLinks = AppLinks();

  final AppLinks _appLinks;
  final _pending = <DeepLinkAction>[];
  void Function(DeepLinkAction)? _handler;
  StreamSubscription<Uri>? _sub;

  void setHandler(void Function(DeepLinkAction) handler) {
    _handler = handler;
    while (_pending.isNotEmpty) {
      handler(_pending.removeAt(0));
    }
  }

  Future<void> init() async {
    try {
      final initial = await _appLinks.getInitialLink();
      if (initial != null) _dispatch(initial);
    } catch (_) {}

    _sub = _appLinks.uriLinkStream.listen(
      _dispatch,
      onError: (_) {},
    );
  }

  void _dispatch(Uri uri) {
    final action = DeepLinkAction.fromUri(uri);
    if (action == null) return;
    if (_handler != null) {
      _handler!(action);
    } else {
      _pending.add(action);
    }
  }

  Future<void> dispose() async {
    await _sub?.cancel();
  }
}

class DeepLinkAction {
  const DeepLinkAction({
    required this.kind,
    this.sessionKey,
    this.view,
  });

  final DeepLinkKind kind;
  final String? sessionKey;
  final String? view;

  static DeepLinkAction? fromUri(Uri uri) {
    if (uri.scheme != 'lume') return null;

    final host = uri.host.toLowerCase();
    final path = uri.path.replaceAll(RegExp(r'^/'), '').toLowerCase();

    if (host == 'session' || path == 'session') {
      final key = uri.queryParameters['key'] ?? uri.queryParameters['session'];
      if (key != null && key.isNotEmpty) {
        return DeepLinkAction(kind: DeepLinkKind.session, sessionKey: key);
      }
    }

    if (host == 'workspace' || path == 'workspace') {
      return DeepLinkAction(kind: DeepLinkKind.view, view: 'workspace');
    }
    if (host == 'skills' || path == 'skills') {
      return DeepLinkAction(kind: DeepLinkKind.view, view: 'skills');
    }
    if (host == 'servers' || path == 'servers') {
      return DeepLinkAction(kind: DeepLinkKind.view, view: 'servers');
    }

    return const DeepLinkAction(kind: DeepLinkKind.chat);
  }
}

enum DeepLinkKind { chat, session, view }
