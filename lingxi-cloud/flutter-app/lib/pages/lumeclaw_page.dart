import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:lingxicloud/pages/subscription_page.dart';
import 'package:dio/dio.dart'; // ✅ 终极防崩：导入 CancelToken

class LumeClawPage extends StatefulWidget {
  const LumeClawPage({super.key});

  @override
  State<LumeClawPage> createState() => _LumeClawPageState();
}

class _LumeClawPageState extends State<LumeClawPage> {
  // ✅ 终极防崩：每个页面必加的变量
  bool _isDisposed = false;
  final CancelToken _cancelToken = CancelToken(); // ✅ 终极防崩：取消请求令牌
  
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<_ChatMessage> _messages = [];
  bool _isLoading = false;
  bool _hasAccess = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _checkAccess();
  }

  // ✅ 终极防崩：dispose 必写
  @override
  void dispose() {
    _isDisposed = true;
    _cancelToken.cancel(); // ✅ 终极防崩：直接把请求断掉！
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _checkAccess() async {
    // ✅ 终极防崩：所有异步前先判断
    if (_isDisposed || !mounted) return;
    
    final appProvider = Provider.of<AppProvider>(context, listen: false);
    final userId = appProvider.user?.id;
    if (userId == null) return;

    try {
      final apiService = ApiService();
      final response = await apiService.get(
        '/api/lumeclaw/permissions/$userId',
        cancelToken: _cancelToken, // ✅ 终极防崩：加上 cancelToken
      );
      
      if (_isDisposed || !mounted) return;
      
      if (response.data['success'] == true && response.data['allowed'] == true) {
        setState(() {
          _hasAccess = true;
        });
      }
    } on DioException catch (e) {
      // ✅ 终极防崩：如果是取消请求，直接返回
      if (_isDisposed || !mounted || CancelToken.isCancel(e)) return;
      debugPrint('检查权限失败: $e');
      setState(() {
        _error = e.toString();
      });
    } catch (e) {
      if (_isDisposed || !mounted) return;
      debugPrint('检查权限失败: $e');
      setState(() {
        _error = e.toString();
      });
    }
  }

  Future<void> _sendMessage() async {
    // ✅ 终极防崩：所有异步前先判断
    if (_isDisposed || !mounted) return;
    
    final text = _messageController.text.trim();
    if (text.isEmpty || _isLoading) return;

    final appProvider = Provider.of<AppProvider>(context, listen: false);
    final userId = appProvider.user?.id;
    if (userId == null) return;

    if (!_isDisposed && mounted) {
      setState(() {
        _messages.add(_ChatMessage(role: 'user', content: text));
        _isLoading = true;
      });
    }

    _messageController.clear();
    _scrollToBottom();

    try {
      final apiService = ApiService();
      final response = await apiService.post(
        '/api/lumeclaw/chat',
        data: {
          'userId': userId,
          'message': text,
        },
        cancelToken: _cancelToken, // ✅ 终极防崩：加上 cancelToken
      );

      if (_isDisposed || !mounted) return;

      if (response.data['success'] == true) {
        if (!_isDisposed && mounted) {
          setState(() {
            _messages.add(_ChatMessage(
              role: 'assistant',
              content: response.data['response'] ?? '无响应',
            ));
          });
        }
      } else {
        if (!_isDisposed && mounted) {
          setState(() {
            _messages.add(_ChatMessage(
              role: 'assistant',
              content: '❌ 错误: ${response.data['error'] ?? '请求失败'}',
            ));
          });
        }
      }
    } on DioException catch (e) {
      // ✅ 终极防崩：如果是取消请求，直接返回
      if (_isDisposed || !mounted || CancelToken.isCancel(e)) return;
      if (!_isDisposed && mounted) {
        setState(() {
          _messages.add(_ChatMessage(
            role: 'assistant',
            content: '❌ 请求失败: $e',
          ));
        });
      }
    } catch (e) {
      if (_isDisposed || !mounted) return;
      if (!_isDisposed && mounted) {
        setState(() {
          _messages.add(_ChatMessage(
            role: 'assistant',
            content: '❌ 请求失败: $e',
          ));
        });
      }
    } finally {
      if (_isDisposed || !mounted) return;
      if (!_isDisposed && mounted) {
        setState(() {
          _isLoading = false;
        });
      }
      _scrollToBottom();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _sendQuickMessage(String message) {
    _messageController.text = message;
    _sendMessage();
  }

  void _clearChat() {
    setState(() {
      _messages.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Row(
          children: [
            Icon(Icons.build_outlined),
            SizedBox(width: 8),
            Text('Lume 维护助手'),
          ],
        ),
        backgroundColor: Constants.primaryColor,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: '清空对话',
            onPressed: _clearChat,
          ),
        ],
      ),
      body: _error != null
          ? _buildError()  // ✅ 优先显示错误
          : !_hasAccess
              ? _buildNoAccess()
              : Column(
              children: [
                // 功能介绍
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Constants.primaryColor.withOpacity(0.1),
                    border: Border(
                      bottom: BorderSide(
                        color: Constants.textLightColor.withOpacity(0.2),
                      ),
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Constants.primaryColor.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Text('🤖', style: TextStyle(fontSize: 24)),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Lume - OpenClaw 智能维护助手',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                            SizedBox(height: 4),
                            Text(
                              '帮你诊断问题、查看日志、修复配置',
                              style: TextStyle(
                                color: Constants.textSecondaryColor,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // 快捷功能
                Container(
                  height: 60,
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      _QuickButton(
                        icon: Icons.local_activity,
                        label: 'Gateway状态',
                        onTap: () => _sendQuickMessage('检查 OpenClaw Gateway 状态'),
                      ),
                      _QuickButton(
                        icon: Icons.error_outline,
                        label: '错误日志',
                        onTap: () => _sendQuickMessage('查看 OpenClaw 错误日志'),
                      ),
                      _QuickButton(
                        icon: Icons.memory,
                        label: '资源使用',
                        onTap: () => _sendQuickMessage('检查服务器资源使用情况'),
                      ),
                      _QuickButton(
                        icon: Icons.settings,
                        label: '配置检查',
                        onTap: () => _sendQuickMessage('检查 OpenClaw 配置是否正确'),
                      ),
                      _QuickButton(
                        icon: Icons.restart_alt,
                        label: '重启服务',
                        onTap: () => _sendQuickMessage('帮我重启 OpenClaw Gateway'),
                      ),
                    ],
                  ),
                ),

                // 消息列表
                Expanded(
                  child: _messages.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.build_outlined,
                                size: 64,
                                color: Constants.textLightColor,
                              ),
                              const SizedBox(height: 16),
                              Text(
                                '遇到问题？告诉我',
                                style: TextStyle(
                                  fontSize: 16,
                                  color: Constants.textSecondaryColor,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '例如：Gateway启动失败 / 模型调用超时',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Constants.textLightColor,
                                ),
                              ),
                            ],
                          ),
                        )
                      : ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.all(16),
                          itemCount: _messages.length + (_isLoading ? 1 : 0),
                          itemBuilder: (context, index) {
                            if (index == _messages.length && _isLoading) {
                              return const Padding(
                                padding: EdgeInsets.all(16),
                                child: Center(
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(strokeWidth: 2),
                                      ),
                                      SizedBox(width: 12),
                                      Text('Lume 正在分析...'),
                                    ],
                                  ),
                                ),
                              );
                            }

                            final msg = _messages[index];
                            return _MessageBubble(message: msg);
                          },
                        ),
                ),

                // 输入区域
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.05),
                        blurRadius: 10,
                        offset: const Offset(0, -2),
                      ),
                    ],
                  ),
                  child: SafeArea(
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _messageController,
                            decoration: InputDecoration(
                              hintText: '描述你遇到的问题...',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(24),
                                borderSide: BorderSide.none,
                              ),
                              filled: true,
                              fillColor: Colors.grey[100],
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
                            ),
                            maxLines: null,
                            textInputAction: TextInputAction.send,
                            onSubmitted: (_) => _sendMessage(),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton(
                          onPressed: _isLoading ? null : _sendMessage,
                          icon: const Icon(Icons.send),
                          style: IconButton.styleFrom(
                            backgroundColor: Constants.primaryColor,
                            foregroundColor: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildNoAccess() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.lock_outline,
            size: 64,
            color: Constants.textLightColor,
          ),
          const SizedBox(height: 16),
          const Text(
            'LumeClaw 仅对订阅用户开放',
            style: TextStyle(fontSize: 16),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SubscriptionPage()),
              );
            },
            child: const Text('升级订阅'),
          ),
        ],
      ),
    );
  }

  // ✅ 新增：显示错误页面
  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: Colors.red.shade300,
            ),
            const SizedBox(height: 16),
            const Text(
              '连接失败',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              '无法连接到服务器，请检查网络',
              style: TextStyle(fontSize: 14, color: Colors.grey.shade600),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                _error ?? '未知错误',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ElevatedButton.icon(
                  onPressed: () {
                    setState(() {
                      _error = null;
                    });
                    _checkAccess();
                  },
                  icon: const Icon(Icons.refresh),
                  label: const Text('重试'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Constants.primaryColor,
                    foregroundColor: Colors.white,
                  ),
                ),
                const SizedBox(width: 16),
                OutlinedButton.icon(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.arrow_back),
                  label: const Text('返回'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: ActionChip(
        avatar: Icon(icon, size: 16, color: Constants.primaryColor),
        label: Text(label),
        onPressed: onTap,
        backgroundColor: Constants.primaryColor.withOpacity(0.1),
        side: BorderSide.none,
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final _ChatMessage message;

  const _MessageBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == 'user';

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: Constants.primaryColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Center(child: Text('🤖')),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isUser
                    ? Constants.primaryColor
                    : Colors.grey[100],
                borderRadius: BorderRadius.circular(16),
              ),
              child: isUser
                  ? Text(
                      message.content,
                      style: const TextStyle(color: Colors.white),
                    )
                  : MarkdownBody(
                      data: message.content,
                      styleSheet: MarkdownStyleSheet(
                        p: const TextStyle(fontSize: 14),
                        code: TextStyle(fontSize: 12, backgroundColor: Colors.grey.shade200),
                      ),
                    ),
            ),
          ),
          if (isUser) ...[
            const SizedBox(width: 8),
            CircleAvatar(
              radius: 16,
              backgroundColor: Constants.primaryColor.withOpacity(0.1),
              child: const Icon(Icons.person, size: 18, color: Constants.primaryColor),
            ),
          ],
        ],
      ),
    );
  }
}

class _ChatMessage {
  final String role;
  final String content;

  _ChatMessage({required this.role, required this.content});
}
