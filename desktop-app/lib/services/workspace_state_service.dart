import 'package:shared_preferences/shared_preferences.dart';

class WorkspaceStateService {
  static const _collapsedKey = 'lume_workspace_panel_collapsed';

  Future<bool> readCollapsed() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_collapsedKey) ?? false;
  }

  Future<void> saveCollapsed(bool collapsed) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_collapsedKey, collapsed);
  }
}
