import 'package:flutter/material.dart';
import '../theme/lume_theme.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// C1-13 hive nest mark (partner peek).
class LumeMark extends StatelessWidget {
  const LumeMark({
    super.key,
    this.size = 40,
    this.badge = false,
    this.badgeColor,
  });

  final double size;
  /// 圆角米色底 — 与 Web `lume-mark-badge` 一致
  final bool badge;
  final Color? badgeColor;

  static const Color _badgeBg = Color(0xFFF7F4EF);

  @override
  Widget build(BuildContext context) {
    final glyphSize = badge ? size * 0.68 : size;
    final mark = SvgPicture.asset(
      'assets/brand/lume-mark.svg',
      width: glyphSize,
      height: glyphSize,
      colorFilter: const ColorFilter.mode(
        LumeColors.brandMark,
        BlendMode.srcIn,
      ),
    );

    if (!badge) return mark;

    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: badgeColor ?? _badgeBg,
        borderRadius: BorderRadius.circular(size * 0.22),
      ),
      child: mark,
    );
  }
}
