import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:lingxicloud/services/websocket_service.dart';
import 'package:lingxicloud/providers/app_provider.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ServersPage extends StatefulWidget {
  const ServersPage({super.key});

  @override
  State<ServersPage> createState() => _ServersPageState();
}

class _ServersPageState extends State<ServersPage> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _servers = [];
  String? _activeServerId;
  String? _userId;

  @override
  void initState() {
    super.initState();
    _loadServers();
  }

  String _getUserId() {
    if (_userId != null) return _userId!;
    final appProvider = Provider.of<AppProvider>(context, listen: false);
    _userId = appProvider.user?.id ?? '';
    return _userId!;
  }

  Future<void> _loadServers() async {
    setState(() => _isLoading = true);
    try {
      final api = ApiService();
      final uid = _getUserId();
      if (uid.isEmpty) {
        if (mounted) setState(() { _isLoading = false; });
        return;
      }
      final resp = await api.get('/api/servers/$uid');
      final data = resp.data;
      if (data is Map) {
        if (mounted) {
          setState(() {
            _servers = List<Map<String, dynamic>>.from(data['servers'] ?? []);
            _activeServerId = data['activeServerId']?.toString();
            _isLoading = false;
          });
        }
      }
    } catch (e) {
      debugPrint('❌ 加载设备失败: $e');
      if (mounted) setState(() { _isLoading = false; });
    }
  }

  Future<void> _activateServer(String serverId) async {
    try {
      final api = ApiService();
      final uid = _getUserId();
      await api.post('/api/servers/$uid/$serverId/activate', data: {});

      // Save locally
      final server = _servers.firstWhere((s) => s['id'] == serverId);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('active_server_id', serverId);
      if (server['ip'] != null) await prefs.setString('active_server_ip', server['ip'].toString());

      // 标记需要刷新会话（ChatPage 检测到后会清空旧消息）
      await prefs.setBool('need_refresh_after_switch', true);

      // Reconnect WebSocket（清除缓存，强制重新获取新设备信息）
      try {
        final ws = WebSocketService();
        ws.reset();  // 清除旧的 URL/token 缓存
        await Future.delayed(const Duration(milliseconds: 1000));  // 等旧连接完全关闭
        await ws.connect();
      } catch (_) {}

      if (mounted) {
        setState(() => _activeServerId = serverId);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已切换到 ${server['name'] ?? '设备'}'), backgroundColor: Constants.primaryColor),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('切换失败: $e')));
      }
    }
  }

  Future<void> _checkServer(String serverId) async {
    try {
      final api = ApiService();
      final uid = _getUserId();
      await api.post('/api/servers/$uid/$serverId/check', data: {});
      _loadServers();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('检查完成')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('检查失败: $e')));
      }
    }
  }

  Future<void> _deleteServer(String serverId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('确认删除'),
        content: const Text('确定要删除这台设备吗？'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('删除', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final api = ApiService();
      final uid = _getUserId();
      await api.delete('/api/servers/$uid/$serverId');
      _loadServers();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('设备已删除')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('删除失败: $e')));
      }
    }
  }

  void _showAddModal([Map<String, dynamic>? existing]) {
    final isEdit = existing != null;
    final nameCtrl = TextEditingController(text: existing?['name'] ?? '');
    final ipCtrl = TextEditingController(text: existing?['ip'] ?? '');
    final portCtrl = TextEditingController(text: (existing?['openclawPort'] ?? 18789).toString());
    final tokenCtrl = TextEditingController(text: existing?['openclawToken'] ?? '');
    final sessionCtrl = TextEditingController(text: existing?['openclawSession'] ?? '');
    final descCtrl = TextEditingController(text: existing?['description'] ?? '');

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
              Text(isEdit ? '编辑设备' : '添加设备', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const Spacer(),
              IconButton(onPressed: () => Navigator.pop(ctx), icon: const Icon(Icons.close)),
            ]),
            const SizedBox(height: 16),
            _buildField('设备名称', nameCtrl, '例：主力服务器'),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(flex: 3, child: _buildField('IP 地址 *', ipCtrl, '192.168.1.100')),
              const SizedBox(width: 12),
              Expanded(flex: 1, child: _buildField('端口', portCtrl, '18789', keyboard: TextInputType.number)),
            ]),
            const SizedBox(height: 12),
            _buildField('OpenClaw Token', tokenCtrl, '控制令牌'),
            const SizedBox(height: 4),
            const Text('在 OpenClaw 配置文件的 control.token 中找到', style: TextStyle(fontSize: 11, color: Colors.grey)),
            const SizedBox(height: 12),
            _buildField('Session ID', sessionCtrl, 'ControlUI URL 中的路径部分'),
            const SizedBox(height: 4),
            const Text('例如 http://ip:18789/8eb2a992/ 中的 8eb2a992', style: TextStyle(fontSize: 11, color: Colors.grey)),
            const SizedBox(height: 12),
            _buildField('备注', descCtrl, '可选'),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () async {
                  if (ipCtrl.text.trim().isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('IP 地址必填')));
                    return;
                  }
                  final api = ApiService();
                  final uid = _getUserId();
                  final body = {
                    'name': nameCtrl.text.trim(),
                    'ip': ipCtrl.text.trim(),
                    'openclawPort': int.tryParse(portCtrl.text.trim()) ?? 18789,
                    'openclawToken': tokenCtrl.text.trim(),
                    'openclawSession': sessionCtrl.text.trim(),
                    'description': descCtrl.text.trim(),
                  };
                  try {
                    if (isEdit) {
                      await api.put('/api/servers/$uid/${existing!['id']}', data: body);
                    } else {
                      await api.post('/api/servers/$uid', data: body);
                    }
                    if (mounted) {
                      Navigator.pop(ctx);
                      _loadServers();
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(isEdit ? '设备已更新' : '设备已添加')));
                    }
                  } catch (e) {
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('保存失败: $e')));
                    }
                  }
                },
                style: ElevatedButton.styleFrom(backgroundColor: Constants.primaryColor, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                child: Text(isEdit ? '更新' : '添加'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildField(String label, TextEditingController ctrl, String hint, {TextInputType? keyboard}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF555555))),
        const SizedBox(height: 4),
        TextField(
          controller: ctrl,
          keyboardType: keyboard,
          decoration: InputDecoration(
            hintText: hint,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFDDDDDD))),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFDDDDDD))),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: Constants.primaryColor)),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            isDense: true,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('🖥️ 设备管理'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadServers),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddModal(),
        backgroundColor: Constants.primaryColor,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('添加设备'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _servers.isEmpty
              ? _buildEmpty()
              : RefreshIndicator(
                  onRefresh: _loadServers,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16).copyWith(bottom: 80),
                    itemCount: _servers.length,
                    itemBuilder: (_, i) => _buildServerCard(_servers[i]),
                  ),
                ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('🖥️', style: TextStyle(fontSize: 48)),
          const SizedBox(height: 12),
          const Text('还没有设备', style: TextStyle(fontSize: 16, color: Color(0xFF888888))),
          const SizedBox(height: 4),
          const Text('点击下方按钮添加你的 OpenClaw 服务器', style: TextStyle(fontSize: 13, color: Color(0xFFAAAAAA))),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: () => _showAddModal(),
            icon: const Icon(Icons.add),
            label: const Text('添加设备'),
            style: ElevatedButton.styleFrom(backgroundColor: Constants.primaryColor, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
          ),
        ],
      ),
    );
  }

  Widget _buildServerCard(Map<String, dynamic> s) {
    final isActive = s['id'] == _activeServerId;
    final status = s['status'] ?? 'pending';
    final statusMap = {'running': ('在线', Colors.green), 'offline': ('离线', Colors.grey), 'pending': ('检查中', Colors.orange), 'unhealthy': ('异常', const Color(0xFFFB923C))};
    final (statusText, statusColor) = statusMap[status] ?? ('未知', Colors.grey);
    final port = s['openclawPort'] ?? 18789;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: isActive ? Border.all(color: Constants.primaryColor, width: 2) : null,
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, 2))],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top row: icon + info + status
            Row(children: [
              Container(
                width: 42, height: 42,
                decoration: BoxDecoration(
                  color: isActive ? Constants.primaryColor.withOpacity(0.1) : const Color(0xFFF0EEFF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(child: Text(isActive ? '🟢' : '🖥️', style: const TextStyle(fontSize: 20))),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Text(s['name'] ?? '未命名', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    if (isActive) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: Constants.primaryColor, borderRadius: BorderRadius.circular(4)),
                        child: const Text('活跃', style: TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ]),
                  const SizedBox(height: 2),
                  Text('${s['ip']}:$port', style: const TextStyle(fontSize: 12, color: Color(0xFF888888), fontFamily: 'monospace')),
                  if (s['description'] != null && s['description'].toString().isNotEmpty)
                    Text(s['description'], style: const TextStyle(fontSize: 11, color: Color(0xFFAAAAAA))),
                ],
              )),
              // Status dot
              Column(children: [
                Container(
                  width: 10, height: 10,
                  decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle, boxShadow: status == 'running' ? [BoxShadow(color: statusColor.withOpacity(0.4), blurRadius: 4)] : null),
                ),
                const SizedBox(height: 4),
                Text(statusText, style: TextStyle(fontSize: 11, color: statusColor, fontWeight: FontWeight.w500)),
              ]),
            ]),
            // Actions
            const SizedBox(height: 12),
            Container(decoration: BoxDecoration(border: Border(top: BorderSide(color: const Color(0xFFF0F0F0))))),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _buildActionChip('🔍', '检查', () => _checkServer(s['id'])),
                if (!isActive) _buildActionChip('⚡', '切换', () => _activateServer(s['id']), primary: true),
                _buildActionChip('✏️', '编辑', () => _showAddModal(s)),
                _buildActionChip('🗑️', '删除', () => _deleteServer(s['id']), danger: true),
              ],
            ),
            if (s['lastCheck'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('最后检查: ${_fmtDate(s['lastCheck'].toString())}', style: const TextStyle(fontSize: 10, color: Color(0xFFBBBBBB))),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionChip(String emoji, String label, VoidCallback onTap, {bool primary = false, bool danger = false}) {
    Color fg;
    Color border;
    if (primary) {
      fg = Constants.primaryColor;
      border = Constants.primaryColor;
    } else if (danger) {
      fg = const Color(0xFFF5576C);
      border = const Color(0xFFF5576C);
    } else {
      fg = const Color(0xFF667eea);
      border = const Color(0xFFDDDDDD);
    }

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(border: Border.all(color: border.withOpacity(primary || danger ? 0.5 : 0.3)), borderRadius: BorderRadius.circular(6)),
        child: Text('$emoji $label', style: TextStyle(fontSize: 12, color: fg, fontWeight: primary ? FontWeight.w600 : FontWeight.normal)),
      ),
    );
  }

  String _fmtDate(String s) {
    try {
      final d = DateTime.parse(s);
      return '${d.month}/${d.day} ${d.hour}:${d.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return s;
    }
  }
}
