import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:lingxicloud/widgets/audio_player_widget.dart';

/// 技能 Tag 数据类
class SkillTag {
  final String id;
  final String name;
  SkillTag({required this.id, required this.name});
}

/// 持续旋转的圆环（豆包风格停止按钮外圈）
class SpinningRing extends StatefulWidget {
  final Color color;
  final double strokeWidth;
  final double size;
  const SpinningRing({super.key, required this.color, this.strokeWidth = 2.5, this.size = 32});
  @override
  State<SpinningRing> createState() => _SpinningRingState();
}

class _SpinningRingState extends State<SpinningRing> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500))
      ..repeat(); // 持续循环
  }
  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, __) => CustomPaint(
        size: Size(widget.size, widget.size),
        painter: SpinProgressPainter(
          progress: _ctrl.value,
          color: widget.color,
          strokeWidth: widget.strokeWidth,
        ),
      ),
    );
  }
}

/// 自定义代码块渲染器（chat_page 内用）
class ChatCodeBlockBuilder extends MarkdownElementBuilder {
  final bool isDarkMode;
  ChatCodeBlockBuilder({required this.isDarkMode});

  @override
  Widget? visitElementAfterWithContext(
    BuildContext context,
    md.Element element,
    TextStyle? _,
    TextStyle? __,
  ) {
    final code = element.textContent;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E2E),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isDarkMode ? const Color(0xFF3D3D40) : const Color(0xFF2D2D30),
          width: 0.5,
        ),
      ),
      child: SelectableText(
        code,
        style: const TextStyle(
          color: Color(0xFFCDD6F4),
          fontFamily: 'SF Mono',
          fontSize: 12.5,
          height: 1.6,
        ),
      ),
    );
  }
}

/// 气泡复制按钮
class BubbleCopyButton extends StatefulWidget {
  final String text;
  final bool isDarkMode;

  const BubbleCopyButton({super.key, required this.text, required this.isDarkMode});

  @override
  State<BubbleCopyButton> createState() => _BubbleCopyButtonState();
}

class _BubbleCopyButtonState extends State<BubbleCopyButton> {
  bool _copied = false;

  @override
  Widget build(BuildContext context) {
    final color = widget.isDarkMode
        ? Colors.white.withOpacity(0.4)
        : Colors.black54;
    return GestureDetector(
      onTap: () async {
        await Clipboard.setData(ClipboardData(text: widget.text));
        setState(() => _copied = true);
        if (mounted) {
          Future.delayed(const Duration(seconds: 2), () {
            if (mounted) setState(() => _copied = false);
          });
        }
      },
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: widget.isDarkMode
              ? Colors.white.withOpacity(0.05)
              : Colors.black.withOpacity(0.03),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Icon(
          _copied ? Icons.check : Icons.copy,
          size: 14,
          color: color,
        ),
      ),
    );
  }
}
