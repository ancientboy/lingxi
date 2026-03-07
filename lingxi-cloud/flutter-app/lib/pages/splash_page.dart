import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/pages/login_page.dart';
import 'package:lingxicloud/pages/chat_page.dart';
import 'package:lingxicloud/pages/starfield_intro_page.dart';
import 'package:lingxicloud/pages/team_intro_page.dart';

class SplashPage extends StatefulWidget {
  const SplashPage({super.key});

  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage> {
  @override
  void initState() {
    super.initState();
    _initApp();
  }

  Future<void> _initApp() async {
    await Future.delayed(const Duration(seconds: 1));

    // 检查是否需要显示星空启动屏
    final shouldShowIntro = await StarfieldIntroPage.shouldShow();

    if (mounted && shouldShowIntro) {
      // 显示星空启动屏
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => StarfieldIntroPage(
            onComplete: () => _navigateToNext(),
          ),
        ),
      );
    } else {
      // 直接进入下一步
      _navigateToNext();
    }
  }

  Future<void> _navigateToNext() async {
    final appProvider = Provider.of<AppProvider>(context, listen: false);
    await appProvider.init();

    if (!mounted) return;

    // 未登录 → 登录页
    if (!appProvider.isLoggedIn) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const LoginPage()),
      );
      return;
    }

    // 已登录，统一跳转到 ChatPage
    // 订阅用户检查是否有团队
    final plan = appProvider.user?.subscription?['plan'] ?? 'free';
    
    if (plan != 'free') {
      // 订阅用户但没有团队 → 显示团队引导页
      final hasTeam = appProvider.user?.agents.isNotEmpty ?? false;
      if (!hasTeam) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => TeamIntroPage(
              onComplete: () {
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => const ChatPage()),
                );
              },
            ),
          ),
        );
        return;
      }
    }
    
    // 免费用户或订阅用户有团队 → 直接进入聊天页
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const ChatPage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Constants.primaryColor,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.2),
                    blurRadius: 20,
                    spreadRadius: 5,
                  ),
                ],
              ),
              child: Icon(
                Icons.smart_toy,
                size: 40,
                color: Constants.primaryColor,
              ),
            ),
            const SizedBox(height: 24),
            FutureBuilder(
              future: Future.delayed(Duration.zero),
              builder: (context, snapshot) {
                return Text(
                  Constants.appName,
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                );
              },
            ),
            const SizedBox(height: 8),
            Text(
              Constants.appVersion,
              style: const TextStyle(
                fontSize: 14,
                color: Colors.white70,
              ),
            ),
            const SizedBox(height: 48),
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                strokeWidth: 3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
