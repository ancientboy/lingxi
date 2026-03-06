import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:lingxicloud/utils/constants.dart';

/// 文件类型
enum FileType {
  image,
  pdf,
  document,
  other,
}

/// 文件信息
class FileInfo {
  final String path;
  final String name;
  final FileType type;

  FileInfo({
    required this.path,
    required this.name,
    required this.type,
  });
}

/// 文件预览组件
class FilePreview extends StatefulWidget {
  final List<FileInfo> files;
  final String? serverIp;
  final int? serverPort;
  final String? serverToken;
  final bool isDarkMode;

  const FilePreview({
    super.key,
    required this.files,
    this.serverIp,
    this.serverPort,
    this.serverToken,
    this.isDarkMode = false,
  });

  /// 从消息文本中提取文件路径
  static List<FileInfo> extractFiles(String text) {
    final files = <FileInfo>[];
    
    // 支持的文件扩展名
    final extensions = [
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'txt', 'md', 'json'
    ];
    
    // 构建正则表达式
    final extPattern = extensions.join('|');
    final pattern = RegExp(
      '([^\\s<>"\']*\\.(' + extPattern + '))',
      caseSensitive: false,
    );
    
    for (final match in pattern.allMatches(text)) {
      var filePath = match.group(1) ?? '';
      
      // 清理 Markdown 符号
      filePath = filePath
          .replaceAll(RegExp(r'^`+|`+$'), '')
          .replaceAll(RegExp(r'^\*+|\*+$'), '')
          .replaceAll(RegExp(r'^_+|_+$'), '')
          .trim();
      
      final filename = filePath.split('/').last;
      
      // 去重
      if (!files.any((f) => f.path == filePath)) {
        files.add(FileInfo(
          path: filePath,
          name: filename,
          type: _getFileType(filename),
        ));
      }
    }
    
    return files;
  }

  /// 获取文件类型
  static FileType _getFileType(String filename) {
    final ext = '.${filename.split('.').last.toLowerCase()}';
    
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].contains(ext)) {
      return FileType.image;
    }
    if (ext == '.pdf') {
      return FileType.pdf;
    }
    if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].contains(ext)) {
      return FileType.document;
    }
    return FileType.other;
  }

  @override
  State<FilePreview> createState() => _FilePreviewState();
}

