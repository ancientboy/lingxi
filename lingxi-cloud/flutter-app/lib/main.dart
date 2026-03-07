import 'package:lingxicloud/utils/constants.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/providers/chat_provider.dart';
import 'package:lingxicloud/pages/splash_page.dart';
import 'package:lingxicloud/services/notification_service.dart';
import 'dart:ui' show PlatformDispatcher;

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
  
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    // 自定义错误页面构建器 - 显示详细错误信息和堆栈
    ErrorWidget.builder = (FlutterErrorDetails details) {
      final error = details.exception.toString();
      final stack = details.stack?.toString() ?? '';
      debugPrint('🚨🚨🚨 ErrorWidget 触发: $error');
      debugPrint('Stack: $stack');
      
      // 提取关键信息
      String shortError = error;
      String? fileName;
      int? lineNumber;
      
      // 尝试从堆栈中提取文件名和行号
      final stackLines = stack.split('\n');
      for (final line in stackLines) {
        if (line.contains('chat_page.dart')) {
          final match = RegExp(r'chat_page\.dart:(\d+)').firstMatch(line);
          if (match != null) {
            fileName = 'chat_page.dart';
            lineNumber = int.tryParse(match.group(1) ?? '');
            break;
          }
        }
      }
      
      return Material(
        color: Colors.white,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 16),
                const Text('页面加载失败', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (fileName != null && lineNumber != null)
                  Text(
                    '位置: $fileName:$lineNumber',
                    style: const TextStyle(fontSize: 12, color: Colors.blue),
                  ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    shortError.length > 150 ? shortError.substring(0, 150) + '...' : shortError,
                    style: const TextStyle(fontSize: 11, color: Colors.red),
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () {},
                  child: const Text('返回'),
                ),
              ],
            ),
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
            theme: ThemeData(
              useMaterial3: true,
              colorScheme: ColorScheme.fromSeed(
                seedColor: Constants.primaryColor,
                brightness: Brightness.light,
              ),
              appBarTheme: const AppBarTheme(
                centerTitle: true,
                elevation: 0,
              ),
              cardTheme: CardTheme(
                elevation: 2,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              inputDecorationTheme: InputDecorationTheme(
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                filled: true,
                fillColor: Colors.grey[100],
              ),
              elevatedButtonTheme: ElevatedButtonThemeData(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Constants.primaryColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 12,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
            darkTheme: ThemeData(
              useMaterial3: true,
              colorScheme: ColorScheme.fromSeed(
                seedColor: Constants.primaryColor,
                brightness: Brightness.dark,
              ),
              appBarTheme: const AppBarTheme(
                centerTitle: true,
                elevation: 0,
              ),
              cardTheme: CardTheme(
                elevation: 2,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              inputDecorationTheme: InputDecorationTheme(
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                filled: true,
              ),
              elevatedButtonTheme: ElevatedButtonThemeData(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Constants.primaryColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 12,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
            themeMode: appProvider.isDarkMode ? ThemeMode.dark : ThemeMode.light,
            home: const SplashPage(),
          );
        },
      ),
    );
  }
}
