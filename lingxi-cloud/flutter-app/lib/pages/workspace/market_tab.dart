import 'package:flutter/material.dart';
import 'package:lingxicloud/services/api_service.dart';

class MarketTab extends StatefulWidget {
  final bool dk;
  final VoidCallback? onTeamChanged;
  const MarketTab({super.key, required this.dk, this.onTeamChanged});

  @override
  State<MarketTab> createState() => _MarketTabState();
}

class _MarketTabState extends State<MarketTab> {
  List<Map<String, dynamic>> _agents = [];
  bool _loading = true;
  String _category = 'all';
  String _sort = 'popular'; // popular | newest
  String _searchQuery = '';
  String? _errorMessage;
  final _searchCtrl = TextEditingController();

  static const _categories = ['all', 'dev', 'content', 'ops', 'assistant'];
  static const _categoryLabels = {
    'all': '全部', 'dev': '开发', 'content': '内容', 'ops': '运营', 'assistant': '个人助理',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _errorMessage = null; });
    try {
      final resp = await ApiService().get('/api/market/list', queryParameters: {
        if (_category != 'all') 'category': _category,
        'sort': _sort,
        if (_searchQuery.isNotEmpty) 'search': _searchQuery,
      });
      final data = resp.data;
      if (data is Map && data['success'] == true && data['items'] != null) {
        if (mounted) setState(() {
          _agents = List<Map<String, dynamic>>.from(data['items']);
          _loading = false;
        });
      } else if (data is List) {
        if (mounted) setState(() {
          _agents = List<Map<String, dynamic>>.from(data);
          _loading = false;
        });
      } else {
        if (mounted) setState(() { _agents = []; _loading = false; });
      }
    } catch (e) {
      if (mounted) setState(() {
        _errorMessage = '加载市场失败: $e';
        _agents = [];
        _loading = false;
      });
    }
  }

  Future<void> _installAgent(Map<String, dynamic> agent) async {
    final id = (agent['id'] ?? '').toString();
    final name = (agent['name'] ?? '').toString();
    if (id.isEmpty) return;

    // Step 1: Confirmation dialog (like web version)
    final confirm = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: const Text('安装确认'),
      content: Text('确定要将「$name」添加到你的团队吗？\n安装后会自动部署到你的设备。'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('取消')),
        ElevatedButton(
          onPressed: () => Navigator.pop(c, true),
          style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF667eea), foregroundColor: Colors.white),
          child: const Text('确定安装'),
        ),
      ],
    ));
    if (confirm != true) return;

    // Step 2: Call install API
    try {
      final resp = await ApiService().post('/api/market/install/$id', data: {});
      if (resp.data is Map && resp.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('安装成功！$name 已添加到团队')));
          widget.onTeamChanged?.call();
          _load();
        }
      } else {
        final msg = (resp.data is Map) ? (resp.data['message'] ?? '安装失败') : '安装失败';
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('安装失败: $msg')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('安装失败: $e')));
    }
  }

  Future<void> _showDetail(Map<String, dynamic> agent) async {
    final id = (agent['id'] ?? '').toString();
    if (id.isEmpty) return;

    final dk = widget.dk;
    final textColor = dk ? Colors.white : Colors.black87;
    final bg = dk ? const Color(0xFF1E1E38) : Colors.white;

    showDialog(context: context, barrierDismissible: false, builder: (ctx) => const Center(child: CircularProgressIndicator()));

    try {
      final resp = await ApiService().get('/api/market/detail/$id');
      Navigator.of(context).pop(); // dismiss loading

      final data = resp.data;
      Map<String, dynamic> detail;
      if (data is Map && data['success'] == true && data['item'] != null) {
        detail = Map<String, dynamic>.from(data['item']);
      } else if (data is Map) {
        detail = Map<String, dynamic>.from(data);
      } else {
        detail = Map<String, dynamic>.from(agent);
      }

      if (mounted) {
        showModalBottomSheet(
          context: context,
          backgroundColor: Colors.transparent,
          isScrollControlled: true,
          builder: (ctx) => Container(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.85),
            decoration: BoxDecoration(color: bg, borderRadius: const BorderRadius.vertical(top: Radius.circular(20))),
            padding: EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)))),
              const SizedBox(height: 16),
              // Header
              Row(children: [
                Container(
                  width: 50, height: 50,
                  decoration: BoxDecoration(
                    color: const Color(0xFF667eea).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Center(child: Text(
                    (detail['name'] ?? '?').toString().substring(0, (detail['name'] ?? '?').toString().length >= 2 ? 2 : 1),
                    style: TextStyle(color: Color(0xFF667eea), fontWeight: FontWeight.w700, fontSize: 18),
                  )),
                ),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Flexible(child: Text(detail['name'] ?? '', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18, color: textColor))),
                    if (detail['official'] == true || detail['author'] == '官方') ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: const Color(0xFF667eea).withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
                        child: const Text('官方', style: TextStyle(fontSize: 9, color: Color(0xFF667eea), fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ]),
                  if ((detail['category'] ?? '').isNotEmpty)
                    Text(_categoryLabels[detail['category']] ?? detail['category'].toString(), style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                ])),
                IconButton(
                  icon: Icon(Icons.close, color: Colors.grey.shade400),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ]),
              const SizedBox(height: 12),
              Text(detail['description'] ?? '', style: TextStyle(fontSize: 14, color: Colors.grey.shade600, height: 1.5)),
              const SizedBox(height: 12),
              // Stats
              Row(children: [
                Icon(Icons.download, size: 14, color: Colors.grey.shade500),
                const SizedBox(width: 4),
                Text('${detail['installs'] ?? 0} 安装', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                const SizedBox(width: 16),
                Icon(Icons.star, size: 14, color: Colors.amber.shade600),
                const SizedBox(width: 4),
                Text('${(detail['rating'] ?? 0.0).toStringAsFixed(1)}', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
              ]),
              // Tags
              if ((detail['tags'] as List?)?.isNotEmpty == true) ...[
                const SizedBox(height: 10),
                Wrap(spacing: 6, runSpacing: 4, children: (detail['tags'] as List).map<Widget>((t) => Container(
                  padding: EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: const Color(0xFF667eea).withOpacity(0.08), borderRadius: BorderRadius.circular(6)),
                  child: Text(t.toString(), style: TextStyle(fontSize: 11, color: Color(0xFF667eea))),
                )).toList()),
              ],
              // SOUL.md preview
              if ((detail['soul'] ?? detail['soulMd'] ?? '').toString().isNotEmpty) ...[
                const SizedBox(height: 16),
                Text('SOUL.md', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: textColor)),
                const SizedBox(height: 6),
                Container(
                  width: double.infinity,
                  constraints: const BoxConstraints(maxHeight: 200),
                  padding: EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: dk ? const Color(0xFF252540) : const Color(0xFFF5F5FA),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: SingleChildScrollView(child: Text(
                    (detail['soul'] ?? detail['soulMd'] ?? '').toString(),
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600, fontFamily: 'monospace', height: 1.5),
                  )),
                ),
              ],
              // Reviews
              if ((detail['reviews'] as List?)?.isNotEmpty == true) ...[
                const SizedBox(height: 16),
                Text('用户评价', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: textColor)),
                const SizedBox(height: 8),
                ...((detail['reviews'] as List).take(3).map<Widget>((r) {
                  final review = r is Map ? Map<String, dynamic>.from(r) : <String, dynamic>{};
                  return Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      ...List.generate(5, (i) => Icon(
                        i < (review['rating'] ?? 0) ? Icons.star : Icons.star_border,
                        size: 12, color: Colors.amber.shade600,
                      )),
                      const SizedBox(width: 8),
                      Expanded(child: Text(review['content'] ?? review['comment'] ?? '',
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600, height: 1.4),
                      )),
                    ]),
                  );
                })),
              ],
              const Spacer(),
              // Install button
              if (detail['installed'] != true) SizedBox(
                width: double.infinity,
                height: 44,
                child: ElevatedButton(
                  onPressed: () { Navigator.pop(ctx); _installAgent(detail); },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF667eea),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('添加到团队', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                ),
              ) else SizedBox(
                width: double.infinity,
                height: 44,
                child: ElevatedButton(
                  onPressed: null,
                  style: ElevatedButton.styleFrom(
                    disabledBackgroundColor: Colors.grey.shade300,
                    disabledForegroundColor: Colors.grey.shade600,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('已添加', style: TextStyle(fontSize: 14)),
                ),
              ),
            ]),
          ),
        );
      }
    } catch (e) {
      Navigator.of(context).pop(); // dismiss loading
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('加载详情失败: $e')));
    }
  }

  Future<void> _showRateDialog(Map<String, dynamic> agent) async {
    int rating = 5;
    final commentCtrl = TextEditingController();

    final result = await showDialog<Map<String, dynamic>>(context: context, builder: (c) {
      return StatefulBuilder(builder: (c, setDialogState) => AlertDialog(
        title: Text('评价「${agent['name']}」'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Row(mainAxisAlignment: MainAxisAlignment.center, children: List.generate(5, (i) => IconButton(
            icon: Icon(i < rating ? Icons.star : Icons.star_border, color: Colors.amber),
            onPressed: () => setDialogState(() => rating = i + 1),
          ))),
          TextField(
            controller: commentCtrl,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: '写下你的评价...',
              border: OutlineInputBorder(),
            ),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('取消')),
          ElevatedButton(
            onPressed: () => Navigator.pop(c, {'rating': rating, 'content': commentCtrl.text}),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF667eea), foregroundColor: Colors.white),
            child: const Text('提交评价'),
          ),
        ],
      ));
    });

    if (result == null) return;
    commentCtrl.dispose();

    try {
      final resp = await ApiService().post('/api/market/rate', data: {
        'itemId': agent['id'],
        'score': (result['rating'] as num).toInt(),
        'review': result['content'],
      });
      if (resp.data is Map && resp.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('评价已提交')));
          _load();
        }
      } else {
        final msg = (resp.data is Map) ? (resp.data['error'] ?? '评价提交失败') : '评价提交失败';
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg.toString())));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('评价提交失败: $e')));
    }
  }

  Future<void> _showPublishDialog() async {
    final nameCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final soulCtrl = TextEditingController();
    final tagsCtrl = TextEditingController();
    String category = 'dev';
    String recommendedModel = '';

    final result = await showDialog<Map<String, dynamic>>(context: context, builder: (c) {
      return StatefulBuilder(builder: (c, setDialogState) => AlertDialog(
        title: const Text('发布 Agent'),
        content: SingleChildScrollView(child: SizedBox(
          width: MediaQuery.of(c).size.width * 0.8,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: '名称 *', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(controller: descCtrl, maxLines: 2, decoration: const InputDecoration(labelText: '描述 *', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: category,
              decoration: const InputDecoration(labelText: '分类', border: OutlineInputBorder()),
              items: _categories.where((c) => c != 'all').map((c) => DropdownMenuItem(value: c, child: Text(_categoryLabels[c] ?? c))).toList(),
              onChanged: (v) => setDialogState(() => category = v ?? 'dev'),
            ),
            const SizedBox(height: 12),
            TextField(controller: tagsCtrl, decoration: const InputDecoration(labelText: '标签（逗号分隔）', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(controller: soulCtrl, maxLines: 6, decoration: const InputDecoration(labelText: 'SOUL.md *', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(controller: TextEditingController(text: recommendedModel), decoration: const InputDecoration(labelText: '推荐模型', border: OutlineInputBorder()),
              onChanged: (v) => recommendedModel = v,
            ),
          ]),
        )),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('取消')),
          ElevatedButton(
            onPressed: () {
              if (nameCtrl.text.isEmpty || descCtrl.text.isEmpty || soulCtrl.text.isEmpty) {
                ScaffoldMessenger.of(c).showSnackBar(const SnackBar(content: Text('请填写必填字段')));
                return;
              }
              Navigator.pop(c, {
                'name': nameCtrl.text,
                'description': descCtrl.text,
                'soulMd': soulCtrl.text,
                'category': category,
                'tags': tagsCtrl.text.split(',').map((t) => t.trim()).where((t) => t.isNotEmpty).toList(),
                'model': recommendedModel,
              });
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF667eea), foregroundColor: Colors.white),
            child: const Text('发布'),
          ),
        ],
      ));
    });

    if (result == null) {
      nameCtrl.dispose(); descCtrl.dispose(); soulCtrl.dispose(); tagsCtrl.dispose();
      return;
    }

    try {
      final resp = await ApiService().post('/api/market/publish', data: result);
      if (resp.data is Map && resp.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Agent 发布成功！')));
          _load();
        }
      } else {
        final msg = (resp.data is Map) ? (resp.data['message'] ?? '发布失败') : '发布失败';
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('发布失败: $msg')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('发布失败: $e')));
    } finally {
      nameCtrl.dispose(); descCtrl.dispose(); soulCtrl.dispose(); tagsCtrl.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    final dk = widget.dk;
    final textColor = dk ? Colors.white : Colors.black87;
    final cardBg = dk ? const Color(0xFF252540) : Colors.white;
    final fieldBg = dk ? const Color(0xFF1E1E38) : const Color(0xFFF0EDE8);

    return Column(children: [
      // Top bar: search + publish button
      Container(
        padding: EdgeInsets.fromLTRB(16, 10, 16, 8),
        color: dk ? const Color(0xFF1A1A2E) : Colors.white,
        child: Row(children: [
          Expanded(child: TextField(
            controller: _searchCtrl,
            style: TextStyle(fontSize: 14, color: textColor),
            decoration: InputDecoration(
              hintText: '搜索 Agent...',
              hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 14),
              prefixIcon: Icon(Icons.search, size: 20, color: Colors.grey.shade400),
              suffixIcon: _searchQuery.isNotEmpty ? IconButton(
                icon: Icon(Icons.clear, size: 18, color: Colors.grey.shade400),
                onPressed: () { _searchCtrl.clear(); setState(() => _searchQuery = ''); _load(); },
              ) : null,
              filled: true, fillColor: fieldBg,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              contentPadding: EdgeInsets.symmetric(vertical: 8),
              isDense: true,
            ),
            onChanged: (v) => setState(() => _searchQuery = v),
            onSubmitted: (_) => _load(),
          )),
          const SizedBox(width: 8),
          ElevatedButton.icon(
            onPressed: _showPublishDialog,
            icon: const Icon(Icons.publish, size: 16),
            label: const Text('发布'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF667eea),
              foregroundColor: Colors.white,
              padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
          ),
        ]),
      ),
      // Category tabs
      Container(
        height: 44,
        color: dk ? const Color(0xFF1A1A2E) : Colors.white,
        child: Row(children: [
          // Categories
          Expanded(child: ListView(scrollDirection: Axis.horizontal, padding: EdgeInsets.symmetric(horizontal: 8),
            children: _categories.map((c) {
              final active = _category == c;
              return GestureDetector(
                onTap: () { setState(() => _category = c); _load(); },
                child: Container(
                  padding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(border: Border(bottom: BorderSide(color: active ? const Color(0xFF667eea) : Colors.transparent, width: 2))),
                  child: Text(_categoryLabels[c]!, style: TextStyle(fontSize: 13, fontWeight: active ? FontWeight.w600 : FontWeight.normal, color: active ? const Color(0xFF667eea) : (dk ? Colors.white54 : Colors.black45))),
                ),
              );
            }).toList(),
          )),
          // Sort buttons
          Container(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Row(children: [
              _sortChip('热门', 'popular', dk),
              const SizedBox(width: 4),
              _sortChip('最新', 'newest', dk),
            ]),
          ),
        ]),
      ),
      const Divider(height: 1),
      Expanded(child: _loading
        ? const Center(child: CircularProgressIndicator())
        : _errorMessage != null
          ? Center(child: Padding(
              padding: EdgeInsets.all(24),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.error_outline, size: 48, color: Colors.red.shade300),
                const SizedBox(height: 12),
                Text(_errorMessage!, style: TextStyle(color: Colors.red.shade400, fontSize: 14), textAlign: TextAlign.center),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: _load,
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('重试'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF667eea), foregroundColor: Colors.white),
                ),
              ]),
            ))
          : RefreshIndicator(
          onRefresh: _load,
          child: _agents.isEmpty
            ? ListView(children: [SizedBox(height: 200, child: Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.storefront_outlined, size: 48, color: Colors.grey.shade300),
                const SizedBox(height: 12),
                Text('暂无可安装的 Agent', style: TextStyle(color: Colors.grey.shade400, fontSize: 14)),
              ])))])
            : GridView.builder(
                padding: EdgeInsets.all(16),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.72),
                itemCount: _agents.length,
                itemBuilder: (_, i) => _buildCard(_agents[i], dk, cardBg, textColor),
              ),
        ),
      ),
    ]);
  }

  Widget _sortChip(String label, String value, bool dk) {
    final active = _sort == value;
    return GestureDetector(
      onTap: () { setState(() => _sort = value); _load(); },
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF667eea).withOpacity(0.1) : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(label, style: TextStyle(fontSize: 11, color: active ? const Color(0xFF667eea) : (dk ? Colors.white38 : Colors.black38), fontWeight: active ? FontWeight.w600 : FontWeight.normal)),
      ),
    );
  }

  Widget _buildCard(Map<String, dynamic> agent, bool dk, Color cardBg, Color textColor) {
    final name = agent['name'] ?? '未知';
    final desc = agent['description'] ?? '';
    final tags = (agent['tags'] as List?)?.cast<String>() ?? <String>[];
    final rating = (agent['rating'] ?? 0.0).toDouble();
    final installs = agent['installs'] ?? 0;
    final author = agent['author'] ?? '';
    final id = (agent['id'] ?? '').toString();
    final installed = agent['installed'] == true;
    final official = agent['official'] == true || author == '官方';

    final catColors = {
      'dev': const Color(0xFF4facfe), 'content': const Color(0xFFa18cd1),
      'ops': const Color(0xFFfa709a), 'assistant': const Color(0xFF667eea),
      'marketing': const Color(0xFFfa709a), 'data': const Color(0xFF43e97b),
      'productivity': const Color(0xFF667eea),
    };
    final cat = agent['category'] ?? 'general';
    final color = catColors[cat] ?? const Color(0xFF888888);

    return GestureDetector(
      onTap: () => _showDetail(agent),
      child: Container(
        padding: EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: cardBg,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(10)),
              child: Center(child: Text(name.length >= 2 ? name.substring(0, 2) : name, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 13))),
            ),
            const SizedBox(width: 8),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(child: Text(name, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: textColor), maxLines: 1, overflow: TextOverflow.ellipsis)),
                if (official) ...[
                  const SizedBox(width: 4),
                  const Icon(Icons.verified, size: 14, color: Color(0xFF667eea)),
                ],
              ]),
              if (author.isNotEmpty) Text(author, style: TextStyle(fontSize: 10, color: Colors.grey.shade400)),
            ])),
          ]),
          const SizedBox(height: 8),
          Expanded(child: Text(desc, style: TextStyle(fontSize: 11, color: Colors.grey.shade500, height: 1.4), maxLines: 3, overflow: TextOverflow.ellipsis)),
          const SizedBox(height: 8),
          if (tags.isNotEmpty) Wrap(spacing: 4, runSpacing: 4, children: tags.take(3).map((t) => Container(
            padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(color: Colors.grey.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
            child: Text(t, style: TextStyle(fontSize: 9, color: Colors.grey.shade600)),
          )).toList()),
          const SizedBox(height: 8),
          Row(children: [
            Icon(Icons.star, size: 12, color: Colors.amber.shade600),
            const SizedBox(width: 2),
            Text(rating.toStringAsFixed(1), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: textColor)),
            const SizedBox(width: 8),
            Text('$installs 安装', style: TextStyle(fontSize: 10, color: Colors.grey.shade400)),
            const Spacer(),
            if (installed)
              Container(
                padding: EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: Colors.grey.withOpacity(0.15), borderRadius: BorderRadius.circular(8)),
                child: const Text('已添加', style: TextStyle(fontSize: 11, color: Colors.grey)),
              )
            else SizedBox(
              height: 28,
              child: ElevatedButton(
                onPressed: () => _installAgent(agent),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF667eea),
                  foregroundColor: Colors.white,
                  padding: EdgeInsets.symmetric(horizontal: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  minimumSize: Size.zero,
                ),
                child: const Text('添加', style: TextStyle(fontSize: 12)),
              ),
            ),
          ]),
          // Rate button
          if (installed) ...[
            const SizedBox(height: 6),
            Align(alignment: Alignment.centerRight,
              child: InkWell(
                onTap: () => _showRateDialog(agent),
                child: Text('评价', style: TextStyle(fontSize: 11, color: const Color(0xFF667eea), decoration: TextDecoration.underline)),
              ),
            ),
          ],
        ]),
      ),
    );
  }
}
