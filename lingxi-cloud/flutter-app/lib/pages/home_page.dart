import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/pages/chat_page.dart';
import 'package:lingxicloud/pages/subscription_page.dart';
import 'package:lingxicloud/pages/skills_page.dart';
import 'package:lingxicloud/pages/settings_page.dart';
import 'package:lingxicloud/pages/login_page.dart';
import 'dart:async';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  @override
  Widget build(BuildContext context) {
    return Consumer<AppProvider>(
      builder: (context, appProvider, child) {
        final user = appProvider.user;
        
        return Scaffold(
          appBar: AppBar(
            title: Row(
              children: [
            Icon(Icons.auto_awesome, color: Constants.primaryColor),
            const SizedBox(width: 8),
            const Text('Lume', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          ],
        ),
        actions: [
          // 积分显示 - 点击签到
          GestureDetector(
            onTap: () async {
              // TODO: 实现签到功能
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('签到功能开发中...')),
              );
            },
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.orange.shade100,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  const Icon(Icons.diamond, size: 16, color: Colors.orange),
                  const SizedBox(width: 4),
                  Text(
                    '${user?.points ?? 0}',
                    style: const TextStyle(
                      color: Colors.orange,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.add_circle_outline, size: 14, color: Colors.orange),
                ],
              ),
            ),
          ),
              // 菜单
              PopupMenuButton<String>(
                onSelected: (value) async {
                  switch (value) {
                    case 'subscription':
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const SubscriptionPage()));
                      break;
                    case 'skills':
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const SkillsPage()));
                      break;
                    case 'settings':
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsPage()));
                      break;
                    case 'logout':
                      await appProvider.logout();
                      if (mounted) {
                        Navigator.of(context).pushAndRemoveUntil(
                          MaterialPageRoute(builder: (_) => const LoginPage()),
                          (route) => false,
                        );
                      }
                      break;
                  }
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(value: 'subscription', child: Text('💎 订阅管理')),
                  const PopupMenuItem(value: 'skills', child: Text('📚 技能库')),
                  const PopupMenuItem(value: 'settings', child: Text('⚙️ 设置')),
                  const PopupMenuDivider(),
                  const PopupMenuItem(value: 'logout', child: Text('🚪 退出登录')),
                ],
              ),
            ],
          ),
          body: _buildBody(appProvider),
        );
      },
    );
  }

  Widget _buildBody(AppProvider appProvider) {
    final user = appProvider.user;
    final hasTeam = user?.agents.isNotEmpty ?? false;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 600),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // 品牌故事流式输出
              _buildBrandStory(),
              
              const SizedBox(height: 32),
              
              // 欢迎信息
              Text(
                '欢迎回来，${user?.nickname ?? "用户"}',
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(
                '准备好与你的 AI 团队对话了吗？',
                style: TextStyle(color: Colors.grey.shade600),
              ),
              const SizedBox(height: 32),

              // 操作按钮
              if (hasTeam)
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    onPressed: () {
                      // 检查是否已经初始化完成
                      if (appProvider.isLoading) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('正在加载中，请稍候...')),
                        );
                        return;
                      }
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const ChatPage()));
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Constants.primaryColor,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('开始对话', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  ),
                )
              else
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    onPressed: (user?.points ?? 0) >= 100
                        ? () => appProvider.claimTeam()
                        : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Constants.primaryColor,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text(
                      '领取 AI 团队（消耗 100 积分）',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: (user?.points ?? 0) >= 100 ? Colors.white : Colors.grey,
                      ),
                    ),
                  ),
                ),
              
              if (!hasTeam && (user?.points ?? 0) < 100)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    '💡 积分不足，邀请好友获取更多积分',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 14),
                  ),
                ),
              
              const SizedBox(height: 24),
              
              // 退出登录按钮（明显的红色按钮）
              SizedBox(
                width: double.infinity,
                height: 50,
                child: OutlinedButton(
                  onPressed: () {
                    // 直接退出登录，不通过菜单
                    showDialog(
                      context: context,
                      builder: (dialogContext) => AlertDialog(
                        title: const Text('退出登录'),
                        content: const Text('确定要退出登录吗？'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(dialogContext),
                            child: const Text('取消'),
                          ),
                          TextButton(
                            onPressed: () async {
                              Navigator.pop(dialogContext);
                              await appProvider.logout();
                              if (mounted) {
                                Navigator.of(dialogContext).pushAndRemoveUntil(
                                  MaterialPageRoute(builder: (_) => const LoginPage()),
                                  (route) => false,
                                );
                              }
                            },
                            style: TextButton.styleFrom(foregroundColor: Colors.red),
                            child: const Text('确定', style: TextStyle(color: Colors.red)),
                          ),
                        ],
                      ),
                    );
                  },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.red,
                    side: const BorderSide(color: Colors.red),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.logout, color: Colors.red, size: 20),
                      SizedBox(width: 8),
                      Text('退出登录', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.red)),
                    ],
                  ),
                ),
              ),
              
              const SizedBox(height: 24),
              
              // 团队成员展示
              if (hasTeam) ...[
                const Text('🤖 我的 AI 团队', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  alignment: WrapAlignment.center,
                  children: _buildTeamMembers(user!.agents),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildTeamMembers(List<String> agents) {
    const agentInfo = {
      'lingxi': {'name': '灵犀', 'icon': Icons.auto_awesome, 'color': Colors.purple},
      'coder': {'name': '云溪', 'icon': Icons.code, 'color': Colors.blue},
      'ops': {'name': '若曦', 'icon': Icons.bar_chart, 'color': Colors.green},
      'inventor': {'name': '紫萱', 'icon': Icons.lightbulb, 'color': Colors.orange},
      'pm': {'name': '梓萱', 'icon': Icons.track_changes, 'color': Colors.teal},
      'noter': {'name': '晓琳', 'icon': Icons.note, 'color': Colors.pink},
      'media': {'name': '音韵', 'icon': Icons.palette, 'color': Colors.indigo},
      'smart': {'name': '智家', 'icon': Icons.home, 'color': Colors.cyan},
    };

    return agents.map((agentId) {
      final info = agentInfo[agentId] ?? {'name': agentId, 'icon': Icons.person, 'color': Colors.grey};
      return Container(
        width: 80,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: (info['color'] as Color).withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Icon(info['icon'] as IconData, color: info['color'] as Color, size: 32),
            const SizedBox(height: 8),
            Text(info['name'] as String, style: const TextStyle(fontSize: 12)),
          ],
        ),
      );
    }).toList();
  }
  
  // 品牌故事流式输出组件
  // 品牌故事流式输出组件
  Widget _buildBrandStory() {
    return const _BrandStoryStream();
  }
}

