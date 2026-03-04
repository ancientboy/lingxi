import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:lingxicloud/pages/login_page.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  final _passwordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _passwordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  void _showChangePasswordDialog() {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('修改密码'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // 当前密码
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: '当前密码',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                // 新密码
                TextField(
                  controller: _newPasswordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: '新密码',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                // 确认新密码
                TextField(
                  controller: _confirmPasswordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: '确认新密码',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('取消'),
            ),
            TextButton(
              onPressed: _isLoading ? null : () async {
                final currentPassword = _passwordController.text.trim();
                final newPassword = _newPasswordController.text.trim();
                final confirmPassword = _confirmPasswordController.text.trim();

                // 验证输入
                if (currentPassword.isEmpty || newPassword.isEmpty || confirmPassword.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('请填写所有字段')),
                  );
                  return;
                }

                if (newPassword != confirmPassword) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('新密码和确认密码不一致')),
                  );
                  return;
                }

                if (newPassword.length < 6) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('密码长度至少为 6 位')),
                  );
                  return;
                }

                setState(() {
                  _isLoading = true;
                });

                // 调用 API
                try {
                  final apiService = ApiService();
                  final response = await apiService.post(
                    '/api/auth/change-password',
                    data: {
                      'currentPassword': currentPassword,
                      'newPassword': newPassword,
                    },
                  );

                  final data = response.data;
                  if (data['success'] == true || data['success'] == true) {
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('密码修改成功')),
                    );
                    // 清空输入框
                    _passwordController.clear();
                    _newPasswordController.clear();
                    _confirmPasswordController.clear();
                  } else {
                    final errorMsg = data['error'] ?? data['message'] ?? '密码修改失败';
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(errorMsg)),
                    );
                  }
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('网络错误: ${e.toString()}')),
                  );
                } finally {
                  if (mounted) {
                    setState(() {
                      _isLoading = false;
                    });
                  }
                }
              },
              child: _isLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('确认'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('设置'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 头像和基本信息
          Consumer<AppProvider>(
            builder: (context, appProvider, child) {
              if (appProvider.user == null) {
                return const SizedBox.shrink();
              }
              final user = appProvider.user!;
              final isDarkMode = Theme.of(context).brightness == Brightness.dark;
              return Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: isDarkMode ? const Color(0xFF2D2D2D) : Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.05),
                      blurRadius: 10,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 40,
                      backgroundColor: Constants.primaryColor.withOpacity(0.1),
                      child: Text(
                        user.nickname.isNotEmpty
                            ? user.nickname.substring(0, 1).toUpperCase()
                            : 'U',
                        style: const TextStyle(
                          fontSize: 40,
                          fontWeight: FontWeight.bold,
                          color: Constants.primaryColor,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      user.nickname,
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: isDarkMode ? Colors.white : null,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '积分: ${user.points}',
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(
                            color: isDarkMode ? Colors.white70 : Constants.textSecondaryColor,
                          ),
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 24),
          // 设置项
          const Text(
            '通用设置',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Consumer<AppProvider>(
            builder: (context, appProvider, child) {
              return _SettingCard(
                title: '主题模式',
                subtitle: appProvider.isDarkMode ? '深色' : '浅色',
                icon: appProvider.isDarkMode ? Icons.dark_mode : Icons.light_mode,
                onTap: () {
                  appProvider.toggleTheme();
                },
              );
            },
          ),
          _SettingCard(
            title: '语言',
            subtitle: '简体中文',
            icon: Icons.language_outlined,
            onTap: () {
              // TODO: 实现语言切换
            },
          ),
          _SettingCard(
            title: '通知',
            subtitle: '开启',
            icon: Icons.notifications_outlined,
            onTap: () {
              // TODO: 实现通知设置
            },
          ),
          const SizedBox(height: 24),
          const Text(
            '聊天设置',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          _SettingCard(
            title: '自动滚动',
            subtitle: '开启',
            icon: Icons.auto_awesome_outlined,
            onTap: () {
              // TODO: 实现自动滚动设置
            },
          ),
          _SettingCard(
            title: '消息保存时间',
            subtitle: '30 天',
            icon: Icons.save_outlined,
            onTap: () {
              // TODO: 实现消息保存时间设置
            },
          ),
          const SizedBox(height: 24),
          const Text(
            '账户',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          _SettingCard(
            title: '修改密码',
            icon: Icons.lock_outline,
            onTap: _showChangePasswordDialog,
          ),
          _SettingCard(
            title: '退出登录',
            icon: Icons.logout_outlined,
            isDestructive: true,
            onTap: () {
              showConfirmDialog(context, '确认退出登录吗？', () {
                Provider.of<AppProvider>(context, listen: false).logout();
              });
            },
          ),
        ],
      ),
    );
  }

  void showConfirmDialog(
    BuildContext context,
    String message,
    VoidCallback onConfirm,
  ) async {
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;
    await showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('确认'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('取消', style: TextStyle(color: isDarkMode ? Colors.white70 : null)),
          ),
          TextButton(
            onPressed: () async {
              onConfirm();
              Navigator.pop(dialogContext);
              // 等待登出完成后再跳转
              await Future.delayed(const Duration(milliseconds: 100));
              if (context.mounted) {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const LoginPage()),
                  (route) => false,
                );
              }
            },
            style: TextButton.styleFrom(
              foregroundColor: Constants.errorColor,
            ),
            child: const Text('确认'),
          ),
        ],
      ),
    );
  }
}

class _SettingCard extends StatelessWidget {
  final String title;
  final String? subtitle;
  final IconData icon;
  final bool isDestructive;
  final VoidCallback onTap;

  const _SettingCard({
    required this.title,
    this.subtitle,
    required this.icon,
    this.isDestructive = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDarkMode ? const Color(0xFF2D2D2D) : Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ListTile(
        leading: Icon(
          icon,
          color: isDestructive ? Constants.errorColor : Constants.textPrimaryColor,
        ),
        title: Text(
          title,
          style: TextStyle(
            fontWeight: FontWeight.w500,
            color: isDarkMode ? Colors.white : null,
          ),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (subtitle != null)
              Text(
                subtitle!,
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(
                      color: isDarkMode ? Colors.white70 : Constants.textSecondaryColor,
                    ),
              ),
            const SizedBox(width: 8),
            Icon(
              Icons.chevron_right_outlined,
              color: isDarkMode ? Colors.white30 : Constants.textLightColor,
              size: 20,
            ),
          ],
        ),
        onTap: onTap,
      ),
    );
  }
}
