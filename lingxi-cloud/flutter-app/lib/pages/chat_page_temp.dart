  // 获取当前用户的 session 存储 key
  String _getUserSessionKey() {
    final user = Provider.of<AppProvider>(context, listen: false).user;
    final userId = user?.id ?? 'unknown';
    return 'chat_sessions_$userId';
  }

  Future<void> _loadSessions() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final sessionKey = _getUserSessionKey();
      final sessionsJson = prefs.getString(sessionKey);
      
      if (sessionsJson != null && mounted) {
        final List<dynamic> decoded = json.decode(sessionsJson);
        setState(() {
          _sessions = decoded.map((s) {
            final map = s is Map ? s as Map<String, dynamic> : <String, dynamic>{};
            return {
              'key': map['key']?.toString() ?? '',
              'title': map['title']?.toString() ?? '新对话',
              'createdAt': map['createdAt']?.toString(),
              'updatedAt': map['updatedAt']?.toString(),
            };
          }).toList();
        });
        debugPrint('✅ 加载用户 $userId 的 ${_sessions.length} 个会话');
      } else {
        debugPrint('📋 用户 $userId 没有本地会话历史');
      }
    } catch (e, stack) {
      debugPrint('❌ _loadSessions 异常：$e\nStack: $stack');
    }
  }

  Future<void> _saveSessions() async {
    final prefs = await SharedPreferences.getInstance();
    final sessionKey = _getUserSessionKey();
    await prefs.setString(sessionKey, json.encode(_sessions));
    debugPrint('💾 保存用户会话：${_sessions.length} 个');
  }
