import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Cursor IDE–inspired tokens for macOS desktop shell.
class LumeColors {
  /// Unified shell background — sidebar / chat / composer share this.
  static const bg = Color(0xFFFFFFFF);

  /// Subtle fill for inputs, chips, hover (not a separate panel color).
  static const fill = Color(0xFFF5F5F5);
  static const fillHover = Color(0xFFEBEBEB);

  /// Hairline separators — barely visible, not hard dividers.
  static const hairline = Color(0x0D000000);

  /// Primary actions (new chat, send) — ink, not brand green.
  static const accent = Color(0xFF26251E);
  static const accentHover = Color(0xFF1A1A1A);

  /// Logo mark only.
  static const brandMark = Color(0xFF3D6B62);

  /// Focus ring / links.
  static const focus = Color(0xFF0066B8);

  static const text1 = Color(0xFF26251E);
  static const text2 = Color(0xFF616161);
  static const text3 = Color(0xFF8C8C8C);
  static const danger = Color(0xFFE51400);

  // Legacy aliases used across widgets.
  static const bgCard = bg;
  static const bgHover = fill;
  static const border = hairline;
}

bool _useSystemUIFont() => !kIsWeb && Platform.isMacOS;

TextTheme _buildTextTheme() {
  if (_useSystemUIFont()) {
    return Typography.material2021(platform: TargetPlatform.macOS)
        .black
        .apply(
          bodyColor: LumeColors.text1,
          displayColor: LumeColors.text1,
        );
  }
  return GoogleFonts.interTextTheme().apply(
    bodyColor: LumeColors.text1,
    displayColor: LumeColors.text1,
  );
}

/// Shared filled field — no heavy outline; blends into shell.
InputDecoration lumeFilledDecoration({
  String? hintText,
  TextStyle? hintStyle,
  Widget? prefixIcon,
  EdgeInsetsGeometry? contentPadding,
  double radius = 10,
}) {
  final border = OutlineInputBorder(
    borderRadius: BorderRadius.circular(radius),
    borderSide: BorderSide.none,
  );
  return InputDecoration(
    hintText: hintText,
    hintStyle: hintStyle ??
        const TextStyle(color: LumeColors.text3, fontSize: 13),
    prefixIcon: prefixIcon,
    isDense: true,
    filled: true,
    fillColor: LumeColors.fill,
    contentPadding: contentPadding ??
        const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    border: border,
    enabledBorder: border,
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(radius),
      borderSide: BorderSide(color: LumeColors.focus.withValues(alpha: 0.45)),
    ),
  );
}

ThemeData buildLumeTheme() {
  final textTheme = _buildTextTheme();
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: ColorScheme.light(
      primary: LumeColors.accent,
      onPrimary: Colors.white,
      surface: LumeColors.bg,
      onSurface: LumeColors.text1,
      outline: LumeColors.hairline,
    ),
    scaffoldBackgroundColor: LumeColors.bg,
    dividerColor: LumeColors.hairline,
    splashColor: LumeColors.fillHover.withValues(alpha: 0.5),
    highlightColor: LumeColors.fill.withValues(alpha: 0.5),
  );

  return base.copyWith(
    textTheme: textTheme,
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: LumeColors.fill,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(
          color: LumeColors.focus.withValues(alpha: 0.45),
        ),
      ),
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: LumeColors.accent,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: textTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w600,
          fontSize: 13,
        ),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: LumeColors.accent,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: textTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w600,
          fontSize: 15,
        ),
      ),
    ),
    listTileTheme: const ListTileThemeData(
      iconColor: LumeColors.text2,
      textColor: LumeColors.text1,
    ),
    iconTheme: const IconThemeData(color: LumeColors.text2, size: 20),
    appBarTheme: AppBarTheme(
      backgroundColor: LumeColors.bg,
      foregroundColor: LumeColors.text1,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: textTheme.titleMedium?.copyWith(
        fontWeight: FontWeight.w600,
        fontSize: 15,
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: LumeColors.hairline,
      thickness: 1,
      space: 1,
    ),
  );
}
