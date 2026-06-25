/// API and Web endpoints for the Lume cloud service.
class AppConfig {
  static const String productionOrigin = 'https://lumeword.cn';

  /// Override: flutter run --dart-define=LUME_API_ORIGIN=http://localhost:3000
  static String get apiOrigin {
    const override = String.fromEnvironment('LUME_API_ORIGIN');
    if (override.isNotEmpty) return override.replaceAll(RegExp(r'/+$'), '');
    return productionOrigin;
  }

  static String get chatUrl => '$apiOrigin/chat.html?desktop=1';
  static String get sendCodeApi => '$apiOrigin/api/auth/send-code';
  static String get verifyCodeApi => '$apiOrigin/api/auth/verify-code';
  static String get loginApi => '$apiOrigin/api/auth/login';
  static String get verifyApi => '$apiOrigin/api/auth/verify';
  static String get meApi => '$apiOrigin/api/auth/me';
  static String get sessionsApi => '$apiOrigin/api/lume-ws/sessions';
  static String get openclawBootstrapApi => '$apiOrigin/api/desktop/openclaw-bootstrap';
  static String get openclawBootstrapCompleteApi =>
      '$apiOrigin/api/desktop/openclaw-bootstrap/complete';

  static const String openclawBundleVersion = '2026.6.9';

  static const String tokenKey = 'lingxi_token';
  static const String userKey = 'lingxi_user';

  /// Local OpenClaw / Lume plugin (see backend `lume-ws.js`).
  static const String localLumeHost = '127.0.0.1';
  static const int lumePluginPort = 18790;
  static const int gatewayPort = 18789;
  static const Duration localProbeTimeout = Duration(milliseconds: 2500);

  static String get localLumeWsUrl => 'ws://$localLumeHost:$lumePluginPort';

  /// Override: --dart-define=LUME_WS_SECRET=...
  static String get lumeWsSecret {
    const override = String.fromEnvironment('LUME_WS_SECRET');
    if (override.isNotEmpty) return override;
    return 'lume-secret-2026';
  }

  /// Injected into WebView `localStorage` for `lume-rpc.js`.
  static const String desktopConnectionModeKey = 'lume_desktop_connection_mode';
  static const String desktopWsUrlKey = 'lume_desktop_ws_url';
  static const String desktopLumeSecretKey = 'lume_desktop_lume_secret';
  static const String desktopUserIdKey = 'lume_desktop_user_id';
  static const String desktopTransportKey = 'lume_desktop_transport';
  static const String desktopGatewayWsUrlKey = 'lume_desktop_gateway_ws_url';
  static const String desktopOpenclawTokenKey = 'lume_desktop_openclaw_token';

  static String localGatewayWsUrl(String sessionId) {
    final path = sessionId.isNotEmpty ? '/$sessionId' : '';
    return 'ws://$localLumeHost:$gatewayPort$path/ws';
  }

  static const String openClawInstallUrl = 'https://openclaw.ai/install.sh';
}
