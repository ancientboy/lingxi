import 'dart:ui';

import 'package:shared_preferences/shared_preferences.dart';

/// Persists macOS window size between launches.
class WindowStateService {
  static const _widthKey = 'lume_window_width';
  static const _heightKey = 'lume_window_height';

  Future<Size?> readSize() async {
    final prefs = await SharedPreferences.getInstance();
    final w = prefs.getDouble(_widthKey);
    final h = prefs.getDouble(_heightKey);
    if (w == null || h == null || w < 900 || h < 620) return null;
    return Size(w, h);
  }

  Future<void> saveSize(Size size) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_widthKey, size.width);
    await prefs.setDouble(_heightKey, size.height);
  }
}
