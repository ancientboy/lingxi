import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// C1-13 hive nest mark (partner peek).
class LumeMark extends StatelessWidget {
  const LumeMark({super.key, this.size = 40});

  final double size;

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      'assets/brand/lume-mark.svg',
      width: size,
      height: size,
      colorFilter: ColorFilter.mode(
        Theme.of(context).colorScheme.primary,
        BlendMode.srcIn,
      ),
    );
  }
}
