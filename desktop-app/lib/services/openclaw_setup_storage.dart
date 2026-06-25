import 'package:shared_preferences/shared_preferences.dart';

class OpenClawSetupStorage {
  static const _setupDoneKey = 'lume_local_openclaw_setup_done';

  Future<bool> isSetupDone() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_setupDoneKey) ?? false;
  }

  Future<void> markSetupDone() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_setupDoneKey, true);
  }

  Future<void> clearSetupDone() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_setupDoneKey);
  }
}
