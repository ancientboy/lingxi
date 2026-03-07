import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:provider/provider.dart';

/// 团队引导页（新用户领取团队）
class TeamIntroPage extends StatefulWidget {
  final VoidCallback onComplete;

  const TeamIntroPage({super.key, required this.onComplete});

  @override
  State<TeamIntroPage> createState() => _TeamIntroPageState();
}

class _TeamIntroPageState extends State<TeamIntroPage>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;

  bool _isLoading = false;

  // 团队成员信息
  final List<Map<String, dynamic>> _teamMembers = [
    {'id': 'lingxi', 'name': '灵犀', 'role': '队长 · 智能调度', 'icon': Icons.auto_awesome, 'color': Colors.purple},
    {'id': 'coder', 'name': '云溪', 'role': '编程 · 代码专家', 'icon': Icons.code, 'color': Colors.blue},
    {'id': 'ops', 'name': '若曦', 'role': '数据 · 增长运营', 'icon': Icons.bar_chart, 'color': Colors.green},
    {'id': 'inventor', 'name': '紫萱', 'role': '创意 · 文案总监', 'icon': Icons.lightbulb, 'color': Colors.orange},
    {'id': 'pm', 'name': '梓萱', 'role': '产品 · 需求分析', 'icon': Icons.track_changes, 'color': Colors.teal},
    {'id': 'noter', 'name': '晓琳', 'role': '笔记 · 翻译整理', 'icon': Icons.note, 'color': Colors.pink},
    {'id': 'media', 'name': '音韵', 'role': '媒体 · 视频设计', 'icon': Icons.palette, 'color': Colors.indigo},
    {'id': 'smart', 'name': '智家', 'role': '自动化 · 脚本工具', 'icon': Icons.home, 'color': Colors.cyan},
  ];

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  // 领取团队
  Future<void> _claimTeam() async {
    setState(() => _isLoading = true);

    try {
      final appProvider = Provider.of<AppProvider>(context, listen: false);

      // TODO: 调用后端 API 领取团队
      // final success = await appProvider.claimTeam();

      // 模拟 API 调用
      await Future.delayed(const Duration(seconds: 2));

      if (mounted) {
        // 领取成功
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('🎉 成功领取 AI 团队！')),
        );

        // 完成引导
        widget.onComplete();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('领取失败: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final appProvider = Provider.of<AppProvider>(context);
    final user = appProvider.user;
    final isDarkMode = appProvider.isDarkMode;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: Alignment.bottomCenter,
            colors: isDarkMode
                ? [const Color(0xFF1B2838), const Color(0xFF090A0F)]
                : [const Color(0xFFf0fdf4), const Color(0xFFdcfce7)],
          ),
        ),
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  const SizedBox(height: 40),

                  // Logo
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: Constants.primaryColor,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Constants.primaryColor.withOpacity(0.5),
                          blurRadius: 30,
                          spreadRadius: 5,
                        ),
                      ],
                    ),
                    child: const Center(
                      child: Text(
                        '◈',
                        style: TextStyle(fontSize: 32, color: Colors.white),
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // 标题
                  ShaderMask(
                    shaderCallback: (bounds) => LinearGradient(
                      colors: isDarkMode
                          ? [Colors.white, Constants.primaryColor]
                          : [Constants.primaryColor, const Color(0xFF0d8a6a)],
                    ).createShader(bounds),
                    child: Text(
                      '认识你的 AI 团队',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: isDarkMode ? Colors.white : Constants.primaryColor,
                      ),
                    ),
                  ),

                  const SizedBox(height: 8),

                  Text(
                    '8 位硅基伙伴，为你而来',
                    style: TextStyle(
                      fontSize: 16,
                      color: isDarkMode ? Colors.white70 : Colors.grey.shade600,
                    ),
                  ),

                  const SizedBox(height: 40),

                  // 团队成员网格
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      childAspectRatio: 2.5,
                    ),
                    itemCount: _teamMembers.length,
                    itemBuilder: (context, index) {
                      final member = _teamMembers[index];
                      return _buildMemberCard(member, isDarkMode);
                    },
                  ),

                  const SizedBox(height: 40),

                  // 领取条件提示
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: (isDarkMode ? Colors.white : Colors.black).withOpacity(0.05),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: (isDarkMode ? Colors.white : Colors.black).withOpacity(0.1),
                      ),
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.info_outline, size: 18, color: Colors.orange),
                            const SizedBox(width: 8),
                            Text(
                              '领取条件',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: isDarkMode ? Colors.white : Colors.black87,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '订阅用户 或 累计消耗 ≥5000 积分',
                          style: TextStyle(
                            fontSize: 13,
                            color: isDarkMode ? Colors.white70 : Colors.grey.shade600,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '当前积分: ${user?.points ?? 0} / 5000',
                          style: TextStyle(
                            fontSize: 12,
                            color: (user?.points ?? 0) >= 5000 ? Colors.green : Colors.orange,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 32),

                  // 操作按钮
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _claimTeam,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Constants.primaryColor,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: _isLoading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : const Text(
                              '领取 AI 团队',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                    ),
                  ),

                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  // 构建成员卡片
  Widget _buildMemberCard(Map<String, dynamic> member, bool isDarkMode) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: (member['color'] as Color).withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: (member['color'] as Color).withOpacity(0.3),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: (member['color'] as Color).withOpacity(0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              member['icon'] as IconData,
              color: member['color'] as Color,
              size: 24,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  member['name'] as String,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: isDarkMode ? Colors.white : Colors.black87,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  member['role'] as String,
                  style: TextStyle(
                    fontSize: 11,
                    color: isDarkMode ? Colors.white54 : Colors.grey.shade600,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
