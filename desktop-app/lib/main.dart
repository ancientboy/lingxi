import 'package:flutter/material.dart';

import 'pages/login_page.dart';
import 'pages/splash_page.dart';
import 'pages/web_app_page.dart';
import 'services/auth_service.dart';
import 'services/auth_storage.dart';
import 'theme/lume_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const LumeDesktopApp());
}

class LumeDesktopApp extends StatelessWidget {
  const LumeDesktopApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Lume',
      debugShowCheckedModeBanner: false,
      theme: buildLumeTheme(),
      home: const AppRoot(),
    );
  }
}

class AppRoot extends StatefulWidget {
  const AppRoot({super.key});

  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> {
  final _auth = AuthService();
  AuthSession? _session;
  bool _booting = true;

  static const _minSplash = Duration(milliseconds: 1500);

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final started = DateTime.now();
    try {
      final session = await _auth.restoreSession();
      if (session != null) {
        final valid = await _auth.verifyToken(session.token);
        if (valid) {
          _session = session;
        } else {
          await _auth.logout();
        }
      }
    } finally {
      final elapsed = DateTime.now().difference(started);
      if (elapsed < _minSplash) {
        await Future.delayed(_minSplash - elapsed);
      }
      if (mounted) {
        setState(() => _booting = false);
      }
    }
  }

  Future<void> _handleLogout() async {
    await _auth.logout();
    setState(() => _session = null);
  }

  @override
  Widget build(BuildContext context) {
    if (_booting) {
      return const SplashPage();
    }

    if (_session == null) {
      return LoginPage(
        onLoggedIn: (session) => setState(() => _session = session),
      );
    }

    return WebAppPage(
      session: _session!,
      onLogout: _handleLogout,
    );
  }
}
