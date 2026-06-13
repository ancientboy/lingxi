import 'package:flutter/material.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:lingxicloud/utils/constants.dart';

/// 音频播放组件
class AudioPlayerWidget extends StatefulWidget {
  final String audioPath;
  final String? serverIp;
  final int? serverPort;
  final String? serverToken;
  final bool isDarkMode;

  const AudioPlayerWidget({
    super.key,
    required this.audioPath,
    this.serverIp,
    this.serverPort,
    this.serverToken,
    this.isDarkMode = false,
  });

  @override
  State<AudioPlayerWidget> createState() => _AudioPlayerWidgetState();
}

class _AudioPlayerWidgetState extends State<AudioPlayerWidget> {
  bool _isPlaying = false;
  bool _isLoading = false;
  String? _error;
  Duration _duration = Duration.zero;
  Duration _position = Duration.zero;

  // 单例音频播放器
  static final AudioPlayer _audioPlayer = AudioPlayer();

  // 格式化时间为 mm:ss
  String _formatDuration(Duration duration) {
    final minutes = duration.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = duration.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  String get _audioUrl {
    // 构建音频 URL
    if (widget.audioPath.startsWith('http')) {
      return widget.audioPath;
    }

    // 如果有用户服务器信息，使用用户的 file-server (端口 9876)
    if (widget.serverIp != null && widget.serverIp!.isNotEmpty) {
      final port = widget.serverPort ?? 9876;
      final token = widget.serverToken ?? '';
      debugPrint('🔊 使用用户服务器: ${widget.serverIp}:$port');
      return 'http://${widget.serverIp}:$port/preview?path=${Uri.encodeComponent(widget.audioPath)}&token=$token';
    }

    // 否则使用灵犀云后端的 TTS 代理 API（主服务器）
    const backendIp = 'lumeword.cn';
    const backendPort = 3000;

    debugPrint('🔊 使用主服务器代理: $backendIp:$backendPort');
    return 'http://$backendIp:$backendPort/api/files/tts?path=${Uri.encodeComponent(widget.audioPath)}';
  }

  @override
  void initState() {
    super.initState();

    // 监听播放完成
    _audioPlayer.onPlayerComplete.listen((_) {
      if (mounted) {
        setState(() {
          _isPlaying = false;
          _position = Duration.zero;
        });
      }
    });

    // 监听音频时长
    _audioPlayer.onDurationChanged.listen((duration) {
      if (mounted) {
        setState(() => _duration = duration);
      }
    });

    // 监听播放进度
    _audioPlayer.onPositionChanged.listen((position) {
      if (mounted) {
        setState(() => _position = position);
      }
    });

    // 监听播放错误
    _audioPlayer.onLog.listen((msg) {
      debugPrint('🔊 AudioPlayer log: $msg');
    });
  }

  Future<void> _togglePlay() async {
    if (_isPlaying) {
      await _audioPlayer.stop();
      setState(() => _isPlaying = false);
    } else {
      setState(() {
        _isLoading = true;
        _error = null;
      });

      try {
        debugPrint('🔊 播放音频: $_audioUrl');

        // 设置音频源
        await _audioPlayer.setSource(UrlSource(_audioUrl));

        // 播放
        await _audioPlayer.resume();

        setState(() {
          _isPlaying = true;
          _isLoading = false;
        });
      } catch (e) {
        debugPrint('❌ 播放失败: $e');
        setState(() {
          _isLoading = false;
          _error = '播放失败: ${e.toString().split('\n').first}';
          _isPlaying = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bgColor = widget.isDarkMode ? const Color(0xFF424454) : Colors.grey.shade200;
    final iconColor = widget.isDarkMode ? const Color(0xFF10A37F) : Constants.primaryColor;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // 播放/停止按钮
          GestureDetector(
            onTap: _isLoading ? null : _togglePlay,
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: iconColor,
                shape: BoxShape.circle,
              ),
              child: _isLoading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Icon(
                      _isPlaying ? Icons.stop : Icons.play_arrow,
                      color: Colors.white,
                      size: 20,
                    ),
            ),
          ),
          const SizedBox(width: 12),
          // 音频信息和进度
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '语音消息',
                        style: TextStyle(
                          color: widget.isDarkMode ? const Color(0xFFECECF1) : Colors.black87,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    // 时间显示
                    Text(
                      '${_formatDuration(_position)} / ${_formatDuration(_duration)}',
                      style: TextStyle(
                        color: widget.isDarkMode ? Colors.white70 : Colors.black54,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
                // 进度条
                if (_duration.inSeconds > 0)
                  Container(
                    height: 3,
                    margin: const EdgeInsets.only(top: 4),
                    decoration: BoxDecoration(
                      color: widget.isDarkMode ? Colors.white24 : Colors.black12,
                      borderRadius: BorderRadius.circular(2),
                    ),
                    child: FractionallySizedBox(
                      alignment: Alignment.centerLeft,
                      widthFactor: _position.inMilliseconds / _duration.inMilliseconds,
                      child: Container(
                        decoration: BoxDecoration(
                          color: iconColor,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                  ),
                // 错误信息
                if (_error != null)
                  Text(
                    _error!,
                    style: const TextStyle(color: Colors.red, fontSize: 10),
                  ),
              ],
            ),
          ),
          if (_isPlaying) ...[
            const SizedBox(width: 12),
            // 播放动画
            const SizedBox(
              width: 24,
              height: 16,
              child: AudioWaveAnimation(),
            ),
          ],
        ],
      ),
    );
  }
}

/// 音频波形动画
class AudioWaveAnimation extends StatefulWidget {
  const AudioWaveAnimation({super.key});

  @override
  State<AudioWaveAnimation> createState() => _AudioWaveAnimationState();
}

class _AudioWaveAnimationState extends State<AudioWaveAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 500),
      vsync: this,
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: List.generate(3, (i) {
            return Container(
              width: 3,
              height: 8 + (_controller.value * 8),
              decoration: BoxDecoration(
                color: Constants.primaryColor,
                borderRadius: BorderRadius.circular(2),
              ),
            );
          }),
        );
      },
    );
  }
}

/// 旋转进度画笔（停止按钮外圈动画）
class SpinProgressPainter extends CustomPainter {
  final double progress;
  final Color color;
  final double strokeWidth;

  SpinProgressPainter({
    required this.progress,
    required this.color,
    this.strokeWidth = 2.5,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - strokeWidth) / 2;

    // 背景圆（浅色）
    final bgPaint = Paint()
      ..color = color.withOpacity(0.15)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawCircle(center, radius, bgPaint);

    // 前景弧（旋转）
    final fgPaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    final startAngle = progress * 2 * 3.14159265; // 旋转起点
    const sweepAngle = 3.14159265 * 1.2; // 约 216 度弧

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweepAngle,
      false,
      fgPaint,
    );
  }

  @override
  bool shouldRepaint(covariant SpinProgressPainter old) => old.progress != progress;
}
