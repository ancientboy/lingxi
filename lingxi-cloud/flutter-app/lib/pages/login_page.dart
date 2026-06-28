import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/pages/main_shell.dart';
import 'package:lingxicloud/pages/team_intro_page.dart';
import 'package:lingxicloud/pages/register_page.dart';

class LoginPage extends StatefulWidget {
  LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _nicknameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _nicknameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_formKey.currentState!.validate()) {
      setState(() {
        _isLoading = true;
      });

      final appProvider = Provider.of<AppProvider>(context, listen: false);
      final success = await appProvider.login(
        _nicknameController.text.trim(),
        _passwordController.text,
      );

      if (mounted) {
        setState(() {
          _isLoading = false;
        });

        if (success) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => MainShell()),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(appProvider.error ?? '登录失败'),
              backgroundColor: Constants.errorColor,
            ),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Web 端对齐：暖色调奶油白背景，无渐变
    const bgColor = Color(0xFFFBFAF8);
    const textPrimary = Color(0xFF1A1A1A);
    const textSecondary = Color(0xFF525252);
    const textTertiary = Color(0xFF8A8A8A);
    const borderColor = Color(0xFFE8E6E1);
    const inputBg = Color(0xFFF3F1EC);
    
    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.symmetric(horizontal: 32, vertical: 48),
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: 400),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Logo + Brand
                  Center(
                    child: Column(
                      children: [
                        // Lume Logo
                        Container(
                          width: 72,
                          height: 72,
                          decoration: BoxDecoration(
                            color: Color(0xFFF7F4EF),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Center(
                            child: Image.asset(
                              'assets/images/lume_logo.png',
                              width: 52,
                              height: 52,
                              errorBuilder: (_, __, ___) => Icon(
                                Icons.auto_awesome,
                                size: 36,
                                color: textPrimary,
                              ),
                            ),
                          ),
                        ),
                        SizedBox(height: 20),
                        Text(
                          'Lume',
                          style: TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.w500,
                            color: textPrimary,
                            letterSpacing: -0.5,
                            fontFamily: 'Georgia',
                          ),
                        ),
                        SizedBox(height: 8),
                        Text(
                          'Your AI Team, One Click Away',
                          style: TextStyle(
                            fontSize: 15,
                            color: textSecondary,
                            height: 1.5,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                  SizedBox(height: 48),
                  
                  // Form
                  Form(
                    key: _formKey,
                    child: Column(
                      children: [
                        // 昵称输入
                        _buildInputField(
                          controller: _nicknameController,
                          label: '昵称',
                          hint: '请输入您的昵称',
                          icon: Icons.person_outline_rounded,
                          bgColor: bgColor,
                          borderColor: borderColor,
                          inputBg: inputBg,
                          textPrimary: textPrimary,
                          textTertiary: textTertiary,
                          validator: (value) {
                            if (value == null || value.isEmpty) {
                              return '请输入昵称';
                            }
                            return null;
                          },
                        ),
                        SizedBox(height: 16),
                        // 密码输入
                        _buildInputField(
                          controller: _passwordController,
                          label: '密码',
                          hint: '请输入密码',
                          icon: Icons.lock_outline_rounded,
                          obscureText: _obscurePassword,
                          bgColor: bgColor,
                          borderColor: borderColor,
                          inputBg: inputBg,
                          textPrimary: textPrimary,
                          textTertiary: textTertiary,
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePassword
                                  ? Icons.visibility_off_rounded
                                  : Icons.visibility_rounded,
                              color: textTertiary,
                              size: 20,
                            ),
                            onPressed: () {
                              setState(() {
                                _obscurePassword = !_obscurePassword;
                              });
                            },
                          ),
                          validator: (value) {
                            if (value == null || value.isEmpty) {
                              return '请输入密码';
                            }
                            if (value.length < 6) {
                              return '密码长度至少为 6 位';
                            }
                            return null;
                          },
                        ),
                        SizedBox(height: 24),
                        // 错误提示
                        Consumer<AppProvider>(
                          builder: (context, appProvider, child) {
                            if (appProvider.error == null || appProvider.error!.isEmpty) {
                              return SizedBox.shrink();
                            }
                            return Padding(
                              padding: EdgeInsets.only(bottom: 16),
                              child: Text(
                                appProvider.error!,
                                style: TextStyle(
                                  color: Color(0xFFDC3545),
                                  fontSize: 13,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            );
                          },
                        ),
                        // 登录按钮
                        SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: ElevatedButton(
                            onPressed: _isLoading ? null : _login,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: textPrimary,
                              foregroundColor: Colors.white,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              disabledBackgroundColor: textPrimary.withOpacity(0.5),
                            ),
                            child: _isLoading
                                ? SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      valueColor: AlwaysStoppedAnimation<Color>(
                                        Colors.white,
                                      ),
                                    ),
                                  )
                                : Text(
                                    '登录',
                                    style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: 0.3,
                                    ),
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(height: 32),
                  // 分隔线 + 注册
                  Row(
                    children: [
                      Expanded(child: Divider(color: borderColor)),
                      Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16),
                        child: Text(
                          '或',
                          style: TextStyle(
                            color: textTertiary,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      Expanded(child: Divider(color: borderColor)),
                    ],
                  ),
                  SizedBox(height: 24),
                  // 注册按钮
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: OutlinedButton(
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => RegisterPage()),
                        );
                      },
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(color: borderColor, width: 1),
                        foregroundColor: textPrimary,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: Text(
                        '注册新账号',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                  SizedBox(height: 32),
                  // 底部版本信息
                  Center(
                    child: Text(
                      'Lume v1.4.1',
                      style: TextStyle(
                        color: textTertiary,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
  
  Widget _buildInputField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    required Color bgColor,
    required Color borderColor,
    required Color inputBg,
    required Color textPrimary,
    required Color textTertiary,
    bool obscureText = false,
    Widget? suffixIcon,
    String? Function(String?)? validator,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: textPrimary,
          ),
        ),
        SizedBox(height: 8),
        TextFormField(
          controller: controller,
          obscureText: obscureText,
          style: TextStyle(
            fontSize: 15,
            color: textPrimary,
          ),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: textTertiary, fontSize: 15),
            prefixIcon: Icon(icon, color: textTertiary, size: 20),
            suffixIcon: suffixIcon,
            filled: true,
            fillColor: inputBg,
            contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: borderColor, width: 1),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: borderColor, width: 1),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: textPrimary, width: 1.5),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: Color(0xFFDC3545), width: 1),
            ),
          ),
          validator: validator,
        ),
      ],
    );
  }
}
