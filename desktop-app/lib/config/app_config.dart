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

  static const String tokenKey = 'lingxi_token';
  static const String userKey = 'lingxi_user';
}
