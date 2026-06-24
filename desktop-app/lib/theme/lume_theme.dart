import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Lume design tokens — aligned with frontend/assets/css/lume-tokens.css
class LumeColors {
  static const accent = Color(0xFF3D6B62);
  static const accentHover = Color(0xFF2F554D);
  static const bg = Color(0xFFFAFAF9);
  static const bgCard = Color(0xFFFFFFFF);
  static const bgHover = Color(0xFFF5F5F4);
  static const border = Color(0xFFE7E5E4);
  static const text1 = Color(0xFF0C0C0C);
  static const text2 = Color(0xFF525252);
  static const text3 = Color(0xFFA3A3A3);
  static const danger = Color(0xFFEF4444);
}

ThemeData buildLumeTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: LumeColors.accent,
      primary: LumeColors.accent,
      surface: LumeColors.bg,
      onSurface: LumeColors.text1,
    ),
    scaffoldBackgroundColor: LumeColors.bg,
  );

  return base.copyWith(
    textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
      bodyColor: LumeColors.text1,
      displayColor: LumeColors.text1,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: LumeColors.bgCard,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: LumeColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: LumeColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: LumeColors.accent, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: LumeColors.accent,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: GoogleFonts.dmSans(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: LumeColors.bgCard,
      foregroundColor: LumeColors.text1,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: GoogleFonts.dmSans(
        fontSize: 15,
        fontWeight: FontWeight.w600,
        color: LumeColors.text1,
      ),
    ),
  );
}
