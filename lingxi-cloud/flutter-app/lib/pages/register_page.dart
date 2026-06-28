import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'dart:convert';

class RegisterPage extends StatefulWidget {
  RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _formKey = GlobalKey<FormState>();
  final _inviteCodeController = TextEditingController();
  final _nicknameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _emailController = TextEditingController();
  final _verifyCodeController = TextEditingController();
  
  bool _isLoading = false;
  bool _obscurePassword = true;
  bool _isSendingCode = false;
  int _countdown = 0;
  
  @override
  void dispose() {
    _inviteCodeController.dispose();
    _nicknameController.dispose();
    _passwordController.dispose();
    _emailController.dispose();
    _verifyCodeController.dispose();
    super.dispose();
  }

  // 验证邮箱格式
  bool _validateEmail() {
    final email = _emailController.text.trim();
    final emailRegex = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
    
    if (email.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('请输入邮箱地址'),
          backgroundColor: Constants.errorColor,
        ),
      );
      return false;
    }
    
    if (!emailRegex.hasMatch(email)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('邮箱格式不正确'),
          backgroundColor: Constants.errorColor,
        ),
      );
      return false;
    }
    
    return true;
  }

  // 发送验证码
  Future<void> _sendVerificationCode() async {
    if (!_validateEmail()) return;
    if (_countdown > 0) return;

    setState(() {
      _isSendingCode = true;
    });

    try {
      final response = await ApiService().post(
        '/api/auth/send-code',
        data: {
          'email': _emailController.text.trim(),
          'type': 'register',
        },
      );

      final data = response.data;
      
      if (data['success'] == true) {
        // 开始倒计时
        setState(() {
          _countdown = 60;
        });
        
        // 倒计时定时器
        _startCountdown();

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('验证码已发送，请检查邮箱'),
              backgroundColor: Constants.secondaryColor,
            ),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(data['error'] ?? '发送失败'),
              backgroundColor: Constants.errorColor,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('发送失败：${e.toString()}'),
            backgroundColor: Constants.errorColor,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSendingCode = false;
        });
      }
    }
  }

  void _startCountdown() {
    Future.doWhile(() async {
      await Future.delayed(Duration(seconds: 1));
      if (mounted && _countdown > 0) {
        setState(() {
          _countdown--;
        });
        return true;
      }
      return false;
    });
  }

  // 注册
  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;

    // 验证邮箱
    if (!_validateEmail()) return;

    // 验证验证码
    if (_verifyCodeController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('请填写邮箱验证码'),
          backgroundColor: Constants.errorColor,
        ),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final response = await ApiService().post(
        '/api/auth/register',
        data: {
          'inviteCode': _inviteCodeController.text.trim(),
          'nickname': _nicknameController.text.trim(),
          'password': _passwordController.text,
          'email': _emailController.text.trim(),
          'code': _verifyCodeController.text.trim(),
        },
      );

      final data = response.data;
      
      if (data['success'] == true) {
        // 注册成功后，清理旧的 WebSocket 连接和本地存储
        await ApiService().clearAuth();
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('注册成功！请登录'),
              backgroundColor: Constants.secondaryColor,
            ),
          );
          
          // 返回登录页
          Navigator.of(context).pop(true);
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(data['error'] ?? '注册失败'),
              backgroundColor: Constants.errorColor,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('注册失败：${e.toString()}'),
            backgroundColor: Constants.errorColor,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // 对齐 Web 端：暖色调奶油白背景
    const bgColor = Color(0xFFFBFAF8);
    const textPrimary = Color(0xFF1A1A1A);
    const textSecondary = Color(0xFF525252);
    const textTertiary = Color(0xFF8A8A8A);
    const borderColor = Color(0xFFE8E6E1);
    const inputBg = Color(0xFFF3F1EC);

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: textPrimary, size: 20),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          '注册',
          style: TextStyle(color: textPrimary, fontSize: 17, fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.symmetric(horizontal: 32, vertical: 24),
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: 400),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Logo
                    Center(
                      child: Column(
                        children: [
                          Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(
                              color: Color(0xFFF7F4EF),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Center(
                              child: Image.asset(
                                'assets/images/lume_logo.png',
                                width: 40,
                                height: 40,
                                errorBuilder: (_, __, ___) => Icon(
                                  Icons.person_add_rounded,
                                  size: 28,
                                  color: textPrimary,
                                ),
                              ),
                            ),
                          ),
                          SizedBox(height: 16),
                          Text(
                            '创建 Lume 账号',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w500,
                              color: textPrimary,
                              letterSpacing: -0.3,
                              fontFamily: 'Georgia',
                            ),
                          ),
                          SizedBox(height: 6),
                          Text(
                            '加入你的 AI 团队',
                            style: TextStyle(
                              fontSize: 14,
                              color: textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    SizedBox(height: 36),

                    // 邀请码
                    _buildInputField(
                      controller: _inviteCodeController,
                      label: '邀请码（可选）',
                      hint: '输入邀请码',
                      icon: Icons.card_giftcard_outlined,
                      bgColor: bgColor,
                      borderColor: borderColor,
                      inputBg: inputBg,
                      textPrimary: textPrimary,
                      textTertiary: textTertiary,
                    ),
                    SizedBox(height: 16),

                    // 昵称
                    _buildInputField(
                      controller: _nicknameController,
                      label: '昵称',
                      hint: '请输入昵称',
                      icon: Icons.person_outline_rounded,
                      bgColor: bgColor,
                      borderColor: borderColor,
                      inputBg: inputBg,
                      textPrimary: textPrimary,
                      textTertiary: textTertiary,
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return '请输入昵称';
                        }
                        if (value.trim().length < 2) {
                          return '昵称至少 2 个字符';
                        }
                        return null;
                      },
                    ),
                    SizedBox(height: 16),

                    // 邮箱
                    _buildInputField(
                      controller: _emailController,
                      label: '邮箱',
                      hint: 'your@email.com',
                      icon: Icons.email_outlined,
                      bgColor: bgColor,
                      borderColor: borderColor,
                      inputBg: inputBg,
                      textPrimary: textPrimary,
                      textTertiary: textTertiary,
                      keyboardType: TextInputType.emailAddress,
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return '请输入邮箱';
                        }
                        final emailRegex = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
                        if (!emailRegex.hasMatch(value)) {
                          return '邮箱格式不正确';
                        }
                        return null;
                      },
                    ),
                    SizedBox(height: 16),

                    // 验证码行
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: _buildInputField(
                            controller: _verifyCodeController,
                            label: '验证码',
                            hint: '6 位验证码',
                            icon: Icons.security_outlined,
                            bgColor: bgColor,
                            borderColor: borderColor,
                            inputBg: inputBg,
                            textPrimary: textPrimary,
                            textTertiary: textTertiary,
                            keyboardType: TextInputType.number,
                            maxLength: 6,
                          ),
                        ),
                        SizedBox(width: 10),
                        SizedBox(
                          height: 48,
                          child: ElevatedButton(
                            onPressed: _countdown > 0 ? null : _sendVerificationCode,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: textPrimary,
                              foregroundColor: Colors.white,
                              elevation: 0,
                              padding: EdgeInsets.symmetric(horizontal: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                              disabledBackgroundColor: textPrimary.withOpacity(0.4),
                            ),
                            child: Text(
                              _isSendingCode
                                  ? '发送中...'
                                  : (_countdown > 0 ? '${_countdown}s' : '发送'),
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 16),

                    // 密码
                    _buildInputField(
                      controller: _passwordController,
                      label: '密码',
                      hint: '至少 6 位',
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
                          return '密码至少 6 位';
                        }
                        return null;
                      },
                    ),
                    SizedBox(height: 28),

                    // 注册按钮
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton(
                        onPressed: _isLoading ? null : _register,
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
                                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                ),
                              )
                            : Text(
                                '注册',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 0.3,
                                ),
                              ),
                      ),
                    ),
                    SizedBox(height: 24),

                    // 返回登录
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          '已有账号？',
                          style: TextStyle(color: textTertiary, fontSize: 14),
                        ),
                        GestureDetector(
                          onTap: () => Navigator.of(context).pop(),
                          child: Text(
                            '去登录',
                            style: TextStyle(
                              color: textPrimary,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              decoration: TextDecoration.underline,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
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
    TextInputType? keyboardType,
    int? maxLength,
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
          keyboardType: keyboardType,
          maxLength: maxLength,
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
            counterText: '', // 隐藏 maxLength 计数
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
