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
        final effective =
            status.lumePluginOpen ? EffectiveConnection.local : EffectiveConnection.cloud;
        return (
          preference: preference,
          effective: effective,
          status: status,
        );
    }
  }

  String wsUrlFor(EffectiveConnection effective) {
    switch (effective) {
      case EffectiveConnection.local:
        return AppConfig.localLumeWsUrl;
      case EffectiveConnection.cloud:
        return '';
    }
  }

  Map<String, String> desktopStorageEntries({
    required EffectiveConnection effective,
    required String userId,
  }) {
    return {
      AppConfig.desktopConnectionModeKey:
          effective == EffectiveConnection.local ? 'local' : 'cloud',
      AppConfig.desktopWsUrlKey: wsUrlFor(effective),
      AppConfig.desktopLumeSecretKey: AppConfig.lumeWsSecret,
      AppConfig.desktopUserIdKey: userId,
    };
  }
}
