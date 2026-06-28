import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/providers/chat_provider.dart';
import 'package:lingxicloud/pages/splash_page.dart';
import 'package:lingxicloud/services/notification_service.dart';
import 'dart:ui' show PlatformDispatcher;

// ✅ 终极防崩：全局路由观察者
final RouteObserver<ModalRoute<void>> routeObserver = RouteObserver<ModalRoute<void>>();

void main() async {
  // 确保 Flutter 绑定初始化
  WidgetsFlutterBinding.ensureInitialized();

  // 🔔 初始化通知服务
  final notificationService = NotificationService();
  await notificationService.initialize();
  await notificationService.requestPermission();
  
  // 捕获 Flutter 框架错误 - 禁用默认错误页面
  FlutterError.onError = (FlutterErrorDetails details) {
    debugPrint('🚨🚨🚨 Flutter Error: ${details.exception}');
    debugPrint('Stack: ${details.stack}');
    // 不显示默认错误页面，防止灰色遮罩
    // FlutterError.presentError(details);
  };
  
  // 捕获未处理的异步错误
  PlatformDispatcher.instance.onError = (error, stack) {
    debugPrint('🚨🚨🚨 Unhandled Async Error: $error');
    debugPrint('Stack: $stack');
    return true;
  };
  
  // 捕获 Dart 错误
  FlutterError.onError = (FlutterErrorDetails details) {
    debugPrint('🚨🚨🚨 Flutter Framework Error: ${details.exception}');
    debugPrint('Stack: ${details.stack}');
  };
  
  runApp(MyApp());
}

class MyApp extends StatelessWidget {
  MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    // 禁用错误页面的红色死屏
    ErrorWidget.builder = (FlutterErrorDetails details) {
      debugPrint('🚨 Error: ${details.exception}');
      return Material(
        color: Colors.white,
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline, size: 48, color: Colors.red),
              SizedBox(height: 16),
              Text('出现错误', style: TextStyle(fontSize: 18)),
              SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {},
                child: Text('返回'),
              ),
            ],
          ),
        ),
      );
    };
    
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AppProvider()),
        ChangeNotifierProvider(create: (_) => ChatProvider()),
      ],
      child: Consumer<AppProvider>(
        builder: (context, appProvider, child) {
          return MaterialApp(
            title: Constants.appName,
            debugShowCheckedModeBanner: false,
            // ✅ 终极防崩：添加路由观察者
            navigatorObservers: [routeObserver],
            theme: ThemeData(
              useMaterial3: true,
              scaffoldBackgroundColor: Constants.backgroundColor,
              colorScheme: ColorScheme.fromSeed(
                seedColor: Constants.primaryColor,
                brightness: Brightness.light,
                surface: Constants.surfaceColor,
                background: Constants.backgroundColor,
              ),
              appBarTheme: AppBarTheme(
                centerTitle: true,
                elevation: 0,
                backgroundColor: Constants.backgroundColor,
                foregroundColor: Constants.textPrimaryColor,
              ),
              cardTheme: CardTheme(
                elevation: 0,
                color: Constants.surfaceColor,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(Constants.radiusMd),
                  side: BorderSide(color: Constants.borderDefault, width: 1),
                ),
              ),
              inputDecorationTheme: InputDecorationTheme(
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(Constants.radiusSm),
                  borderSide: BorderSide(color: Constants.borderDefault),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(Constants.radiusSm),
                  borderSide: BorderSide(color: Constants.borderDefault),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(Constants.radiusSm),
                  borderSide: BorderSide(color: Constants.textPrimaryColor, width: 1.5),
                ),
                filled: true,
                fillColor: Constants.bgInput,
              ),
              elevatedButtonTheme: ElevatedButtonThemeData(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Constants.textPrimaryColor,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  padding: EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 14,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(Constants.radiusSm),
                  ),
                ),
              ),
              dividerTheme: DividerThemeData(
                color: Constants.borderDefault,
                thickness: 1,
              ),
            ),
            darkTheme: ThemeData(
              useMaterial3: true,
              scaffoldBackgroundColor: Color(0xFF1A1A1A),
              colorScheme: ColorScheme.fromSeed(
                seedColor: Constants.primaryColor,
                brightness: Brightness.dark,
                surface: Color(0xFF2D2D30),
                background: Color(0xFF1A1A1A),
              ),
              appBarTheme: AppBarTheme(
                centerTitle: true,
                elevation: 0,
                backgroundColor: Color(0xFF1A1A1A),
                foregroundColor: Colors.white,
              ),
              cardTheme: CardTheme(
                elevation: 0,
                color: Color(0xFF2D2D30),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(Constants.radiusMd),
                  side: BorderSide(color: Color(0xFF404040), width: 1),
                ),
              ),
              inputDecorationTheme: InputDecorationTheme(
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(Constants.radiusSm),
                  borderSide: BorderSide(color: Color(0xFF404040)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(Constants.radiusSm),
                  borderSide: BorderSide(color: Color(0xFF404040)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(Constants.radiusSm),
                  borderSide: BorderSide(color: Constants.primaryColor, width: 1.5),
                ),
                filled: true,
                fillColor: Color(0xFF2D2D30),
              ),
              elevatedButtonTheme: ElevatedButtonThemeData(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Constants.primaryColor,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  padding: EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 14,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(Constants.radiusSm),
                  ),
                ),
              ),
              dividerTheme: DividerThemeData(
                color: Color(0xFF404040),
                thickness: 1,
              ),
            ),
            themeMode: appProvider.isDarkMode ? ThemeMode.dark : ThemeMode.light,
            home: SplashPage(),
          );
        },
      ),
    );
  }
}
