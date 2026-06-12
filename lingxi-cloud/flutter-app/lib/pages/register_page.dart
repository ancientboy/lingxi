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
          const _countdown = 60;
        });
        
        // 倒计时定时器
        Future.delayed(Duration(seconds: 1), () {
          if (mounted) {
            setState(() {
              _countdown--;
            });
            if (_countdown > 0) {
              Future.delayed(Duration(seconds: 1), () {
                // 递归调用继续倒计时
              });
            }
          }
        });

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
    return Scaffold(
      appBar: AppBar(
        title: Text('注册'),
        backgroundColor: Constants.primaryColor,
        foregroundColor: Colors.white,
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Constants.primaryColor,
              Color(0xFF4F46E5),
            ],
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.all(24),
            child: Container(
              width: 400,
              padding: EdgeInsets.all(32),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.1),
                    blurRadius: 20,
                    offset: Offset(0, 10),
                  ),
                ],
              ),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(
                      Icons.person_add,
                      size: 64,
                      color: Constants.primaryColor,
                    ),
                    SizedBox(height: 16),
                    Text(
                      '创建账号',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: Constants.primaryColor,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    SizedBox(height: 32),

                    // 邀请码（可选）
                    TextFormField(
                      controller: _inviteCodeController,
                      decoration: InputDecoration(
                        labelText: '邀请码（可选）',
                        prefixIcon: Icon(Icons.card_giftcard, color: Constants.primaryColor),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                    SizedBox(height: 16),

                    // 昵称
                    TextFormField(
                      controller: _nicknameController,
                      decoration: InputDecoration(
                        labelText: '昵称',
                        prefixIcon: Icon(Icons.person, color: Constants.primaryColor),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
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
                    TextFormField(
                      controller: _emailController,
                      decoration: InputDecoration(
                        labelText: '邮箱',
                        prefixIcon: Icon(Icons.email, color: Constants.primaryColor),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        hintText: 'your@email.com',
                      ),
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

                    // 发送验证码按钮
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '验证码',
                            style: TextStyle(
                              color: Colors.grey[600],
                              fontSize: 14,
                            ),
                          ),
                        ),
                        ElevatedButton(
                          onPressed: _countdown > 0 ? null : _sendVerificationCode,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Constants.primaryColor,
                            foregroundColor: Colors.white,
                            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          child: Text(
                            _isSendingCode 
                                ? '发送中...' 
                                : (_countdown > 0 ? '${_countdown}秒后重发' : '发送验证码'),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 8),

                    // 验证码输入框
                    TextFormField(
                      controller: _verifyCodeController,
                      decoration: InputDecoration(
                        labelText: '验证码',
                        prefixIcon: Icon(Icons.security, color: Constants.primaryColor),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        hintText: '输入 6 位验证码',
                      ),
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                    ),
                    SizedBox(height: 16),

                    // 密码
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      decoration: InputDecoration(
                        labelText: '密码',
                        prefixIcon: Icon(Icons.lock, color: Constants.primaryColor),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword ? Icons.visibility_off : Icons.visibility,
                            color: Constants.primaryColor,
                          ),
                          onPressed: () {
                            setState(() {
                              _obscurePassword = !_obscurePassword;
                            });
                          },
                        ),
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
                    SizedBox(height: 24),

                    // 注册按钮
                    ElevatedButton(
                      onPressed: _isLoading ? null : _register,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Constants.primaryColor,
                        foregroundColor: Colors.white,
                        padding: EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: _isLoading
                          ? SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : Text(
                              '注册',
                              style: TextStyle(fontSize: 18),
                            ),
                    ),
                    SizedBox(height: 16),

                    // 返回登录
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: Text(
                        '已有账号？去登录',
                        style: TextStyle(color: Constants.primaryColor),
                      ),
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
}
