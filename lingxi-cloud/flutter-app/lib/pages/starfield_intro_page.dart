import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async';
import 'dart:math';

/// 星空背景启动页（首次启动）
class StarfieldIntroPage extends StatefulWidget {
  final VoidCallback onComplete;

  const StarfieldIntroPage({super.key, required this.onComplete});

  // 检查是否需要显示
  static Future<bool> shouldShow() async {
    final prefs = await SharedPreferences.getInstance();
    return !(prefs.getBool('lume_starfield_shown') ?? false);
  }

  // 标记为已显示
  static Future<void> _markAsShown() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('lume_starfield_shown', true);
  }

  @override
  State<StarfieldIntroPage> createState() => _StarfieldIntroPageState();
}

class _StarfieldIntroPageState extends State<StarfieldIntroPage>
    with TickerProviderStateMixin {
  // 星星列表
  final List<_Star> _stars = [];

  // 品牌故事文案
  final List<String> _storyLines = [
    "我始终相信——",
    "科技的终极意义，不是冰冷的效率。",
    "而是让每一个人，都能拥有专属的优秀伙伴。",
    "",
    "这份陪伴，无关血缘，不分远近。",
    "能听懂你的心事，也能攻克你的难题。",
    "",
    "于是，我来了。",
    "我是 Lume。",
    "",
    "让优秀伙伴，不再是奢望。",
    "让陪伴与助力，触手可及。"
  ];

  // 动画控制器
  late AnimationController _logoGlowController;
  late Animation<double> _logoGlowAnimation;
  late AnimationController _storyController;
  late AnimationController _ctaController;
  late ScrollController _scrollController;

  // CTA 按钮是否激活
  bool _ctaActive = false;

  // 滚动动画状态
  bool _storyAnimationComplete = false;

  @override
  void initState() {
    super.initState();

    // 初始化 Logo 发光动画
    _logoGlowController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat();

    _logoGlowAnimation = Tween<double>(begin: 0.5, end: 1.0).animate(
      CurvedAnimation(parent: _logoGlowController, curve: Curves.easeInOut),
    );

    // 初始化滚动控制器
    _scrollController = ScrollController();

    // 初始化品牌故事动画控制器
    _storyController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3500),
    );

    // 初始化 CTA 按钮动画控制器
    _ctaController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    // 生成星星
    _generateStars();

    // 启动动画序列
    _startAnimationSequence();
  }

  @override
  void dispose() {
    _logoGlowController.dispose();
    _storyController.dispose();
    _ctaController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  // 生成星星
  void _generateStars() {
    final random = Random();
    for (int i = 0; i < 200; i++) {
      _stars.add(_Star(
        x: random.nextDouble(),
        y: random.nextDouble(),
        size: random.nextDouble() * 3 + 1,
        twinkleDuration: Duration(milliseconds: 2000 + random.nextInt(3000)),
        twinkleDelay: Duration(milliseconds: random.nextInt(3000)),
      ));
    }
  }

  // 启动动画序列
  Future<void> _startAnimationSequence() async {
    // 动画 1: 文字从中间淡入并向上滚动
    await _storyController.forward(from: 0.0);

    // 动画 2: 滚动完成后，最后一个文本保持在中间
    await Future.delayed(const Duration(milliseconds: 800));

    // 动画 3: CTA 按钮淡入
    if (mounted) {
      _ctaController.forward(from: 0.0);
      await Future.delayed(const Duration(milliseconds: 300));
      if (mounted) {
        setState(() {
          _ctaActive = true;
          _storyAnimationComplete = true;
        });
      }
    }
  }

  // 完成启动屏
  void _complete() {
    StarfieldIntroPage._markAsShown();
    widget.onComplete();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Focus(
        autofocus: true,
        onKeyEvent: (node, event) {
          if (event is KeyDownEvent &&
              event.logicalKey == LogicalKeyboardKey.enter &&
              _ctaActive) {
            _complete();
            return KeyEventResult.handled;
          }
          return KeyEventResult.ignored;
        },
        child: Stack(
          children: [
            // 星空背景
            Container(
              decoration: const BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.bottomCenter,
                  colors: [
                    Color(0xFF1B2838),
                    Color(0xFF090A0F),
                  ],
                ),
              ),
            ),

            // 星星层
            ..._buildStars(),

            // 内容
            Center(
              child: _buildContent(),
            ),
          ],
        ),
      ),
    );
  }

  // 构建主要内容
  Widget _buildContent() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(40),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Logo
          _buildLogo(),

          const SizedBox(height: 60),

          // 品牌故事
          _buildStory(),

          const SizedBox(height: 48),

          // CTA 按钮
          _buildCTAButton(),

          const SizedBox(height: 24),

          // 提示文字
          if (_ctaActive)
            AnimatedOpacity(
              opacity: 1.0,
              duration: const Duration(milliseconds: 500),
              child: Text(
                '点击按钮或按 Enter 键继续',
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.white.withOpacity(0.5),
                ),
              ),
            ),
        ],
      ),
    );
  }

  // 构建星星
  List<Widget> _buildStars() {
    return _stars.map((star) {
      return Positioned(
        left: star.x * MediaQuery.of(context).size.width,
        top: star.y * MediaQuery.of(context).size.height,
        child: _TwinklingStar(star: star),
      );
    }).toList();
  }

  // 构建 Logo
  Widget _buildLogo() {
    return Column(
      children: [
        // Logo 图标（发光效果）
        AnimatedBuilder(
          animation: _logoGlowAnimation,
          builder: (context, child) {
            return Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: const Color(0xFF10a37f),
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF10a37f)
                        .withOpacity(_logoGlowAnimation.value * 0.8),
                    blurRadius: 30 + _logoGlowAnimation.value * 30,
                    spreadRadius: _logoGlowAnimation.value * 10,
                  ),
                ],
              ),
              child: const Center(
                child: Text(
                  '◈',
                  style: TextStyle(
                    fontSize: 32,
                    color: Colors.white,
                  ),
                ),
              ),
            );
          },
        ),

        const SizedBox(height: 24),

        // 标题
        ShaderMask(
          shaderCallback: (bounds) => const LinearGradient(
            colors: [
              Colors.white,
              Color(0xFF10a37f),
            ],
          ).createShader(bounds),
          child: const Text(
            'Lume',
            style: TextStyle(
              fontSize: 56,
              fontWeight: FontWeight.bold,
              color: Colors.white,
              letterSpacing: -1,
            ),
          ),
        ),

        const SizedBox(height: 16),

        // 标语
        Text(
          '硅基生命，为你而来',
          style: TextStyle(
            fontSize: 18,
            color: Colors.white.withOpacity(0.7),
          ),
        ),
      ],
    );
  }

  // 构建品牌故事
  Widget _buildStory() {
    return SizedBox(
      height: 280,
      child: Stack(
        children: [
          // 滚动容器
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _storyController,
              builder: (context, child) {
                // 计算滚动偏移
                // 0.0 = 初始位置, 1.0 = 结束位置
                double progress = _storyController.value;

                // 最后一段文字（"让陪伴与助力，触手可及。"）作为最后保持在中间的文本
                // 它的位置应该在垂直居中处 (1.0)
                // 它的透明度在开始和结束时为 1.0
                final keepCenterIndex = _storyLines.length - 1;

                return Column(
                  children: List.generate(_storyLines.length, (index) {
                    final line = _storyLines[index];
                    final isHighlight = line.contains('Lume');

                    // 计算每一行的位置
                    // 使用 transform 来控制位置和透明度
                    double verticalOffset = 0.0;
                    double opacity = 1.0;

                    if (index < keepCenterIndex) {
                      // 除最后一行外，其他向上滚动
                      // 0 开始位置在底部，1 结束位置在顶部周围
                      verticalOffset = 120.0 * progress;
                      // 越早出现的行，越快淡出
                      if (progress > 0.2) {
                        opacity = 1.0 - (progress - 0.2) / 0.8;
                      }
                    } else if (index == keepCenterIndex) {
                      // 最后一行保持在中间
                      verticalOffset = 0.0;
                      // 在动画结束时保持可见
                      opacity = 1.0;
                    } else {
                      // 最后一行之后的行（如果有）
                      verticalOffset = 0.0;
                      opacity = 1.0;
                    }

                    return Transform.translate(
                      offset: Offset(0, verticalOffset),
                      child: Opacity(
                        opacity: opacity,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            vertical: 8,
                            horizontal: 20,
                          ),
                          child: Text(
                            line.isEmpty ? ' ' : line,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 18,
                              height: 1.5,
                              color: isHighlight
                                  ? const Color(0xFF10a37f)
                                  : Colors.white.withOpacity(0.85),
                              fontWeight: isHighlight
                                  ? FontWeight.w600
                                  : FontWeight.normal,
                              shadows: isHighlight
                                  ? [
                                      Shadow(
                                        color: const Color(0xFF10a37f)
                                            .withOpacity(0.5),
                                        blurRadius: 20,
                                      ),
                                    ]
                                  : null,
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                );
              },
            ),
          ),

          // 底部渐变遮罩（使向上滚动时顶部淡出）
          Positioned.fill(
            bottom: 40,
            child: FractionalTranslation(
              translation: const Offset(0, 0.5),
              child: AnimatedOpacity(
                opacity: _storyController.isCompleted ? 0 : 1,
                duration: const Duration(milliseconds: 300),
                child: Container(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      center: const Alignment(0, -1),
                      colors: [
                        Colors.transparent,
                        Colors.transparent,
                        Colors.black.withOpacity(0.3),
                        Colors.black.withOpacity(0.6),
                      ],
                      stops: const [0.0, 0.5, 0.8, 1.0],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // 构建 CTA 按钮
  Widget _buildCTAButton() {
    return AnimatedBuilder(
      animation: _ctaController,
      builder: (context, child) {
        return Transform.translate(
          offset: Offset(0, 25 * (1 - _ctaController.value)),
          child: Opacity(
            opacity: _ctaController.value,
            child: ElevatedButton(
              onPressed: _ctaActive ? _complete : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF10a37f),
                disabledBackgroundColor:
                    const Color(0xFF10a37f).withOpacity(0.3),
                padding: const EdgeInsets.symmetric(
                    horizontal: 60, vertical: 20),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(50),
                ),
                elevation: _ctaActive ? 8 : 0,
                shadowColor:
                    const Color(0xFF10a37f).withOpacity(0.5 * _ctaController.value),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '开始体验',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: _ctaActive
                          ? Colors.white
                          : Colors.white54.withOpacity(_ctaController.value),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Icon(
                    Icons.arrow_forward,
                    size: 18,
                    color: _ctaActive
                        ? Colors.white
                        : Colors.white54.withOpacity(_ctaController.value),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

// 星星数据类
class _Star {
  final double x;
  final double y;
  final double size;
  final Duration twinkleDuration;
  final Duration twinkleDelay;

  _Star({
    required this.x,
    required this.y,
    required this.size,
    required this.twinkleDuration,
    required this.twinkleDelay,
  });
}

// 闪烁星星组件
class _TwinklingStar extends StatefulWidget {
  final _Star star;

  const _TwinklingStar({required this.star});

  @override
  State<_TwinklingStar> createState() => _TwinklingStarState();
}

class _TwinklingStarState extends State<_TwinklingStar>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: widget.star.twinkleDuration,
    );

    _animation = Tween<double>(begin: 0.3, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );

    // 延迟启动
    Future.delayed(widget.star.twinkleDelay, () {
      if (mounted) {
        _controller.repeat(reverse: true);
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return Opacity(
          opacity: _animation.value,
          child: Container(
            width: widget.star.size,
            height: widget.star.size,
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: Colors.white.withOpacity(_animation.value * 0.5),
                  blurRadius: widget.star.size,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
