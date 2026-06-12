import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/pages/login_page.dart';
import 'package:lingxicloud/pages/main_shell.dart';

class SplashPage extends StatefulWidget {
  SplashPage({super.key});

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
    final appProvider = Provider.of<AppProvider>(context, listen: false);
    await appProvider.init();

    if (!mounted) return;

    // 未登录 → 登录页
    if (!appProvider.isLoggedIn) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => LoginPage()),
      );
      return;
    }

    // 已登录 → 聊天页
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => MainShell()),
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
              ),
              child: Icon(
                Icons.auto_awesome,
                size: 40,
                color: Constants.primaryColor,
              ),
            ),
            SizedBox(height: 24),
            Text(
              'Lume',
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            SizedBox(height: 48),
            SizedBox(
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
