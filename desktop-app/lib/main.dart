import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:window_manager/window_manager.dart';

import 'app_commands.dart';
import 'pages/desktop_shell_page.dart';
import 'pages/login_page.dart';
import 'pages/splash_page.dart';
import 'services/auth_service.dart';
import 'services/auth_storage.dart';
import 'services/window_state_service.dart';
import 'theme/lume_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();

  final windowState = WindowStateService();
  final savedSize = await windowState.readSize();

  final windowOptions = WindowOptions(
    size: savedSize ?? const Size(1200, 800),
    minimumSize: const Size(900, 620),
    center: savedSize == null,
    backgroundColor: LumeColors.bg,
    title: 'Lume',
  );

  windowManager.waitUntilReadyToShow(windowOptions, () async {
    await windowManager.show();
    await windowManager.focus();
  });

  windowManager.addListener(_LumeWindowListener(windowState));

  runApp(const LumeDesktopApp());
}

class _LumeWindowListener with WindowListener {
  _LumeWindowListener(this._windowState);
  final WindowStateService _windowState;

  @override
  void onWindowResize() {
    windowManager.getSize().then(_windowState.saveSize);
  }
}

class LumeDesktopApp extends StatelessWidget {
  const LumeDesktopApp({super.key});

  @override
  Widget build(BuildContext context) {
    return PlatformMenuBar(
      menus: [
        PlatformMenu(
          label: 'Lume',
          menus: [
            PlatformMenuItem(
              label: 'About Lume',
              onSelected: () => AppCommands.onShowAbout?.call(),
            ),
            PlatformMenuItemGroup(
              members: [
                PlatformMenuItem(
                  label: 'Quit Lume',
                  shortcut: const SingleActivator(
                    LogicalKeyboardKey.keyQ,
                    meta: true,
                  ),
                  onSelected: () => windowManager.destroy(),
                ),
              ],
            ),
          ],
        ),
        PlatformMenu(
          label: 'File',
          menus: [
            PlatformMenuItem(
              label: 'New Chat',
              shortcut: const SingleActivator(
                LogicalKeyboardKey.keyN,
                meta: true,
              ),
              onSelected: () => AppCommands.onNewChat?.call(),
            ),
          ],
        ),
        PlatformMenu(
          label: 'Edit',
          menus: [
            PlatformMenuItem(
              label: 'Settings…',
              shortcut: const SingleActivator(
                LogicalKeyboardKey.comma,
                meta: true,
              ),
              onSelected: () => AppCommands.onOpenSettings?.call(),
            ),
          ],
        ),
        PlatformMenu(
          label: 'View',
          menus: [
            PlatformMenuItem(
              label: 'Refresh',
              shortcut: const SingleActivator(
                LogicalKeyboardKey.keyR,
                meta: true,
              ),
              onSelected: () => AppCommands.onRefresh?.call(),
            ),
          ],
        ),
      ],
      child: MaterialApp(
        title: 'Lume',
        debugShowCheckedModeBanner: false,
        theme: buildLumeTheme(),
        home: const AppRoot(),
      ),
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

    return DesktopShellPage(
      session: _session!,
      onLogout: _handleLogout,
    );
  }
}