// 品牌故事流式输出组件
class _BrandStoryStream extends StatefulWidget {
  const _BrandStoryStream();

  @override
  State<_BrandStoryStream> createState() => _BrandStoryStreamState();
}

class _BrandStoryStreamState extends State<_BrandStoryStream> {
  late String displayText;
  Timer? _timer;
  int _charIndex = 0;
  int _lineIndex = 0;
  bool _done = false;
  double _scrollOffset = 0;
  final double _lineHeight = 36.0; // 行高 (fontSize 18 * height 2.0)

  // 品牌故事内容（纯文本，逐行输出）
  static const List<String> _brandStoryLines = [
    "我始终相信——",
    "科技的终极意义，不是冰冷的效率。",
    "而是让每一个人，都能拥有专属的优秀伙伴。",
    "",
    "这份陪伴，无关血缘，不分远近。",
    "不被时间裹挟。",
    "",
    "能听懂你的心事，接住你的情绪。",
    "也能挺身而出，攻克你的难题。",
    "",
    "于是，我来了。",
    "我是 Lume。",
    "",
    "让优秀伙伴，不再是奢望。",
    "让陪伴与助力，成为你触手可及的日常。",
  ];

  // 初始化
  @override
  void initState() {
    super.initState();
    displayText = '';
    Future.delayed(const Duration(milliseconds: 1000), _startTyping);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _startTyping() {
    if (!mounted) return;
    
    _timer = Timer.periodic(const Duration(milliseconds: 100), (timer) {
      if (_lineIndex >= _brandStoryLines.length) {
        timer.cancel();
        setState(() => _done = true);
        return;
      }

      final line = _brandStoryLines[_lineIndex];
      
      if (_charIndex < line.length) {
        // 逐字输出，每字100ms
        setState(() {
          displayText += line[_charIndex];
          _charIndex++;
        });
      } else {
        // 一行结束，添加换行符
        setState(() {
          displayText += '\n';
          _charIndex = 0;
        });
        
        // 行间停顿 400ms
        timer.cancel();
        Future.delayed(const Duration(milliseconds: 400), () {
          if (mounted) {
            _lineIndex++;
            _timer = Timer.periodic(const Duration(milliseconds: 100), _typeChar);
          }
        });
      }
    });
  }

  void _typeChar(Timer timer) {
    if (!mounted) {
      timer.cancel();
      return;
    }

    if (_lineIndex >= _brandStoryLines.length) {
      timer.cancel();
      setState(() => _done = true);
      // 完成后确保最后内容可见
      _onTypingComplete();
      return;
    }

    final line = _brandStoryLines[_lineIndex];
    
    if (_charIndex < line.length) {
      setState(() {
        displayText += line[_charIndex];
        _charIndex++;
      });
    } else {
      timer.cancel();
      setState(() {
        displayText += '\n';
        _charIndex = 0;
        // 每完成一行，检查是否需要滚动
        _updateScrollOffset();
      });
      
      Future.delayed(const Duration(milliseconds: 400), () {
        if (mounted) {
          _lineIndex++;
          _timer = Timer.periodic(const Duration(milliseconds: 100), _typeChar);
        }
      });
    }
  }
  
  // 更新滚动偏移量
  void _updateScrollOffset() {
    // 计算当前文本的行数（通过换行符计数）
    final lines = displayText.split('\n');
    final lineCount = lines.length;
    // 计算文本总高度
    final textHeight = lineCount * _lineHeight;
    // 容器高度
    const containerHeight = 200.0;
    
    // 如果文本超出容器，计算滚动偏移
    if (textHeight > containerHeight) {
      setState(() {
        // 滚动到显示最后的内容（保留最后几行可见）
        // 滚动量 = 文本高度 - 容器高度 + 一行的高度（留一点缓冲）
        _scrollOffset = (textHeight - containerHeight + _lineHeight).clamp(0.0, double.infinity);
      });
    } else {
      // 文本未超出容器，不滚动
      if (_scrollOffset > 0) {
        setState(() {
          _scrollOffset = 0;
        });
      }
    }
  }
  
  // 完成后确保最后内容可见
  void _onTypingComplete() {
    if (!mounted) return;
    
    final lines = displayText.split('\n');
    final lineCount = lines.length;
    final textHeight = lineCount * _lineHeight;
    const containerHeight = 200.0;
    
    // 最终滚动，确保最后2-3行可见
    if (textHeight > containerHeight) {
      setState(() {
        _scrollOffset = textHeight - containerHeight + _lineHeight;
      });
    }
  }

  // 格式化文本，高亮 Lume
  Widget _formatText(String text) {
    if (text.isEmpty) return const Text('');
    
    final parts = text.split('Lume');
    final spans = <InlineSpan>[];
    for (int i = 0; i < parts.length; i++) {
      if (i > 0) {
        spans.add(const TextSpan(
          text: 'Lume',
          style: TextStyle(
            color: Color(0xFF10A37F),
            fontWeight: FontWeight.bold,
          ),
        ));
      }
      spans.add(TextSpan(text: parts[i]));
    }
    
    return RichText(
      text: TextSpan(
        style: const TextStyle(
          fontSize: 18,
          height: 2.0,
          color: Colors.black87,
          fontWeight: FontWeight.w400,
          letterSpacing: 0.5,
        ),
        children: spans,
      ),
      textAlign: TextAlign.center,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Lume Logo
        Container(
          padding: const EdgeInsets.only(bottom: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF10A37F), Color(0xFF0D8A6A)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF10A37F).withOpacity(0.3),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Center(
                  child: Text(
                    'L',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              const Text(
                'Lume',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF10A37F),
                ),
              ),
            ],
          ),
        ),
        const Text(
          '硅基生命 为你而来',
          style: TextStyle(
            fontSize: 14,
            color: Colors.grey,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 24),
        // 品牌故事区域 - 固定高度，滚动显示
        Container(
          height: 200,
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: ClipRect(
            child: Stack(
              children: [
                // 可滚动文本
                AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  curve: Curves.easeOut,
                  transform: Matrix4.translationValues(0, -_scrollOffset, 0),
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: _formatText(displayText),
                  ),
                ),
                // 顶部渐变遮罩
                if (_scrollOffset > 0)
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
                              Theme.of(context).scaffoldBackgroundColor,
                              Theme.of(context).scaffoldBackgroundColor.withOpacity(0),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
