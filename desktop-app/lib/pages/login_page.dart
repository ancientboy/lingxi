import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/app_config.dart';
import '../services/auth_service.dart';
import '../services/auth_storage.dart';
import '../theme/lume_theme.dart';
import '../widgets/lume_mark.dart';

enum _LoginStep { email, code, password }

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.onLoggedIn});

  final ValueChanged<AuthSession> onLoggedIn;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _auth = AuthService();
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();
  final _inviteController = TextEditingController();
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();

  _LoginStep _step = _LoginStep.email;
  bool _loading = false;
  String? _error;
  int _resendSeconds = 0;
  Timer? _resendTimer;

  @override
  void dispose() {
    _resendTimer?.cancel();
    _emailController.dispose();
    _codeController.dispose();
    _inviteController.dispose();
    _identifierController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _startResendCountdown(int seconds) {
    _resendTimer?.cancel();
    setState(() => _resendSeconds = seconds);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_resendSeconds <= 1) {
        t.cancel();
        setState(() => _resendSeconds = 0);
      } else {
        setState(() => _resendSeconds -= 1);
      }
    });
  }

  Future<void> _sendCode() async {
    final email = _emailController.text.trim();
    if (!AuthService.isValidEmail(email)) {
      setState(() => _error = '请输入有效的邮箱地址');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result = await _auth.sendEmailCode(email);
      _startResendCountdown(result.retryAfter);
      setState(() {
        _step = _LoginStep.code;
        _codeController.clear();
      });
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = '网络错误，请稍后重试');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verifyCode() async {
    final email = _emailController.text.trim();
    final code = _codeController.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(code)) {
      setState(() => _error = '请输入 6 位验证码');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final session = await _auth.verifyEmailCode(
        email: email,
        code: code,
        inviteCode: _inviteController.text,
      );
      widget.onLoggedIn(session);
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = '网络错误，请稍后重试');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loginPassword() async {
    final id = _identifierController.text.trim();
    final password = _passwordController.text;
    if (id.isEmpty || password.isEmpty) {
      setState(() => _error = '请输入账号和密码');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final session = await _auth.loginWithPassword(
        identifier: id,
        password: password,
      );
      widget.onLoggedIn(session);
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = '网络错误，请稍后重试');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openWebLogin() async {
    final uri = Uri.parse('${AppConfig.apiOrigin}/index.html');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Widget _buildHeader() {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const LumeMark(size: 44),
            const SizedBox(width: 12),
            Text(
              'Lume',
              style: GoogleFonts.dmSans(
                fontSize: 26,
                fontWeight: FontWeight.w700,
                color: LumeColors.text1,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          '你的 AI 团队，就在桌面',
          textAlign: TextAlign.center,
          style: TextStyle(color: LumeColors.text3, fontSize: 13),
        ),
      ],
    );
  }

  Widget _errorBox() {
    if (_error == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        _error!,
        style: const TextStyle(color: LumeColors.danger, fontSize: 13),
      ),
    );
  }

  Widget _primaryButton(String label, VoidCallback? onPressed) {
    return SizedBox(
      height: 48,
      child: ElevatedButton(
        onPressed: _loading ? null : onPressed,
        child: _loading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Text(label),
      ),
    );
  }

  Widget _buildEmailStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _errorBox(),
        TextField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          decoration: const InputDecoration(
            labelText: '邮箱',
            hintText: 'you@email.com',
          ),
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _loading ? null : _sendCode(),
        ),
        const SizedBox(height: 24),
        _primaryButton('继续', _sendCode),
        const SizedBox(height: 16),
        TextButton(
          onPressed: () => setState(() {
            _step = _LoginStep.password;
            _error = null;
          }),
          child: Text(
            '使用密码登录',
            style: TextStyle(color: LumeColors.text2, fontSize: 13),
          ),
        ),
      ],
    );
  }

  Widget _buildCodeStep() {
    final email = _emailController.text.trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _errorBox(),
        Text(
          '验证码已发送至 $email',
          style: TextStyle(color: LumeColors.text2, fontSize: 13),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _codeController,
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(6),
          ],
          autofillHints: const [AutofillHints.oneTimeCode],
          decoration: const InputDecoration(
            labelText: '验证码',
            hintText: '6 位数字',
          ),
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _loading ? null : _verifyCode(),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _inviteController,
          decoration: const InputDecoration(
            labelText: '邀请码（可选）',
            hintText: '有邀请码可填写',
          ),
        ),
        const SizedBox(height: 24),
        _primaryButton('登录', _verifyCode),
        const SizedBox(height: 12),
        TextButton(
          onPressed: _resendSeconds > 0 || _loading
              ? null
              : () => _sendCode(),
          child: Text(
            _resendSeconds > 0
                ? '$_resendSeconds 秒后可重发'
                : '重新发送验证码',
            style: TextStyle(color: LumeColors.text2, fontSize: 13),
          ),
        ),
        TextButton(
          onPressed: () => setState(() {
            _step = _LoginStep.email;
            _error = null;
          }),
          child: Text(
            '更换邮箱',
            style: TextStyle(color: LumeColors.accent, fontSize: 13),
          ),
        ),
      ],
    );
  }

  Widget _buildPasswordStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _errorBox(),
        TextField(
          controller: _identifierController,
          autofillHints: const [AutofillHints.username],
          decoration: const InputDecoration(
            labelText: '邮箱或昵称',
            hintText: 'you@email.com',
          ),
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _passwordController,
          obscureText: true,
          autofillHints: const [AutofillHints.password],
          decoration: const InputDecoration(labelText: '密码'),
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _loading ? null : _loginPassword(),
        ),
        const SizedBox(height: 24),
        _primaryButton('登录', _loginPassword),
        const SizedBox(height: 12),
        TextButton(
          onPressed: () => setState(() {
            _step = _LoginStep.email;
            _error = null;
          }),
          child: Text(
            '改用邮箱验证码',
            style: TextStyle(color: LumeColors.accent, fontSize: 13),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildHeader(),
                const SizedBox(height: 36),
                if (_step == _LoginStep.email) _buildEmailStep(),
                if (_step == _LoginStep.code) _buildCodeStep(),
                if (_step == _LoginStep.password) _buildPasswordStep(),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: _openWebLogin,
                  child: Text(
                    '在浏览器中打开网页登录',
                    style: TextStyle(color: LumeColors.text3, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
