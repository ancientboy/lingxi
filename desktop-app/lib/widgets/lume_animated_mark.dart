import 'package:flutter/material.dart';

import '../theme/lume_theme.dart';

/// C1-13 hive nest mark with idle breathe + partner peek animation.
class LumeAnimatedMark extends StatefulWidget {
  const LumeAnimatedMark({
    super.key,
    this.size = 96,
    this.animate = true,
    this.color,
    this.badge = false,
  });

  final double size;
  final bool animate;
  final Color? color;
  final bool badge;

  static const Color _badgeBg = Color(0xFFF7F4EF);

  @override
  State<LumeAnimatedMark> createState() => _LumeAnimatedMarkState();
}

class _LumeAnimatedMarkState extends State<LumeAnimatedMark>
    with TickerProviderStateMixin {
  AnimationController? _breathe;
  AnimationController? _peek;

  @override
  void initState() {
    super.initState();
    _setupAnimations();
  }

  void _setupAnimations() {
    if (widget.animate) {
      _breathe ??= AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 3200),
      )..repeat(reverse: true);
      _peek ??= AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 2800),
      )..repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(LumeAnimatedMark oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.animate != widget.animate) {
      if (!widget.animate) {
        _breathe?.dispose();
        _peek?.dispose();
        _breathe = null;
        _peek = null;
      } else {
        _setupAnimations();
      }
    }
  }

  @override
  void dispose() {
    _breathe?.dispose();
    _peek?.dispose();
    super.dispose();
  }

  Widget _wrapBadge(Widget child) {
    if (!widget.badge) return child;
    return Container(
      width: widget.size,
      height: widget.size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: LumeAnimatedMark._badgeBg,
        borderRadius: BorderRadius.circular(widget.size * 0.22),
      ),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.color ?? LumeColors.accent;
    final glyph = widget.badge ? widget.size * 0.68 : widget.size;

    Widget paintMark(_LumeMarkPainter painter) {
      return SizedBox(
        width: glyph,
        height: glyph,
        child: CustomPaint(painter: painter),
      );
    }

    if (!widget.animate || _breathe == null || _peek == null) {
      return _wrapBadge(
        paintMark(
          _LumeMarkPainter(
            color: color,
            breatheScale: 1,
            partnerOpacity: 0.5,
            partnerNudge: Offset.zero,
            smileOpacity: 1,
          ),
        ),
      );
    }

    return _wrapBadge(
      AnimatedBuilder(
        animation: Listenable.merge([_breathe!, _peek!]),
        builder: (context, _) {
          final breatheT = Curves.easeInOut.transform(_breathe!.value);
          final peekT = Curves.easeInOut.transform(_peek!.value);
          final breatheScale = 1 + breatheT * 0.03;
          final partnerOpacity = 0.45 + peekT * 0.27;
          final partnerNudge = Offset(0.6 * peekT, -0.5 * peekT);
          final smileOpacity = 1 - breatheT * 0.12;

          return paintMark(
            _LumeMarkPainter(
              color: color,
              breatheScale: breatheScale,
              partnerOpacity: partnerOpacity,
              partnerNudge: partnerNudge,
              smileOpacity: smileOpacity,
            ),
          );
        },
      ),
    );
  }
}

class _LumeMarkPainter extends CustomPainter {
  _LumeMarkPainter({
    required this.color,
    required this.breatheScale,
    required this.partnerOpacity,
    required this.partnerNudge,
    required this.smileOpacity,
  });

  final Color color;
  final double breatheScale;
  final double partnerOpacity;
  final Offset partnerNudge;
  final double smileOpacity;

  static const _vbMinX = 14.0;
  static const _vbMinY = 11.0;
  static const _vbWidth = 20.0;
  static const _vbHeight = 24.0;
  static const _pivot = Offset(24, 23);

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / _vbWidth;
    final offsetX = (size.width - _vbWidth * scale) / 2 - _vbMinX * scale;
    final offsetY = (size.height - _vbHeight * scale) / 2 - _vbMinY * scale;

    canvas.save();
    canvas.translate(offsetX, offsetY);
    canvas.scale(scale);

    canvas.translate(_pivot.dx, _pivot.dy);
    canvas.scale(breatheScale);
    canvas.translate(-_pivot.dx, -_pivot.dy);

    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.9
      ..strokeJoin = StrokeJoin.round;

    final hex = Path()
      ..moveTo(24, 13)
      ..lineTo(32, 18)
      ..lineTo(32, 28)
      ..lineTo(24, 33)
      ..lineTo(16, 28)
      ..lineTo(16, 18)
      ..close();
    canvas.drawPath(hex, stroke);

    canvas.drawCircle(const Offset(21, 22.5), 2.4, Paint()..color = color);

    final smile = Paint()
      ..color = color.withValues(alpha: smileOpacity)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..strokeCap = StrokeCap.round;

    final smilePath = Path();
    smilePath.moveTo(19.5, 27.8);
    smilePath.quadraticBezierTo(23.5, 30.5, 27.5, 27.8);
    canvas.drawPath(smilePath, smile);

    final partnerCenter = const Offset(27.2, 23.8) + partnerNudge;
    canvas.drawCircle(
      partnerCenter,
      1.65,
      Paint()..color = color.withValues(alpha: partnerOpacity),
    );

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _LumeMarkPainter old) {
    return old.breatheScale != breatheScale ||
        old.partnerOpacity != partnerOpacity ||
        old.partnerNudge != partnerNudge ||
        old.smileOpacity != smileOpacity ||
        old.color != color;
  }
}
