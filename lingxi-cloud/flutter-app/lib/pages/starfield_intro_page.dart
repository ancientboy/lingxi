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
  late AnimationController _ctaController;

  // CTA 按钮是否激活
  bool _ctaActive = false;

  // 当前显示的行索引
  int _currentLineIndex = -1;
  
  // 滚动偏移（向上为负）
  double _scrollOffset = 0.0;
  
  // 动画是否完成
  bool _animationComplete = false;

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

    // 初始化 CTA 按钮动画控制器
    _ctaController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    // 生成星星
    _generateStars();

    // 启动动画
    _startAnimation();
  }

  @override
  void dispose() {
    _logoGlowController.dispose();
    _ctaController.dispose();
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

  // 启动动画
  Future<void> _startAnimation() async {
    // 逐行显示文字，每显示完一行就向上滚动
    for (int i = 0; i < _storyLines.length; i++) {
      if (!mounted) return;
      
      setState(() {
        _currentLineIndex = i;
      });
      
      // 等待这行文字显示
      await Future.delayed(Duration(
        milliseconds: _storyLines[i].isEmpty ? 200 : 600,
      ));
      
      // 向上滚动一点
      if (mounted) {
        setState(() {
          _scrollOffset -= 30;
        });
      }
      
      await Future.delayed(const Duration(milliseconds: 100));
    }
    
    // 所有文字显示完，激活按钮
    if (mounted) {
      setState(() {
        _animationComplete = true;
      });
      
      // 按钮淡入
      _ctaController.forward(from: 0.0);
      await Future.delayed(const Duration(milliseconds: 300));
      
      if (mounted) {
        setState(() {
          _ctaActive = true;
        });
      }
    }
  }

  // 完成启动屏
  void _complete() {
    if (!_ctaActive) return;
    
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
            SafeArea(
              child: Column(
                children: [
                  const SizedBox(height: 40),
                  // Logo
                  _buildLogo(),
                  const SizedBox(height: 40),
                  // 品牌故事
                  Expanded(child: _buildStory()),
                  // CTA 按钮
                  _buildCTAButton(),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ],
        ),
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
    return Stack(
      children: [
        // 滚动的文字
        AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
          transform: Matrix4.translationValues(0, _scrollOffset, 0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(_storyLines.length, (index) {
              final line = _storyLines[index];
              final isHighlight = line.contains('Lume');
              final isVisible = index <= _currentLineIndex;
              
              return AnimatedOpacity(
                duration: const Duration(milliseconds: 300),
                opacity: isVisible ? 1.0 : 0.0,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: 6,
                    horizontal: 24,
                  ),
                  child: Text(
                    line.isEmpty ? ' ' : line,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 17,
                      height: 1.6,
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
              );
            }),
          ),
        ),
        
        // 顶部渐变遮罩
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          height: 60,
          child: IgnorePointer(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    const Color(0xFF090A0F),
                    const Color(0xFF090A0F).withOpacity(0.5),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  // 构建 CTA 按钮
  Widget _buildCTAButton() {
    return AnimatedBuilder(
      animation: _ctaController,
      builder: (context, child) {
        return Opacity(
          opacity: _ctaController.value,
          child: Column(
            children: [
              ElevatedButton(
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
                  shadowColor: const Color(0xFF10a37f).withOpacity(0.5),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '开始体验',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: _ctaActive ? Colors.white : Colors.white54,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Icon(
                      Icons.arrow_forward,
                      size: 18,
                      color: _ctaActive ? Colors.white : Colors.white54,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              if (_ctaActive)
                Text(
                  '点击按钮或按 Enter 键继续',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.white.withOpacity(0.5),
                  ),
                ),
            ],
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
