import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/lume_theme.dart';
import '../widgets/lume_animated_mark.dart';

/// Launch splash — C1-13 logo idle animation while app boots.
class SplashPage extends StatelessWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: LumeColors.bg,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const LumeAnimatedMark(size: 88, animate: true, badge: true),
            const SizedBox(height: 20),
            Text(
              'Lume',
              style: GoogleFonts.dmSans(
                fontSize: 28,
                fontWeight: FontWeight.w700,
                color: LumeColors.text1,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '你的 AI 团队，就在桌面',
              style: TextStyle(
                fontSize: 13,
                color: LumeColors.text3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
