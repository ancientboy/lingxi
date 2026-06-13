import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lingxicloud/utils/constants.dart';

/// 语音波浪动画
class VoiceWaveAnimation extends StatelessWidget {
  final bool isListening;
  final int waveIndex;

  const VoiceWaveAnimation({
    super.key,
    required this.isListening,
    required this.waveIndex,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 24,
      height: 24,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(4, (index) {
          final height = 8.0 + ((waveIndex + index) % 4) * 4.0;
          return AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            height: isListening ? height : 8,
            width: 3,
            margin: const EdgeInsets.symmetric(horizontal: 1),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(2),
            ),
          );
        }),
      ),
    );
  }
}

/// 语音输入区域
class VoiceInputArea extends StatelessWidget {
  final bool isDarkMode;
  final bool isListening;
  final bool isCanceling;
  final int waveIndex;
  final String lastWords;
  final VoidCallback onKeyboardToggle;
  final void Function(LongPressStartDetails details) onLongPressStart;
  final void Function(LongPressMoveUpdateDetails details) onLongPressMoveUpdate;
  final void Function(LongPressEndDetails details) onLongPressEnd;

  const VoiceInputArea({
    super.key,
    required this.isDarkMode,
    required this.isListening,
    required this.isCanceling,
    required this.waveIndex,
    required this.lastWords,
    required this.onKeyboardToggle,
    required this.onLongPressStart,
    required this.onLongPressMoveUpdate,
    required this.onLongPressEnd,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (lastWords.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              lastWords,
              style: TextStyle(
                color: isDarkMode ? Colors.white70 : Colors.black54,
                fontSize: 14,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        Row(
          children: [
            IconButton(
              icon: Icon(Icons.keyboard, color: isDarkMode ? const Color(0xFFECECF1) : null),
              onPressed: onKeyboardToggle,
            ),
            Expanded(
              child: GestureDetector(
                onLongPressStart: onLongPressStart,
                onLongPressMoveUpdate: onLongPressMoveUpdate,
                onLongPressEnd: onLongPressEnd,
                child: Container(
                  height: 48,
                  decoration: BoxDecoration(
                    color: isCanceling
                        ? Colors.grey.shade600
                        : (isListening ? Colors.red.shade400 : Constants.primaryColor),
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      isCanceling
                          ? const Icon(Icons.cancel, color: Colors.white)
                          : (isListening
                              ? VoiceWaveAnimation(isListening: isListening, waveIndex: waveIndex)
                              : const Icon(Icons.mic_none, color: Colors.white)),
                      const SizedBox(width: 8),
                      Text(
                        isCanceling
                            ? '松开取消'
                            : (isListening ? '松开发送' : '按住说话'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 48),
          ],
        ),
      ],
    );
  }
}
