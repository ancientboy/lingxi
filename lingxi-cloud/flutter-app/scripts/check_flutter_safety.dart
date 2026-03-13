#!/usr/bin/env dart
// Flutter 页面安全检查脚本
// 自动检查所有页面是否符合防崩规范

import 'dart:io';

void main() {
  print('=== Flutter 页面安全检查 ===\n');
  
  final pages = [
    'lib/pages/skills_page.dart',
    'lib/pages/lumeclaw_page.dart',
    'lib/pages/chat_page.dart',
    'lib/pages/subscription_page.dart',
  ];
  
  for (final page in pages) {
    checkPage(page);
  }
  
  print('\n=== 检查完成 ===');
}

void checkPage(String path) {
  print('📄 检查: $path');
  
  if (!File(path).existsSync()) {
    print('  ❌ 文件不存在\n');
    return;
  }
  
  final content = File(path).readAsStringSync();
  final lines = content.split('\n');
  
  // 检查 1: _isDisposed 变量
  final hasIsDisposed = content.contains('bool _isDisposed = false');
  print('  ${hasIsDisposed ? "✅" : "❌"} 有 _isDisposed 变量');
  
  // 检查 2: CancelToken 变量
  final hasCancelToken = content.contains('final CancelToken _cancelToken');
  print('  ${hasCancelToken ? "✅" : "⚠️"} 有 CancelToken 变量');
  
  // 检查 3: dispose 方法
  final hasDispose = content.contains('void dispose()');
  final disposeCancelsToken = hasDispose && content.contains('_cancelToken.cancel()');
  print('  ${hasDispose ? "✅" : "❌"} 有 dispose 方法');
  if (hasCancelToken && hasDispose) {
    print('  ${disposeCancelsToken ? "✅" : "❌"} dispose 取消 CancelToken');
  }
  
  // 检查 4: 网络请求
  final requestPattern = RegExp(r'ApiService\(\)\.(get|post|put|delete)\(');
  final requests = requestPattern.allMatches(content);
  final cancelTokenUsage = 'cancelToken: _cancelToken'.allMatches(content);
  print('  📊 网络请求: ${requests.length}, 带 cancelToken: ${cancelTokenUsage.length}');
  
  // 检查 5: setState 检查
  final setStatePattern = RegExp(r'setState\(');
  final setStates = setStatePattern.allMatches(content);
  final mountedChecks = 'mounted'.allMatches(content);
  final disposedChecks = '_isDisposed'.allMatches(content);
  print('  📊 setState: ${setStates.length}, mounted 检查: ${mountedChecks.length}, _isDisposed 检查: ${disposedChecks.length}');
  
  // 检查 6: Future.delayed 和 Future.microtask
  final futureDelayed = 'Future.delayed'.allMatches(content);
  final futureMicrotask = 'Future.microtask'.allMatches(content);
  if (futureDelayed.isNotEmpty || futureMicrotask.isNotEmpty) {
    print('  ⚠️  有 Future.delayed: ${futureDelayed.length}, Future.microtask: ${futureMicrotask.length}');
    print('     这些异步操作无法取消，需要确保有 _isDisposed 检查！');
  }
  
  // 检查 7: Timer
  final timers = 'Timer'.allMatches(content);
  final timerCancels = 'timer.cancel()\|.cancel()'.allMatches(content);
  if (timers.isNotEmpty) {
    print('  📊 Timer: ${timers.length}, 取消: ${timerCancels.length}');
    if (timers.length > timerCancels.length) {
      print('  ❌ Timer 没有全部取消！');
    }
  }
  
  print('');
}
