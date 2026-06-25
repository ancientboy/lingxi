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

    test('desktopStorageEntries for local', () {
      final service = ConnectionModeService();
      final entries = service.desktopStorageEntries(
        effective: EffectiveConnection.local,
        userId: 'user-1',
      );
      expect(entries['lume_desktop_connection_mode'], 'local');
      expect(entries['lume_desktop_ws_url'], contains('18790'));
      expect(entries['lume_desktop_user_id'], 'user-1');
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
