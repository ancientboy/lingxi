import 'package:flutter/material.dart';

/// 蜂巢 logo 画笔（对齐 Web lume-brand.js 的 hive nest SVG）
/// viewBox: 14 11 20 24 — 蜂巢 + 表情 + partner dot
class HiveLogoPainter extends CustomPainter {
  final Color color;

  HiveLogoPainter({this.color = const Color(0xFF1A1A1A)});

  @override
  void paint(Canvas canvas, Size size) {
    final scaleX = size.width / 20;
    final scaleY = size.height / 24;
    const offsetX = -14.0;
    const offsetY = -11.0;

    // 蜂巢路径：M 24 13 L 32 18 L 32 28 L 24 33 L 16 28 L 16 18 Z
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.9
      ..strokeJoin = StrokeJoin.round;

    final nestPath = Path();
    nestPath.moveTo((24 + offsetX) * scaleX, (13 + offsetY) * scaleY);
    nestPath.lineTo((32 + offsetX) * scaleX, (18 + offsetY) * scaleY);
    nestPath.lineTo((32 + offsetX) * scaleX, (28 + offsetY) * scaleY);
    nestPath.lineTo((24 + offsetX) * scaleX, (33 + offsetY) * scaleY);
    nestPath.lineTo((16 + offsetX) * scaleX, (28 + offsetY) * scaleY);
    nestPath.lineTo((16 + offsetX) * scaleX, (18 + offsetY) * scaleY);
    nestPath.close();
    canvas.drawPath(nestPath, paint);

    // 眼睛：circle cx=21 cy=22.5 r=2.4
    final eyePaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    canvas.drawCircle(
      Offset((21 + offsetX) * scaleX, (22.5 + offsetY) * scaleY),
      2.4 * scaleX,
      eyePaint,
    );

    // 微笑：M 19.5 27.8 Q 23.5 30.5 27.5 27.8
    final smilePaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..strokeCap = StrokeCap.round;
    final smilePath = Path();
    smilePath.moveTo((19.5 + offsetX) * scaleX, (27.8 + offsetY) * scaleY);
    smilePath.quadraticBezierTo(
      (23.5 + offsetX) * scaleX, (30.5 + offsetY) * scaleY,
      (27.5 + offsetX) * scaleX, (27.8 + offsetY) * scaleY,
    );
    canvas.drawPath(smilePath, smilePaint);

    // Partner dot：circle cx=27.2 cy=23.8 r=1.65 opacity=0.5
    final partnerPaint = Paint()
      ..color = Color.fromRGBO(26, 26, 26, 0.5)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(
      Offset((27.2 + offsetX) * scaleX, (23.8 + offsetY) * scaleY),
      1.65 * scaleX,
      partnerPaint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
