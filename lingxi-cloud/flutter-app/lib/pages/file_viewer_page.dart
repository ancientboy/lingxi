import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/services/api_service.dart';

class FileViewerPage extends StatefulWidget {
  final String filePath;
  final String fileName;
  FileViewerPage({super.key, required this.filePath, required this.fileName});

  @override
  State<FileViewerPage> createState() => _FileViewerPageState();
}

class _FileViewerPageState extends State<FileViewerPage> {
  bool _isLoading = true;
  String? _error;
  String _content = '';
  int _fileSize = 0;

  @override
  void initState() {
    super.initState();
    _loadFile();
  }

  Future<void> _loadFile() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final apiService = ApiService();
      final data = await apiService.getFile(widget.filePath);

      if (data != null) {
        final size = data['size'];
        if (size != null) {
          final sizeInt = size is int ? size : int.tryParse(size.toString()) ?? 0;
          // 5MB 限制
          if (sizeInt > 5 * 1024 * 1024) {
            setState(() {
              _error = '文件太大（${_formatSize(sizeInt)}），不支持在线查看';
              _isLoading = false;
            });
            return;
          }
          _fileSize = sizeInt;
        }

        setState(() {
          _content = data['content']?.toString() ?? '';
          _isLoading = false;
        });
      } else {
        setState(() {
          _error = '无法加载文件';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = '加载失败: $e';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.fileName,
          style: TextStyle(fontSize: 16),
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh),
            onPressed: _isLoading ? null : _loadFile,
            tooltip: '刷新',
          ),
        ],
      ),
      body: _isLoading
          ? Center(child: CircularProgressIndicator())
          : _error != null
              ? _buildErrorView()
              : _buildContent(),
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.error_outline, size: 48, color: Constants.textLightColor),
          SizedBox(height: 16),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              _error ?? '未知错误',
              style: TextStyle(color: Constants.textSecondaryColor),
              textAlign: TextAlign.center,
            ),
          ),
          SizedBox(height: 16),
          if (_error?.contains('太大') != true)
            ElevatedButton(
              onPressed: _loadFile,
              style: ElevatedButton.styleFrom(
                backgroundColor: Constants.primaryColor,
                foregroundColor: Colors.white,
              ),
              child: Text('重试'),
            ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    return Column(
      children: [
        // 文件信息栏
        Container(
          width: double.infinity,
          padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: Colors.grey.shade100,
          child: Row(
            children: [
              Icon(Icons.insert_drive_file, size: 14, color: Constants.textLightColor),
              SizedBox(width: 6),
              Expanded(
                child: Text(
                  widget.filePath,
                  style: TextStyle(
                    fontSize: 12,
                    color: Constants.textSecondaryColor,
                    fontFamily: 'monospace',
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              SizedBox(width: 8),
              Text(
                _formatSize(_fileSize),
                style: TextStyle(
                  fontSize: 12,
                  color: Constants.textLightColor,
                ),
              ),
            ],
          ),
        ),
        Divider(height: 1),

        // 文件内容
        Expanded(
          child: Container(
            color: Color(0xFF1E1E1E),
            child: SingleChildScrollView(
              padding: EdgeInsets.all(16),
              child: SelectableText(
                _content.isEmpty ? '（空文件）' : _content,
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 13,
                  color: Color(0xFFD4D4D4),
                  height: 1.5,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    if (bytes < 1024 * 1024 * 1024) return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
  }
}
