import 'package:flutter_test/flutter_test.dart';
import 'package:lume_desktop/models/connection_mode.dart';
import 'package:lume_desktop/services/connection_mode_service.dart';
import 'package:lume_desktop/services/local_openclaw_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ConnectionMode', () {
    test('fromStorage maps values', () {
      expect(ConnectionModeLabels.fromStorage('local'), ConnectionMode.local);
      expect(ConnectionModeLabels.fromStorage('cloud'), ConnectionMode.cloud);
      expect(ConnectionModeLabels.fromStorage(null), ConnectionMode.auto);
    });
  });

  group('ConnectionModeService', () {
    test('save and read mode', () async {
      SharedPreferences.setMockInitialValues({});
      final service = ConnectionModeService();
      await service.saveMode(ConnectionMode.local);
      expect(await service.readMode(), ConnectionMode.local);
    });

    test('desktopStorageEntries prefers gateway when open', () {
      final service = ConnectionModeService();
      final status = LocalOpenClawStatus(
        lumePluginOpen: false,
        gatewayOpen: true,
        probedAt: DateTime.now(),
      );
      final entries = service.desktopStorageEntries(
        effective: EffectiveConnection.local,
        userId: 'user-1',
        gatewayToken: 'tok',
        sessionId: 'abc',
        localStatus: status,
      );
      expect(entries['lume_desktop_connection_mode'], 'local');
      expect(entries['lume_desktop_transport'], 'gateway');
      expect(entries['lume_desktop_gateway_ws_url'], contains('18789'));
      expect(entries['lume_desktop_openclaw_token'], 'tok');
    });

    test('desktopStorageEntries falls back to lume plugin', () {
      final service = ConnectionModeService();
      final status = LocalOpenClawStatus(
        lumePluginOpen: true,
        gatewayOpen: false,
        probedAt: DateTime.now(),
      );
      final entries = service.desktopStorageEntries(
        effective: EffectiveConnection.local,
        userId: 'user-1',
        localStatus: status,
      );
      expect(entries['lume_desktop_transport'], 'lume');
      expect(entries['lume_desktop_ws_url'], contains('18790'));
    });
  });

  group('LocalOpenClawService', () {
    test('probePort returns false for closed port', () async {
      final service = LocalOpenClawService();
      final open = await service.probePort('127.0.0.1', 59999);
      expect(open, isFalse);
    });
  });
}
