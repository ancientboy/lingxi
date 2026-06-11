import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:lingxicloud/services/api_service.dart';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';

class KnowledgeTab extends StatefulWidget {
  final bool dk;
  const KnowledgeTab({super.key, required this.dk});

  @override
  State<KnowledgeTab> createState() => _KnowledgeTabState();
}

class _KnowledgeTabState extends State<KnowledgeTab> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String _query = '';
  String? _errorMessage;
  final _searchCtrl = TextEditingController();

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
      final resp = await ApiService().get('/api/knowledge/list');
      final data = resp.data;
      if (data is Map && data['success'] == true && data['items'] != null) {
        if (mounted) setState(() {
          _items = List<Map<String, dynamic>>.from(data['items']);
          _loading = false;
        });
      } else if (data is List) {
        if (mounted) setState(() {
          _items = List<Map<String, dynamic>>.from(data);
          _loading = false;
        });
      } else {
        if (mounted) setState(() { _items = []; _loading = false; });
      }
    } catch (e) {
      if (mounted) setState(() {
        _errorMessage = '加载知识库失败: $e';
        _loading = false;
      });
    }
  }

  Future<void> _search(String q) async {
    if (q.trim().isEmpty) { _load(); return; }
    setState(() { _loading = true; _errorMessage = null; });
    try {
      final resp = await ApiService().get('/api/knowledge/search', queryParameters: {'q': q});
      final data = resp.data;
      if (data is Map && data['success'] == true && data['results'] != null) {
        if (mounted) setState(() {
          _items = List<Map<String, dynamic>>.from(data['results']);
          _loading = false;
        });
      } else {
        if (mounted) setState(() { _items = []; _loading = false; });
      }
    } catch (e) {
      if (mounted) setState(() {
        _errorMessage = '搜索失败: $e';
        _items = [];
        _loading = false;
      });
    }
  }

  Future<void> _viewContent(Map<String, dynamic> item) async {
    final id = (item['id'] ?? '').toString();
    if (id.isEmpty) return;

    final dk = widget.dk;
    final textColor = dk ? Colors.white : Colors.black87;
    final bg = dk ? const Color(0xFF1E1E38) : Colors.white;

    // Show loading dialog first
    showDialog(context: context, barrierDismissible: false, builder: (ctx) => const Center(child: CircularProgressIndicator()));

    try {
      final resp = await ApiService().get('/api/knowledge/content/$id');
      Navigator.of(context).pop(); // dismiss loading

      final data = resp.data;
      String content = '';
      if (data is Map && data['content'] != null) {
        content = data['content'].toString();
      } else if (data is Map && data['data'] != null) {
        content = data['data'].toString();
      }

      if (mounted) {
        showModalBottomSheet(
          context: context,
          backgroundColor: Colors.transparent,
          isScrollControlled: true,
          builder: (ctx) => Container(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.8),
            decoration: BoxDecoration(color: bg, borderRadius: const BorderRadius.vertical(top: Radius.circular(20))),
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)))),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(child: Text(
                  (item['filename'] ?? item['title'] ?? '文档详情').toString(),
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: textColor),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                )),
                IconButton(
                  icon: Icon(Icons.close, color: Colors.grey.shade400),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ]),
              const Divider(),
              Flexible(child: SingleChildScrollView(child: MarkdownBody(
                data: content.isEmpty ? '暂无内容' : content,
                selectable: true,
              ))),
            ]),
          ),
        );
      }
    } catch (e) {
      Navigator.of(context).pop(); // dismiss loading
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('加载文档内容失败: $e')));
      }
    }
  }

  Future<void> _uploadFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.any,
        allowMultiple: false,
      );
      if (result == null || result.files.isEmpty) return;

      final file = result.files.first;
      if (file.path == null) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('无法读取文件路径')));
        return;
      }

      // Show uploading indicator
      showDialog(context: context, barrierDismissible: false, builder: (ctx) => const Center(child: CircularProgressIndicator()));

      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(file.path!, filename: file.name),
      });

      final resp = await ApiService().upload('/api/knowledge/upload', formData: formData);
      Navigator.of(context).pop(); // dismiss loading

      if (resp.data is Map && resp.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${file.name} 上传成功')));
          _load();
        }
      } else {
        final msg = (resp.data is Map) ? (resp.data['message'] ?? '上传失败') : '上传失败';
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('上传失败: $msg')));
      }
    } catch (e) {
      // Dismiss loading if still showing
      try { Navigator.of(context).pop(); } catch (_) {}
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('上传失败: $e')));
    }
  }

  Future<void> _deleteDocument(Map<String, dynamic> item) async {
    final name = (item['filename'] ?? item['title'] ?? '此文档').toString();
    final id = (item['id'] ?? '').toString();
    if (id.isEmpty) return;

    final confirm = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: const Text('删除文档'),
      content: Text('确定要删除「$name」吗？此操作不可撤销。'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('取消')),
        TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('删除', style: TextStyle(color: Colors.red))),
      ],
    ));
    if (confirm != true) return;

    try {
      final resp = await ApiService().post('/api/knowledge/delete', data: {'id': id});
      if (resp.data is Map && resp.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('文档已删除')));
          _load();
        }
      } else {
        final msg = (resp.data is Map) ? (resp.data['message'] ?? '删除失败') : '删除失败';
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('删除失败: $msg')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('删除失败: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final dk = widget.dk;
    final textColor = dk ? Colors.white : Colors.black87;
    final cardBg = dk ? const Color(0xFF252540) : Colors.white;
    final fieldBg = dk ? const Color(0xFF1E1E38) : const Color(0xFFF0EDE8);

    return Column(children: [
      // Stats bar + upload button
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        color: dk ? const Color(0xFF1A1A2E) : Colors.white,
        child: Row(children: [
          Icon(Icons.folder_outlined, size: 16, color: const Color(0xFF667eea)),
          const SizedBox(width: 6),
          Text('${_items.length} 个文档', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF667eea))),
          const Spacer(),
          ElevatedButton.icon(
            onPressed: _uploadFile,
            icon: const Icon(Icons.upload_file, size: 16),
            label: const Text('上传'),
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
      // Search bar
      Container(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        color: dk ? const Color(0xFF1A1A2E) : Colors.white,
        child: TextField(
          controller: _searchCtrl,
          style: TextStyle(fontSize: 14, color: textColor),
          decoration: InputDecoration(
            hintText: '搜索知识库...',
            hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 14),
            prefixIcon: Icon(Icons.search, size: 20, color: Colors.grey.shade400),
            suffixIcon: _query.isNotEmpty ? IconButton(
              icon: Icon(Icons.clear, size: 18, color: Colors.grey.shade400),
              onPressed: () { _searchCtrl.clear(); setState(() => _query = ''); _load(); },
            ) : null,
            filled: true, fillColor: fieldBg,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            contentPadding: const EdgeInsets.symmetric(vertical: 10),
          ),
          onChanged: (v) => setState(() => _query = v),
          onSubmitted: _search,
        ),
      ),
      const Divider(height: 1),
      Expanded(child: _loading
        ? const Center(child: CircularProgressIndicator())
        : _errorMessage != null
          ? Center(child: Padding(
              padding: const EdgeInsets.all(24),
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
          child: _items.isEmpty
            ? ListView(children: [SizedBox(height: 200, child: Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.menu_book_outlined, size: 48, color: Colors.grey.shade300),
                const SizedBox(height: 12),
                Text('暂无文档', style: TextStyle(color: Colors.grey.shade400, fontSize: 14)),
                const SizedBox(height: 8),
                Text('点击右上角「上传」添加文档', style: TextStyle(color: Colors.grey.shade400, fontSize: 12)),
              ])))])
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: _items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) => _buildCard(_items[i], dk, cardBg, textColor),
              ),
        ),
      ),
    ]);
  }

  IconData _fileIcon(String? type) {
    switch (type?.toLowerCase()) {
      case 'pdf': return Icons.picture_as_pdf;
      case 'doc': case 'docx': return Icons.description;
      case 'md': case 'markdown': return Icons.article;
      case 'txt': return Icons.text_snippet;
      case 'csv': case 'xlsx': case 'xls': return Icons.table_chart;
      default: return Icons.insert_drive_file;
    }
  }

  String _formatSize(dynamic size) {
    if (size == null) return '';
    final s = (size is num) ? size.toInt() : int.tryParse(size.toString()) ?? 0;
    if (s < 1024) return '$s B';
    if (s < 1024 * 1024) return '${(s / 1024).toStringAsFixed(1)} KB';
    return '${(s / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  Widget _buildCard(Map<String, dynamic> item, bool dk, Color cardBg, Color textColor) {
    final filename = item['filename'] ?? item['title'] ?? '无标题';
    final summary = item['summary'] ?? item['snippet'] ?? '';
    final time = item['uploadedAt'] ?? item['time'] ?? item['createdAt'] ?? '';
    final type = item['type'] ?? '';
    final size = item['size'];
    final snippet = item['snippet'] ?? '';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(color: const Color(0xFF667eea).withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
            child: Icon(_fileIcon(type), size: 18, color: const Color(0xFF667eea)),
          ),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(filename.toString(), style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: textColor), maxLines: 1, overflow: TextOverflow.ellipsis),
            Row(children: [
              if (type.toString().isNotEmpty) ...[
                Text(type.toString().toUpperCase(), style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
                const SizedBox(width: 8),
              ],
              if (_formatSize(size).isNotEmpty) ...[
                Text(_formatSize(size), style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
                const SizedBox(width: 8),
              ],
              if (time.toString().isNotEmpty)
                Text(time.toString().length > 10 ? time.toString().substring(0, 10) : time.toString(),
                  style: TextStyle(fontSize: 10, color: Colors.grey.shade400)),
            ]),
          ])),
        ]),
        if (summary.toString().isNotEmpty || snippet.toString().isNotEmpty) ...[
          const SizedBox(height: 8),
          Text((snippet.isNotEmpty ? snippet : summary).toString(),
            style: TextStyle(fontSize: 12, color: Colors.grey.shade500, height: 1.4),
            maxLines: 2, overflow: TextOverflow.ellipsis,
          ),
        ],
        const SizedBox(height: 10),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          TextButton.icon(
            onPressed: () => _viewContent(item),
            icon: const Icon(Icons.visibility, size: 14),
            label: const Text('查看'),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFF667eea), padding: const EdgeInsets.symmetric(horizontal: 10)),
          ),
          const SizedBox(width: 4),
          TextButton.icon(
            onPressed: () => _deleteDocument(item),
            icon: const Icon(Icons.delete_outline, size: 14),
            label: const Text('删除'),
            style: TextButton.styleFrom(foregroundColor: Colors.red.shade400, padding: const EdgeInsets.symmetric(horizontal: 10)),
          ),
        ]),
      ]),
    );
  }
}
