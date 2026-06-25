import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';
import '../models/connection_mode.dart';
import 'local_openclaw_service.dart';

class ConnectionModeService {
  static const _modeKey = 'lume_desktop_connection_mode';

  final LocalOpenClawService _probe = LocalOpenClawService();

  Future<ConnectionMode> readMode() async {
    final prefs = await SharedPreferences.getInstance();
    return ConnectionModeLabels.fromStorage(prefs.getString(_modeKey));
  }

  Future<void> saveMode(ConnectionMode mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_modeKey, mode.storageValue);
  }

  /// 首次启动按云端策略写入默认连接模式（未手动设置时）。
  Future<void> ensureDefaultMode(String defaultFromApi) async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.containsKey(_modeKey)) return;
    await saveMode(ConnectionModeLabels.fromStorage(defaultFromApi));
  }

  /// Resolve user preference + local probe into an effective target.
  Future<({ConnectionMode preference, EffectiveConnection effective, LocalOpenClawStatus status})>
      resolve() async {
    final preference = await readMode();
    final status = await _probe.probeLocal();

    switch (preference) {
      case ConnectionMode.local:
        return (
          preference: preference,
          effective: EffectiveConnection.local,
          status: status,
        );
      case ConnectionMode.cloud:
        return (
          preference: preference,
          effective: EffectiveConnection.cloud,
          status: status,
        );
      case ConnectionMode.auto:
        final effective = status.gatewayOpen || status.lumePluginOpen
            ? EffectiveConnection.local
            : EffectiveConnection.cloud;
        return (
          preference: preference,
          effective: effective,
          status: status,
        );
    }
  }

  Map<String, String> desktopStorageEntries({
    required EffectiveConnection effective,
    required String userId,
    String? lumeSecret,
    String? gatewayToken,
    String? sessionId,
    LocalOpenClawStatus? localStatus,
  }) {
    final secret = lumeSecret ?? AppConfig.lumeWsSecret;
    final status = localStatus;
    final gatewayReady = status?.gatewayOpen ?? false;
    final lumeReady = status?.lumePluginOpen ?? false;

    if (effective == EffectiveConnection.local && gatewayReady) {
      final sid = sessionId ?? '';
      final token = gatewayToken ?? '';
      return {
        AppConfig.desktopConnectionModeKey: 'local',
        AppConfig.desktopTransportKey: 'gateway',
        AppConfig.desktopGatewayWsUrlKey: AppConfig.localGatewayWsUrl(sid),
        AppConfig.desktopOpenclawTokenKey: token,
        AppConfig.desktopWsUrlKey: '',
        AppConfig.desktopLumeSecretKey: secret,
        AppConfig.desktopUserIdKey: userId,
      };
    }

    if (effective == EffectiveConnection.local && lumeReady) {
      return {
        AppConfig.desktopConnectionModeKey: 'local',
        AppConfig.desktopTransportKey: 'lume',
        AppConfig.desktopWsUrlKey: AppConfig.localLumeWsUrl,
        AppConfig.desktopLumeSecretKey: secret,
        AppConfig.desktopUserIdKey: userId,
        AppConfig.desktopGatewayWsUrlKey: '',
        AppConfig.desktopOpenclawTokenKey: '',
      };
    }

    return {
      AppConfig.desktopConnectionModeKey: 'cloud',
      AppConfig.desktopTransportKey: 'gateway',
      AppConfig.desktopWsUrlKey: '',
      AppConfig.desktopLumeSecretKey: secret,
      AppConfig.desktopUserIdKey: userId,
      AppConfig.desktopGatewayWsUrlKey: '',
      AppConfig.desktopOpenclawTokenKey: '',
    };
  }
}
