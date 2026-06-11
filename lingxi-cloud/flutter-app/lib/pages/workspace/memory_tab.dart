import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:lingxicloud/services/api_service.dart';

class MemoryTab extends StatefulWidget {
  final bool dk;
  const MemoryTab({super.key, required this.dk});

  @override
  State<MemoryTab> createState() => _MemoryTabState();
}

class _MemoryTabState extends State<MemoryTab> {
  int _subTab = 0; // 0: my memory, 1: team memory, 2: search

  // My Memory state
  List<Map<String, dynamic>> _files = [];
  String? _selectedFilePath;
  String _fileContent = '';
  bool _filesLoading = false;
  bool _contentLoading = false;
  String? _filesError;
  String? _contentError;

  // Team Memory state
  List<Map<String, dynamic>> _categories = [];
  bool _teamLoading = false;
  String? _teamError;
  Set<String> _expandedCategories = {};

  // Search state
  String _searchQuery = '';
  List<Map<String, dynamic>> _searchResults = [];
  bool _searchLoading = false;
  String? _searchError;
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadSubTab();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  void _switchSubTab(int index) {
    setState(() => _subTab = index);
    _loadSubTab();
  }

  void _loadSubTab() {
    switch (_subTab) {
      case 0: _loadFiles(); break;
      case 1: _loadTeam(); break;
      case 2: break; // search on demand
    }
  }

  // ============ My Memory ============

  Future<void> _loadFiles() async {
    setState(() { _filesLoading = true; _filesError = null; });
    try {
      final resp = await ApiService().get('/api/memory/files');
      final data = resp.data;
      if (data is Map && data['files'] != null) {
        if (mounted) setState(() {
          _files = List<Map<String, dynamic>>.from(data['files']);
          _filesLoading = false;
        });
      } else if (data is List) {
        if (mounted) setState(() {
          _files = List<Map<String, dynamic>>.from(data);
          _filesLoading = false;
        });
      } else {
        if (mounted) setState(() { _files = []; _filesLoading = false; });
      }
    } catch (e) {
      if (mounted) setState(() {
        _filesError = '加载文件列表失败: $e';
        _filesLoading = false;
      });
    }
  }

  Future<void> _loadFileContent(String path) async {
    setState(() { _contentLoading = true; _contentError = null; _selectedFilePath = path; _fileContent = ''; });
    try {
      final resp = await ApiService().get('/api/memory/content', queryParameters: {'path': path});
      final data = resp.data;
      if (data is Map && data['content'] != null) {
        if (mounted) setState(() {
          _fileContent = data['content'].toString();
          _contentLoading = false;
        });
      } else {
        if (mounted) setState(() { _fileContent = ''; _contentLoading = false; });
      }
    } catch (e) {
      if (mounted) setState(() {
        _contentError = '加载文件内容失败: $e';
        _contentLoading = false;
      });
    }
  }

  // ============ Team Memory ============

  Future<void> _loadTeam() async {
    setState(() { _teamLoading = true; _teamError = null; });
    try {
      final resp = await ApiService().get('/api/memory/team');
      final data = resp.data;
      if (data is Map && data['categories'] != null) {
        if (mounted) setState(() {
          _categories = List<Map<String, dynamic>>.from(data['categories']);
          _teamLoading = false;
        });
      } else if (data is Map && data['success'] == true && data['memories'] != null) {
        // Fallback: group flat memories by category
        final memories = List<Map<String, dynamic>>.from(data['memories']);
        final grouped = <String, List<Map<String, dynamic>>>{};
        for (final m in memories) {
          final cat = (m['category'] ?? '未分类').toString();
          grouped.putIfAbsent(cat, () => []).add(m);
        }
        if (mounted) setState(() {
          _categories = grouped.entries.map((e) => {'name': e.key, 'items': e.value}).toList();
          _teamLoading = false;
        });
      } else {
        if (mounted) setState(() { _categories = []; _teamLoading = false; });
      }
    } catch (e) {
      if (mounted) setState(() {
        _teamError = '加载团队记忆失败: $e';
        _teamLoading = false;
      });
    }
  }

