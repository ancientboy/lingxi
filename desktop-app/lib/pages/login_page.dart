import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/app_config.dart';
import '../services/auth_service.dart';
import '../services/auth_storage.dart';
import '../theme/lume_theme.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.onLoggedIn});

  final ValueChanged<AuthSession> onLoggedIn;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _auth = AuthService();
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = '请输入邮箱和密码');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final session = await _auth.login(email: email, password: password);
      widget.onLoggedIn(session);
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
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

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
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
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: LumeColors.accent,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        'L',
                        style: GoogleFonts.dmSans(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 20,
                        ),
                      ),
                    ),
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
                  '桌面端 · 连接 lumeword.cn',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: LumeColors.text3, fontSize: 13),
                ),
                const SizedBox(height: 40),
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(
                    labelText: '邮箱',
                    hintText: 'your@email.com',
                  ),
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  autofillHints: const [AutofillHints.password],
                  decoration: const InputDecoration(
                    labelText: '密码',
                  ),
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _loading ? null : _submit(),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: const TextStyle(color: LumeColors.danger, fontSize: 13),
                  ),
                ],
                const SizedBox(height: 24),
                SizedBox(
                  height: 48,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _submit,
                    child: _loading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('登录'),
                  ),
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: _openWebLogin,
                  child: Text(
                    '使用浏览器打开网页登录',
                    style: TextStyle(color: LumeColors.text2, fontSize: 13),
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