class _FilePreviewState extends State<FilePreview> {
  /// 生成文件预览 URL
  String _getFileUrl(String filePath) {
    if (widget.serverIp == null || widget.serverIp!.isEmpty) {
      return '';
    }
    
    // 提取相对路径
    var cleanPath = filePath;
    
    if (cleanPath.contains('/root/.openclaw/workspace/')) {
      cleanPath = cleanPath.split('/root/.openclaw/workspace/')[1];
    } else if (cleanPath.startsWith('/workspace/')) {
      cleanPath = cleanPath.replaceFirst('/workspace/', '');
    } else if (cleanPath.startsWith('./')) {
      cleanPath = cleanPath.replaceFirst('./', '');
    }
    
    final port = widget.serverPort ?? 9876;
    var url = 'http://${widget.serverIp}:$port/preview?path=${Uri.encodeComponent(cleanPath)}';
    
    if (widget.serverToken != null && widget.serverToken!.isNotEmpty) {
      url += '&token=${Uri.encodeComponent(widget.serverToken!)}';
    }
    
    return url;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.files.isEmpty) {
      return const SizedBox.shrink();
    }
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: widget.files.map((file) {
        final fileUrl = _getFileUrl(file.path);
        
        if (fileUrl.isEmpty) {
          return _buildErrorCard(file, '未配置服务器');
        }
        
        switch (file.type) {
          case FileType.image:
            return _buildImageCard(file, fileUrl);
          case FileType.pdf:
            return _buildPdfCard(file, fileUrl);
          case FileType.document:
            return _buildDocumentCard(file, fileUrl);
          default:
            return _buildOtherCard(file, fileUrl);
        }
      }).toList(),
    );
  }

  /// 图片卡片（小尺寸预览）
  Widget _buildImageCard(FileInfo file, String url) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      constraints: const BoxConstraints(maxWidth: 280), // 限制最大宽度
      decoration: BoxDecoration(
        color: widget.isDarkMode ? const Color(0xFF444654) : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 图片预览（小尺寸）
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            child: GestureDetector(
              onTap: () => _showImagePreview(file.name, url),
              child: Hero(
                tag: url,
                child: Image.network(
                  url,
                  width: double.infinity,
                  height: 150, // 固定高度，显示小一点
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    height: 100,
                    color: Colors.grey.shade300,
                    child: const Center(
                      child: Icon(Icons.broken_image, size: 48, color: Colors.grey),
                    ),
                  ),
                  loadingBuilder: (context, child, loadingProgress) {
                    if (loadingProgress == null) return child;
                    return Container(
                      height: 150,
                      color: Colors.grey.shade200,
                      child: Center(
                        child: CircularProgressIndicator(
                          value: loadingProgress.expectedTotalBytes != null
                              ? loadingProgress.cumulativeBytesLoaded / loadingProgress.expectedTotalBytes!
                              : null,
                          color: Constants.primaryColor,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
          // 文件信息
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Icon(Icons.image, size: 16, color: widget.isDarkMode ? Colors.grey.shade400 : Colors.grey.shade600),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    file.name,
                    style: TextStyle(
                      fontSize: 12,
                      color: widget.isDarkMode ? Colors.grey.shade300 : Colors.grey.shade700,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                // 点击放大提示
                Icon(Icons.zoom_in, size: 16, color: widget.isDarkMode ? Colors.grey.shade500 : Colors.grey.shade400),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 显示图片全屏预览
  void _showImagePreview(String filename, String url) {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(10),
        child: Stack(
          alignment: Alignment.center,
          children: [
            // 图片
            GestureDetector(
              onTap: () => Navigator.pop(context),
              child: Hero(
                tag: url,
                child: InteractiveViewer(
                  minScale: 0.5,
                  maxScale: 4.0,
                  child: Image.network(
                    url,
                    fit: BoxFit.contain,
                    loadingBuilder: (context, child, loadingProgress) {
                      if (loadingProgress == null) return child;
                      return Container(
                        height: 200,
                        color: Colors.black54,
                        child: Center(
                          child: CircularProgressIndicator(
                            value: loadingProgress.expectedTotalBytes != null
                                ? loadingProgress.cumulativeBytesLoaded / loadingProgress.expectedTotalBytes!
                                : null,
                            color: Colors.white,
                          ),
                        ),
                      );
                    },
                    errorBuilder: (_, __, ___) => Container(
                      height: 200,
                      color: Colors.black54,
                      child: const Center(
                        child: Icon(Icons.broken_image, size: 64, color: Colors.white54),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            // 关闭按钮
            Positioned(
              top: 0,
              right: 0,
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white, size: 28),
                onPressed: () => Navigator.pop(context),
              ),
            ),
            // 文件名
            Positioned(
              bottom: 10,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  filename,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// PDF 卡片
  Widget _buildPdfCard(FileInfo file, String url) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: widget.isDarkMode ? const Color(0xFF444654) : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.red.shade100,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.picture_as_pdf, color: Colors.red.shade700),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  file.name,
                  style: TextStyle(
                    fontWeight: FontWeight.w500,
                    color: widget.isDarkMode ? Colors.white : Colors.black87,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  'PDF 文档',
                  style: TextStyle(
                    fontSize: 12,
                    color: widget.isDarkMode ? Colors.grey.shade400 : Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          // 预览按钮
          IconButton(
            icon: Icon(Icons.visibility, color: Constants.primaryColor),
            onPressed: () => _openUrl(url),
            tooltip: '预览',
          ),
          // 下载按钮
          IconButton(
            icon: Icon(Icons.download, color: Constants.primaryColor),
            onPressed: () => _openUrl('$url&download=1'),
            tooltip: '下载',
          ),
        ],
      ),
    );
  }

  /// 文档卡片
  Widget _buildDocumentCard(FileInfo file, String url) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: widget.isDarkMode ? const Color(0xFF444654) : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.blue.shade100,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.description, color: Colors.blue.shade700),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  file.name,
                  style: TextStyle(
                    fontWeight: FontWeight.w500,
                    color: widget.isDarkMode ? Colors.white : Colors.black87,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  '文档文件',
                  style: TextStyle(
                    fontSize: 12,
                    color: widget.isDarkMode ? Colors.grey.shade400 : Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          // 下载按钮
          IconButton(
            icon: Icon(Icons.download, color: Constants.primaryColor),
            onPressed: () => _openUrl('$url&download=1'),
            tooltip: '下载',
          ),
        ],
      ),
    );
  }

  /// 其他文件卡片
  Widget _buildOtherCard(FileInfo file, String url) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: widget.isDarkMode ? const Color(0xFF444654) : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.grey.shade200,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.insert_drive_file, color: Colors.grey.shade700),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              file.name,
              style: TextStyle(
                fontWeight: FontWeight.w500,
                color: widget.isDarkMode ? Colors.white : Colors.black87,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          // 下载按钮
          IconButton(
            icon: Icon(Icons.download, color: Constants.primaryColor),
            onPressed: () => _openUrl('$url&download=1'),
            tooltip: '下载',
          ),
        ],
      ),
    );
  }

  /// 错误卡片
  Widget _buildErrorCard(FileInfo file, String error) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: Colors.red.shade700),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  file.name,
                  style: const TextStyle(fontWeight: FontWeight.w500),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  '无法预览: $error',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.red.shade700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 打开 URL
  void _openUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