  Future<void> _addTeamMemory() async {
    String category = '';
    bool newCategory = false;
    final contentCtrl = TextEditingController();
    final categoryCtrl = TextEditingController();
    final newCategoryCtrl = TextEditingController();

    final result = await showDialog<Map<String, String>>(context: context, builder: (c) {
      return StatefulBuilder(builder: (c, setDialogState) => AlertDialog(
        title: const Text('添加团队记忆'),
        content: SingleChildScrollView(child: SizedBox(
          width: MediaQuery.of(c).size.width * 0.8,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            // Category selector
            Row(children: [
              const Text('分类：', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
              const SizedBox(width: 8),
              DropdownButton<String>(
                value: newCategory ? '__new__' : (category.isEmpty ? null : category),
                hint: const Text('选择分类'),
                items: [
                  ..._categories.map((c) => DropdownMenuItem(
                    value: (c['name'] ?? '').toString(),
                    child: Text((c['name'] ?? '').toString()),
                  )),
                  const DropdownMenuItem(value: '__new__', child: Text('+ 新建分类')),
                ],
                onChanged: (v) {
                  setDialogState(() {
                    if (v == '__new__') { newCategory = true; } else { newCategory = false; category = v ?? ''; }
                  });
                },
              ),
            ]),
            if (newCategory) ...[
              const SizedBox(height: 12),
              TextField(
                controller: newCategoryCtrl,
                decoration: const InputDecoration(labelText: '新分类名称', border: OutlineInputBorder()),
              ),
            ],
            const SizedBox(height: 16),
            TextField(
              controller: contentCtrl,
              maxLines: 5,
              decoration: const InputDecoration(labelText: '记忆内容 *', border: OutlineInputBorder()),
            ),
          ]),
        )),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('取消')),
          ElevatedButton(
            onPressed: () {
              if (contentCtrl.text.isEmpty) {
                ScaffoldMessenger.of(c).showSnackBar(const SnackBar(content: Text('请输入记忆内容')));
                return;
              }
              Navigator.pop(c, {
                'category': newCategory ? newCategoryCtrl.text : category,
                'content': contentCtrl.text,
              });
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF667eea), foregroundColor: Colors.white),
            child: const Text('添加'),
          ),
        ],
      ));
    });

    contentCtrl.dispose(); categoryCtrl.dispose(); newCategoryCtrl.dispose();
    if (result == null) return;

    try {
      final resp = await ApiService().post('/api/memory/team', data: result);
      if (resp.data is Map && resp.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('记忆已添加')));
          _loadTeam();
        }
      } else {
        final msg = (resp.data is Map) ? (resp.data['message'] ?? '添加失败') : '添加失败';
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('添加失败: $msg')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('添加失败: $e')));
    }
  }

  Future<void> _deleteTeamMemory(String content) async {
    final confirm = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: const Text('删除记忆'),
      content: const Text('确定要删除这条记忆吗？'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('取消')),
        TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('删除', style: TextStyle(color: Colors.red))),
      ],
    ));
    if (confirm != true) return;

    try {
      final resp = await ApiService().delete('/api/memory/team', data: {'content': content});
      if (resp.data is Map && resp.data['success'] == true) {
        if (mounted) { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已删除'))); _loadTeam(); }
      } else {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('删除失败')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('删除失败: $e')));
    }
  }

  // ============ Search ============

  Future<void> _doSearch(String q) async {
    if (q.trim().isEmpty) { setState(() => _searchResults = []); return; }
    setState(() { _searchLoading = true; _searchError = null; });
    try {
      final resp = await ApiService().get('/api/memory/search', queryParameters: {'q': q});
      final data = resp.data;
      if (data is Map && data['results'] != null) {
        if (mounted) setState(() {
          _searchResults = List<Map<String, dynamic>>.from(data['results']);
          _searchLoading = false;
        });
      } else {
        if (mounted) setState(() { _searchResults = []; _searchLoading = false; });
      }
    } catch (e) {
      if (mounted) setState(() {
        _searchError = '搜索失败: $e';
        _searchResults = [];
        _searchLoading = false;
      });
    }
  }

  void _openSearchResult(Map<String, dynamic> result) {
    final path = (result['path'] ?? result['file'] ?? '').toString();
    if (path.isEmpty) return;
    setState(() => _subTab = 0);
    _loadFiles().then((_) => _loadFileContent(path));
  }

  // ============ Build ============

  @override
  Widget build(BuildContext context) {
    final dk = widget.dk;
    final textColor = dk ? Colors.white : Colors.black87;

    return Column(children: [
      // Sub-tab bar
      Container(
        height: 44,
        color: dk ? const Color(0xFF1A1A2E) : Colors.white,
        child: Row(children: [
          _subTabBtn('我的记忆', 0),
          _subTabBtn('团队记忆', 1),
          _subTabBtn('搜索', 2),
        ]),
      ),
      const Divider(height: 1),
      Expanded(child: _buildSubTabContent(dk, textColor)),
    ]);
  }

  Widget _subTabBtn(String text, int index) {
    final active = _subTab == index;
    return Expanded(child: GestureDetector(
      onTap: () => _switchSubTab(index),
      child: Container(
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: active ? const Color(0xFF667eea) : Colors.transparent, width: 2))),
        alignment: Alignment.center,
        child: Text(text, style: TextStyle(
          fontSize: 13,
          fontWeight: active ? FontWeight.w600 : FontWeight.normal,
          color: active ? const Color(0xFF667eea) : (widget.dk ? Colors.white54 : Colors.black45),
        )),
      ),
    ));
  }

  Widget _buildSubTabContent(bool dk, Color textColor) {
    switch (_subTab) {
      case 0: return _buildMyMemory(dk, textColor);
      case 1: return _buildTeamMemory(dk, textColor);
      case 2: return _buildSearch(dk, textColor);
      default: return const SizedBox();
    }
  }

  // ============ My Memory Layout ============

  Widget _buildMyMemory(bool dk, Color textColor) {
    final cardBg = dk ? const Color(0xFF252540) : Colors.white;
    final panelBg = dk ? const Color(0xFF1E1E38) : const Color(0xFFF5F5FA);

    if (_filesLoading) return const Center(child: CircularProgressIndicator());
    if (_filesError != null) return _buildErrorView(_filesError!, _loadFiles, dk);

    return Row(children: [
      // Left panel: file list
      Container(
        width: 180,
        decoration: BoxDecoration(
          color: panelBg,
          border: Border(right: BorderSide(color: Colors.grey.withOpacity(0.15))),
        ),
        child: _files.isEmpty
          ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.folder_open, size: 32, color: Colors.grey.shade300),
              const SizedBox(height: 8),
              Text('暂无文件', style: TextStyle(color: Colors.grey.shade400, fontSize: 12)),
            ]))
          : ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: _files.length,
              itemBuilder: (_, i) => _buildFileItem(_files[i], dk),
            ),
      ),
      // Right panel: file content
      Expanded(child: _contentLoading
        ? const Center(child: CircularProgressIndicator())
        : _contentError != null
          ? _buildErrorView(_contentError!, () => _loadFileContent(_selectedFilePath!), dk)
          : _selectedFilePath == null
            ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.description_outlined, size: 48, color: Colors.grey.shade300),
                const SizedBox(height: 12),
                Text('选择左侧文件查看内容', style: TextStyle(color: Colors.grey.shade400, fontSize: 14)),
              ]))
            : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  color: dk ? const Color(0xFF1A1A2E) : Colors.white,
                  child: Row(children: [
                    Icon(Icons.description, size: 16, color: const Color(0xFF667eea)),
                    const SizedBox(width: 8),
                    Expanded(child: Text(
                      _selectedFilePath!.split('/').last,
                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: textColor),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    )),
                    Text(_selectedFilePath!, style: TextStyle(fontSize: 10, color: Colors.grey.shade400)),
                  ]),
                ),
                const Divider(height: 1),
                Expanded(child: SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: _fileContent.isEmpty
                    ? Center(child: Text('文件为空', style: TextStyle(color: Colors.grey.shade400, fontSize: 14)))
                    : MarkdownBody(data: _fileContent, selectable: true),
                )),
              ]),
      ),
    ]);
  }

  Widget _buildFileItem(Map<String, dynamic> file, bool dk) {
    final name = (file['name'] ?? file['path'] ?? '未知').toString();
    final path = (file['path'] ?? file['name'] ?? '').toString();
    final selected = _selectedFilePath == path;

    return ListTile(
      dense: true,
      selected: selected,
      selectedTileColor: const Color(0xFF667eea).withOpacity(0.08),
      leading: Icon(Icons.description_outlined, size: 18, color: selected ? const Color(0xFF667eea) : Colors.grey.shade500),
      title: Text(name, style: TextStyle(fontSize: 12, color: selected ? const Color(0xFF667eea) : (dk ? Colors.white70 : Colors.black87)), maxLines: 1, overflow: TextOverflow.ellipsis),
      onTap: () => _loadFileContent(path),
    );
  }

  // ============ Team Memory Layout ============

  Widget _buildTeamMemory(bool dk, Color textColor) {
    final cardBg = dk ? const Color(0xFF252540) : Colors.white;

    if (_teamLoading) return const Center(child: CircularProgressIndicator());
    if (_teamError != null) return _buildErrorView(_teamError!, _loadTeam, dk);

    return Column(children: [
      // Add button bar
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        color: dk ? const Color(0xFF1A1A2E) : Colors.white,
        child: Row(children: [
          Text('${_categories.fold<int>(0, (sum, c) => sum + ((c['items'] as List?)?.length ?? 0))} 条记忆',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF667eea)),
          ),
          const Spacer(),
          ElevatedButton.icon(
            onPressed: _addTeamMemory,
            icon: const Icon(Icons.add, size: 16),
            label: const Text('添加记忆'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF667eea),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
          ),
        ]),
      ),
      const Divider(height: 1),
      Expanded(child: _categories.isEmpty
        ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.group_outlined, size: 48, color: Colors.grey.shade300),
            const SizedBox(height: 12),
            Text('暂无团队记忆', style: TextStyle(color: Colors.grey.shade400, fontSize: 14)),
          ]))
        : RefreshIndicator(
          onRefresh: _loadTeam,
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: _categories.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) => _buildCategoryCard(_categories[i], dk, cardBg, textColor),
          ),
        ),
      ),
    ]);
  }

  Widget _buildCategoryCard(Map<String, dynamic> cat, bool dk, Color cardBg, Color textColor) {
    final name = (cat['name'] ?? '未分类').toString();
    final items = (cat['items'] as List?) ?? [];
    final expanded = _expandedCategories.contains(name);

    return Container(
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(children: [
        // Category header
        GestureDetector(
          onTap: () => setState(() {
            if (_expandedCategories.contains(name)) { _expandedCategories.remove(name); } else { _expandedCategories.add(name); }
          }),
          child: Container(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Icon(expanded ? Icons.expand_less : Icons.expand_more, color: const Color(0xFF667eea), size: 20),
              const SizedBox(width: 8),
              Text(name, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: textColor)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: const Color(0xFF667eea).withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                child: Text('${items.length}', style: const TextStyle(fontSize: 10, color: Color(0xFF667eea), fontWeight: FontWeight.w600)),
              ),
            ]),
          ),
        ),
        // Items
        if (expanded && items.isNotEmpty) ...[
          Divider(height: 1, color: Colors.grey.withOpacity(0.1)),
          ...items.map((item) {
            final content = (item is Map ? (item['content'] ?? item['value'] ?? '') : item.toString()).toString();
            return _buildMemoryItem(content, dk);
          }),
        ],
      ]),
    );
  }

  Widget _buildMemoryItem(String content, bool dk) {
    return InkWell(
      onTap: () {},
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 6, height: 6, margin: const EdgeInsets.only(top: 6),
            decoration: const BoxDecoration(color: Color(0xFF667eea), shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(content, style: TextStyle(fontSize: 13, color: dk ? Colors.white70 : Colors.black87, height: 1.4))),
          IconButton(
            icon: Icon(Icons.delete_outline, size: 16, color: Colors.red.shade300),
            onPressed: () => _deleteTeamMemory(content),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
          ),
        ]),
      ),
    );
  }

  // ============ Search Layout ============

  Widget _buildSearch(bool dk, Color textColor) {
    final cardBg = dk ? const Color(0xFF252540) : Colors.white;
    final fieldBg = dk ? const Color(0xFF1E1E38) : const Color(0xFFF0EDE8);

    return Column(children: [
      Container(
        padding: const EdgeInsets.all(16),
        color: dk ? const Color(0xFF1A1A2E) : Colors.white,
        child: TextField(
          controller: _searchCtrl,
          style: TextStyle(fontSize: 14, color: textColor),
          decoration: InputDecoration(
            hintText: '搜索记忆...',
            hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 14),
            prefixIcon: Icon(Icons.search, size: 20, color: Colors.grey.shade400),
            suffixIcon: _searchQuery.isNotEmpty ? IconButton(
              icon: Icon(Icons.clear, size: 18, color: Colors.grey.shade400),
              onPressed: () { _searchCtrl.clear(); setState(() => _searchQuery = ''); _searchResults = []; },
            ) : null,
            filled: true, fillColor: fieldBg,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            contentPadding: const EdgeInsets.symmetric(vertical: 10),
          ),
          onChanged: (v) => setState(() => _searchQuery = v),
          onSubmitted: _doSearch,
        ),
      ),
      const Divider(height: 1),
      Expanded(child: _searchLoading
        ? const Center(child: CircularProgressIndicator())
        : _searchError != null
          ? _buildErrorView(_searchError!, () => _doSearch(_searchQuery), dk)
          : _searchResults.isEmpty
            ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.search, size: 48, color: Colors.grey.shade300),
                const SizedBox(height: 12),
                Text('输入关键词搜索记忆', style: TextStyle(color: Colors.grey.shade400, fontSize: 14)),
              ]))
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: _searchResults.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) => _buildSearchResult(_searchResults[i], dk, cardBg, textColor),
              ),
      ),
    ]);
  }

  Widget _buildSearchResult(Map<String, dynamic> result, bool dk, Color cardBg, Color textColor) {
    final path = (result['path'] ?? result['file'] ?? '').toString();
    final snippet = (result['snippet'] ?? result['content'] ?? '').toString();
    final score = result['score'] ?? result['relevance'] ?? 0.0;

    return GestureDetector(
      onTap: () => _openSearchResult(result),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: cardBg,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.description_outlined, size: 16, color: const Color(0xFF667eea)),
            const SizedBox(width: 8),
            Expanded(child: Text(path.split('/').last, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: textColor), maxLines: 1, overflow: TextOverflow.ellipsis)),
            if (score > 0) Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(color: const Color(0xFF667eea).withOpacity(0.08), borderRadius: BorderRadius.circular(4)),
              child: Text('相关度 ${(score * 100).toInt()}%', style: const TextStyle(fontSize: 10, color: Color(0xFF667eea))),
            ),
          ]),
          if (path.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(path, style: TextStyle(fontSize: 10, color: Colors.grey.shade400), maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
          if (snippet.isNotEmpty) ...[
            const SizedBox(height: 6),
            _buildHighlightedSnippet(snippet, _searchQuery, dk),
          ],
        ]),
      ),
    );
  }

  Widget _buildHighlightedSnippet(String snippet, String query, bool dk) {
    if (query.isEmpty) return Text(snippet, style: TextStyle(fontSize: 12, color: Colors.grey.shade500, height: 1.4), maxLines: 3, overflow: TextOverflow.ellipsis);

    final lowerSnippet = snippet.toLowerCase();
    final lowerQuery = query.toLowerCase();
    final idx = lowerSnippet.indexOf(lowerQuery);

    if (idx < 0) return Text(snippet, style: TextStyle(fontSize: 12, color: Colors.grey.shade500, height: 1.4), maxLines: 3, overflow: TextOverflow.ellipsis);

    final before = snippet.substring(0, idx);
    final match = snippet.substring(idx, idx + query.length);
    final after = snippet.substring(idx + query.length);

    return RichText(
      maxLines: 3,
      overflow: TextOverflow.ellipsis,
      text: TextSpan(style: TextStyle(fontSize: 12, color: Colors.grey.shade500, height: 1.4), children: [
        TextSpan(text: before),
        TextSpan(text: match, style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF667eea), backgroundColor: Color(0x15667eea))),
        TextSpan(text: after),
      ]),
    );
  }

  // ============ Error View ============

  Widget _buildErrorView(String error, VoidCallback retry, bool dk) {
    return Center(child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.error_outline, size: 48, color: Colors.red.shade300),
        const SizedBox(height: 12),
        Text(error, style: TextStyle(color: Colors.red.shade400, fontSize: 14), textAlign: TextAlign.center),
        const SizedBox(height: 16),
        ElevatedButton.icon(
          onPressed: retry,
          icon: const Icon(Icons.refresh, size: 16),
          label: const Text('重试'),
          style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF667eea), foregroundColor: Colors.white),
        ),
      ]),
    ));
  }
}
