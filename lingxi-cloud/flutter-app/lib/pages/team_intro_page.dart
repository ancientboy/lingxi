import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:provider/provider.dart';

/// 团队引导页（新用户领取团队）
class TeamIntroPage extends StatefulWidget {
  final VoidCallback onComplete;

  TeamIntroPage({super.key, required this.onComplete});

  @override
  State<TeamIntroPage> createState() => _TeamIntroPageState();
}

class _TeamIntroPageState extends State<TeamIntroPage>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;

  bool _isLoading = false;
  bool _showProgress = false;
  int _currentStep = 0; // 0=未开始，1=领取团队，2=创建服务器，3=安装环境，4=启动服务，5=完成
  String _statusText = '';
  String? _taskId;

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
      duration: Duration(milliseconds: 1500),
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

  // 领取团队（带进度展示）
  Future<void> _claimTeam() async {
    setState(() {
      _isLoading = true;
      _showProgress = true;
      const _currentStep = 1;
      _statusText = '正在分配 AI 成员...';
    });

    try {
      // 第一步：调用领取团队 API
      final apiService = ApiService();
      final response = await apiService.post('/api/auth/claim-team');
      final data = response.data;

      if (data['success'] == true) {
        setState(() {
          const _currentStep = 1; // 完成第一步
          _statusText = '✅ 团队已分配，正在创建服务器...';
        });

        // 如果服务器已就绪，直接完成
        if (data['status'] == 'ready' && data['openclawUrl'] != null) {
          setState(() {
            const _currentStep = 5;
            _statusText = '✅ 部署完成！';
          });
          await Future.delayed(Duration(seconds: 1));
          if (mounted) widget.onComplete();
          return;
        }

        // 需要轮询部署状态
        if (data['taskId'] != null) {
          setState(() => _taskId = data['taskId']);
          await _pollDeployStatus();
        }
      } else {
        throw Exception(data['error'] ?? '领取失败');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _showProgress = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('领取失败：$e')),
        );
      }
    }
  }

  // 轮询部署状态
  Future<void> _pollDeployStatus() async {
    const maxPolls = 180; // 最多轮询 3 分钟
    const pollInterval = Duration(seconds: 2);

    for (int i = 0; i < maxPolls; i++) {
      if (!mounted) return;

      try {
        final apiService = ApiService();
        final response = await apiService.get('/api/deploy/task/$_taskId');
        final data = response.data;

        if (data['success'] == true && data['task'] != null) {
          final task = data['task'];
          final progress = (task['progress'] as num).clamp(0, 100).toInt();
          final status = task['status'];

          // 根据进度更新步骤和状态文字
          if (progress < 5) {
            setState(() {
              const _currentStep = 1;
              _statusText = '正在验证信息...';
            });
          } else if (progress < 10) {
            setState(() {
              const _currentStep = 1;
              _statusText = '正在生成配置包...';
            });
          } else if (progress < 20) {
            setState(() {
              const _currentStep = 2;
              _statusText = '正在创建云服务器...';
            });
          } else if (progress < 60) {
            setState(() {
              const _currentStep = 2;
              _statusText = '等待服务器启动...';
            });
          } else if (progress < 65) {
            setState(() {
              const _currentStep = 2;
              _statusText = '等待 SSH 就绪...';
            });
          } else if (progress < 70) {
            setState(() {
              const _currentStep = 3;
              _statusText = '正在上传部署包...';
            });
          } else if (progress < 95) {
            setState(() {
              const _currentStep = 3;
              _statusText = '正在安装 OpenClaw...';
            });
          } else if (progress < 100) {
            setState(() {
              const _currentStep = 4;
              _statusText = '验证服务状态...';
            });
          } else {
            setState(() {
              const _currentStep = 5;
              _statusText = '✅ 部署完成！';
            });
          }

          // 部署失败
          if (status == 'failed') {
            throw Exception(task['errorMessage'] ?? '部署失败');
          }

          // 部署完成
          if (status == 'success') {
            await Future.delayed(Duration(seconds: 1));
            if (mounted) {
              widget.onComplete();
            }
            return;
          }
        }
      } catch (e) {
        debugPrint('轮询错误：$e');
      }

      await Future.delayed(pollInterval);
    }

    // 超时
    if (mounted) {
      throw Exception('部署超时，请联系客服');
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
                ? [Color(0xFF1B2838), Color(0xFF090A0F)]
                : [Color(0xFFf0fdf4), Color(0xFFdcfce7)],
          ),
        ),
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.all(24),
              child: Column(
                children: [
                  SizedBox(height: 40),

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
                    child: Center(
                      child: Text(
                        '◈',
                        style: TextStyle(fontSize: 32, color: Colors.white),
                      ),
                    ),
                  ),

                  SizedBox(height: 24),

                  // 标题
                  ShaderMask(
                    shaderCallback: (bounds) => LinearGradient(
                      colors: isDarkMode
                          ? [Colors.white, Constants.primaryColor]
                          : [Constants.primaryColor, Constants.secondaryColor],
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

                  SizedBox(height: 8),

                  Text(
                    '8 位硅基伙伴，为你而来',
                    style: TextStyle(
                      fontSize: 16,
                      color: isDarkMode ? Colors.white70 : Colors.grey.shade600,
                    ),
                  ),

                  SizedBox(height: 40),

                  // 团队成员网格
                  GridView.builder(
                    shrinkWrap: true,
                    physics: NeverScrollableScrollPhysics(),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
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

                  SizedBox(height: 40),

                  // 领取条件提示
                  Container(
                    padding: EdgeInsets.all(16),
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
                            SizedBox(width: 8),
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
                        SizedBox(height: 8),
                        Text(
                          '订阅用户 或 累计消耗 ≥5000 积分',
                          style: TextStyle(
                            fontSize: 13,
                            color: isDarkMode ? Colors.white70 : Colors.grey.shade600,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          '当前积分：${user?.points ?? 0} / 5000',
                          style: TextStyle(
                            fontSize: 12,
                            color: (user?.points ?? 0) >= 5000 ? Colors.green : Colors.orange,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),

                  SizedBox(height: 32),

                  // 部署进度（领取时显示）
                  if (_showProgress) ...[
                    _buildDeployProgress(isDarkMode),
                    SizedBox(height: 32),
                  ],

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
                          ? SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : Text(
                              '领取 AI 团队',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                    ),
                  ),

                  SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  // 构建部署进度组件
  Widget _buildDeployProgress(bool isDarkMode) {
    return Container(
      padding: EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: (isDarkMode ? Colors.white : Colors.black).withOpacity(0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Constants.primaryColor.withOpacity(0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 标题
          Row(
            children: [
              Icon(Icons.hourglass_empty, size: 20, color: Constants.primaryColor),
              SizedBox(width: 8),
              Text(
                '部署进度',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: isDarkMode ? Colors.white : Colors.black87,
                ),
              ),
            ],
          ),
          SizedBox(height: 20),

          // 步骤列表
          _buildStepItem(1, '领取 AI 团队', isDarkMode),
          _buildStepItem(2, '创建专属服务器', isDarkMode),
          _buildStepItem(3, '安装运行环境', isDarkMode),
          _buildStepItem(4, '启动 AI 服务', isDarkMode),

          SizedBox(height: 16),

          // 当前状态
          if (_statusText.isNotEmpty)
            Container(
              padding: EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Constants.primaryColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(Constants.primaryColor),
                    ),
                  ),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _statusText,
                      style: TextStyle(
                        fontSize: 13,
                        color: Constants.primaryColor,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // 构建单个步骤项
  Widget _buildStepItem(int step, String text, bool isDarkMode) {
    final isCompleted = _currentStep > step;
    final isCurrent = _currentStep == step;

    return Padding(
      padding: EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          // 状态图标
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: isCompleted
                  ? Constants.primaryColor
                  : isCurrent
                      ? Constants.primaryColor.withOpacity(0.2)
                      : (isDarkMode ? Colors.white : Colors.black).withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: isCompleted
                  ? Icon(Icons.check, size: 16, color: Colors.white)
                  : isCurrent
                      ? Text(
                          '$step',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Constants.primaryColor,
                          ),
                        )
                      : Text(
                          '$step',
                          style: TextStyle(
                            fontSize: 12,
                            color: isDarkMode ? Colors.white54 : Colors.black54,
                          ),
                        ),
            ),
          ),
          SizedBox(width: 12),
          // 文字
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 14,
                fontWeight: isCurrent ? FontWeight.w600 : FontWeight.normal,
                color: isCompleted || isCurrent
                    ? (isDarkMode ? Colors.white : Colors.black87)
                    : (isDarkMode ? Colors.white38 : Colors.black38),
              ),
            ),
          ),
          // 连接线
          if (step < 4)
            Container(
              width: 2,
              height: 24,
              margin: EdgeInsets.only(left: 13),
              color: isCompleted
                  ? Constants.primaryColor
                  : (isDarkMode ? Colors.white : Colors.black).withOpacity(0.1),
            ),
        ],
      ),
    );
  }

  // 构建成员卡片
  Widget _buildMemberCard(Map<String, dynamic> member, bool isDarkMode) {
    return Container(
      padding: EdgeInsets.all(12),
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
          SizedBox(width: 12),
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
                SizedBox(height: 2),
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
