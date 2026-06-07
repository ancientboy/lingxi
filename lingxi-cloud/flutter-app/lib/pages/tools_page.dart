import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/pages/lumeclaw_page.dart';
import 'package:lingxicloud/pages/cron_page.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/app_provider.dart';

class ToolsPage extends StatefulWidget {
  const ToolsPage({super.key});

  @override
  State<ToolsPage> createState() => _ToolsPageState();
}

class _ToolsPageState extends State<ToolsPage> {
  Map<String, dynamic>? _usageStats;
  Map<String, dynamic>? _feishuConfig;
  bool _isLoadingUsage = true;
  bool _isLoadingFeishu = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    _loadUsage();
    _loadFeishu();
  }

  Future<void> _loadUsage() async {
    try {
      final api = ApiService();
      final stats = await api.getUsageStats();
      if (mounted) setState(() { _usageStats = stats; _isLoadingUsage = false; });
    } catch (_) {
      if (mounted) setState(() => _isLoadingUsage = false);
    }
  }

  Future<void> _loadFeishu() async {
    try {
      final api = ApiService();
      final uid = Provider.of<AppProvider>(context, listen: false).user?.id ?? '';
      if (uid.isEmpty) { if (mounted) setState(() => _isLoadingFeishu = false); return; }
      final config = await api.getFeishuConfig(uid);
      if (mounted) setState(() { _feishuConfig = config; _isLoadingFeishu = false; });
    } catch (_) {
      if (mounted) setState(() => _isLoadingFeishu = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dk = Theme.of(context).brightness == Brightness.dark;
    final bg = dk ? const Color(0xFF1A1A2E) : const Color(0xFFF5F5F7);
    final cardColor = dk ? const Color(0xFF252540) : Colors.white;
    final textColor = dk ? Colors.white : Colors.black87;
    final subColor = dk ? Colors.white54 : Colors.black45;

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        title: const Text('🔧 工具'),
        backgroundColor: bg,
        foregroundColor: textColor,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ===== LumeClaw =====
          _buildToolCard(
            icon: Icons.auto_awesome,
            title: 'LumeClaw',
            subtitle: 'AI 对话助手，直接体验智能对话',
            color: Constants.primaryColor,
            cardColor: cardColor,
            textColor: textColor,
            subColor: subColor,
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LumeClawPage())),
          ),
          const SizedBox(height: 12),

          // ===== 定时任务 =====
          _buildToolCard(
            icon: Icons.schedule,
            title: '定时任务',
            subtitle: '创建 AI 定时任务，自动提醒和执行',
            color: const Color(0xFF8B5CF6),
            cardColor: cardColor,
            textColor: textColor,
            subColor: subColor,
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CronPage())),
          ),
          const SizedBox(height: 12),

          // ===== 飞书配置 =====
          _buildToolCard(
            icon: Icons.flight_takeoff,
            title: '飞书集成',
            subtitle: _feishuConfig != null && _feishuConfig!['appId'] != null
                ? '已连接 (${_feishuConfig!['appId'].toString().substring(0, 8)}...)'
                : '配置飞书机器人，实现消息推送',
            color: const Color(0xFF3B82F6),
            cardColor: cardColor,
            textColor: textColor,
            subColor: subColor,
            trailing: _isLoadingFeishu
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : _feishuConfig != null && _feishuConfig!['appId'] != null
                    ? const Icon(Icons.check_circle, color: Color(0xFF22C55E), size: 20)
                    : null,
            onTap: () => _showFeishuConfig(),
          ),
          const SizedBox(height: 12),

          // ===== 使用量统计 =====
          _buildToolCard(
            icon: Icons.bar_chart,
            title: '使用量统计',
            subtitle: _isLoadingUsage
                ? '加载中...'
                : _usageStats != null
                    ? '本月 ${_usageStats!['month']?['totalTokens'] ?? 0} tokens · ${_usageStats!['month']?['totalCalls'] ?? 0} 次调用'
                    : '查看 API 调用和 Token 使用情况',
            color: const Color(0xFFF59E0B),
            cardColor: cardColor,
            textColor: textColor,
            subColor: subColor,
            onTap: () => _showUsageDetail(),
          ),
          const SizedBox(height: 12),

          // ===== 企业微信配置 =====
          _buildToolCard(
            icon: Icons.wechat,
            title: '企业微信',
            subtitle: '配置企业微信机器人通知',
            color: const Color(0xFF07C160),
            cardColor: cardColor,
            textColor: textColor,
            subColor: subColor,
            onTap: () => _showWecomConfig(),
          ),
        ],
      ),
    );
  }

  Widget _buildToolCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required Color cardColor,
    required Color textColor,
    required Color subColor,
    Widget? trailing,
    required VoidCallback onTap,
  }) {
    return Material(
      color: cardColor,
      borderRadius: BorderRadius.circular(14),
      elevation: 1,
      shadowColor: Colors.black.withOpacity(0.04),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 24),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16, color: textColor)),
                    const SizedBox(height: 2),
                    Text(subtitle, style: TextStyle(fontSize: 13, color: subColor), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              trailing ?? Icon(Icons.chevron_right, color: subColor, size: 20),
            ],
          ),
        ),
      ),
    );
  }

  void _showFeishuConfig() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Text('飞书集成配置', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const Spacer(),
              IconButton(onPressed: () => Navigator.pop(ctx), icon: const Icon(Icons.close)),
            ]),
            const SizedBox(height: 16),
            const Text('在 OpenClaw 配置中设置飞书机器人后，即可通过飞书接收 AI 消息通知。', style: TextStyle(fontSize: 14, color: Colors.grey)),
            const SizedBox(height: 16),
            _buildConfigField('App ID', _feishuConfig?['appId'] ?? ''),
            const SizedBox(height: 12),
            _buildConfigField('App Secret', _feishuConfig?['appSecret'] != null ? '****${(_feishuConfig!['appSecret'] as String).substring((_feishuConfig!['appSecret'] as String).length - 4)}' : ''),
            const SizedBox(height: 12),
            _buildConfigField('Webhook URL', _feishuConfig?['webhookUrl'] ?? ''),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildConfigField(String label, String value) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF555555))),
      const SizedBox(height: 4),
      Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFE0E0E0))),
        child: Text(value.isNotEmpty ? value : '未配置', style: TextStyle(fontSize: 14, color: value.isNotEmpty ? Colors.black87 : Colors.grey)),
      ),
    ]);
  }

  void _showUsageDetail() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Text('📊 使用量统计', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const Spacer(),
              IconButton(onPressed: () => Navigator.pop(ctx), icon: const Icon(Icons.close)),
            ]),
            const SizedBox(height: 20),
            if (_usageStats != null) ...[
              _buildStatRow('本月调用', '${_usageStats!['month']?['totalCalls'] ?? 0} 次'),
              _buildStatRow('本月 Tokens', '${_usageStats!['month']?['totalTokens'] ?? 0}'),
              _buildStatRow('今日调用', '${_usageStats!['today']?['totalCalls'] ?? 0} 次'),
              _buildStatRow('今日 Tokens', '${_usageStats!['today']?['totalTokens'] ?? 0}'),
            ] else ...[
              const Center(child: Text('暂无统计数据', style: TextStyle(color: Colors.grey))),
            ],
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildStatRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(children: [
        Text(label, style: const TextStyle(fontSize: 15, color: Colors.black54)),
        const Spacer(),
        Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
      ]),
    );
  }

  void _showWecomConfig() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('企业微信配置开发中...'), backgroundColor: Color(0xFF07C160)),
    );
  }
}
