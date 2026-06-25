/// Bootstrap payload from `GET /api/desktop/openclaw-bootstrap`.
class OpenClawBootstrap {
  OpenClawBootstrap({
    required this.userId,
    required this.openclawVersion,
    required this.gatewayPort,
    required this.lumePluginPort,
    required this.gatewayToken,
    required this.sessionId,
    required this.lumeSecret,
    required this.env,
    required this.authProfiles,
    required this.hasCloudServer,
    required this.cloudServerRunning,
    required this.recommendLocalFirst,
    required this.defaultConnectionMode,
    required this.needsLocalSetup,
  });

  final String userId;
  final String openclawVersion;
  final int gatewayPort;
  final int lumePluginPort;
  final String gatewayToken;
  final String sessionId;
  final String lumeSecret;
  final Map<String, String> env;
  final Map<String, dynamic> authProfiles;
  final bool hasCloudServer;
  final bool cloudServerRunning;
  final bool recommendLocalFirst;
  final String defaultConnectionMode;
  final bool needsLocalSetup;

  factory OpenClawBootstrap.fromJson(Map<String, dynamic> json) {
    final envRaw = json['env'] as Map<String, dynamic>? ?? {};
    return OpenClawBootstrap(
      userId: json['userId']?.toString() ?? '',
      openclawVersion: json['openclawVersion']?.toString() ?? '2026.6.9',
      gatewayPort: json['gatewayPort'] as int? ?? 18789,
      lumePluginPort: json['lumePluginPort'] as int? ?? 18790,
      gatewayToken: json['gatewayToken']?.toString() ?? '',
      sessionId: json['sessionId']?.toString() ?? '',
      lumeSecret: json['lumeSecret']?.toString() ?? 'lume-secret-2026',
      env: envRaw.map((k, v) => MapEntry(k, v?.toString() ?? '')),
      authProfiles: json['authProfiles'] as Map<String, dynamic>? ?? {},
      hasCloudServer: json['hasCloudServer'] == true,
      cloudServerRunning: json['cloudServerRunning'] == true,
      recommendLocalFirst: json['recommendLocalFirst'] == true,
      defaultConnectionMode: json['defaultConnectionMode']?.toString() ?? 'auto',
      needsLocalSetup: json['needsLocalSetup'] == true,
    );
  }
}
