import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/lume_theme.dart';
import 'lume_animated_mark.dart';

Future<void> showLumeAboutDialog(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(
        'Lume',
        style: GoogleFonts.dmSans(fontWeight: FontWeight.w700),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const LumeAnimatedMark(size: 72, animate: true),
          const SizedBox(height: 16),
          const Text(
            '你的 AI 团队，就在桌面',
            style: TextStyle(color: LumeColors.text2, fontSize: 13),
          ),
          const SizedBox(height: 8),
          Text(
            '连接 lumeword.cn 云端',
            style: TextStyle(color: LumeColors.text3, fontSize: 12),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('关闭'),
        ),
      ],
    ),
  );
}
