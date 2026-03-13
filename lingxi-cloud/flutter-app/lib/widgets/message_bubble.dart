import 'package:flutter/material.dart';
import 'package:lingxicloud/models/message.dart';
import 'package:lingxicloud/utils/constants.dart';

class MessageBubble extends StatelessWidget {
  final Message message;

  const MessageBubble({super.key, required this.message});

  /// 清理消息内容，移除附件标记
  String _cleanContent(String content) {
    // 移除 [附件:...] 标记
    final attachmentRegex = RegExp(r'\[附件:[^\]]+\]');
    String cleaned = content.replaceAll(attachmentRegex, '').trim();
    return cleaned;
  }

  /// 从消息内容中提取附件信息
  Map<String, String>? _extractAttachment(String content) {
    final regex = RegExp(r'\[附件:(图片|文档):([^:]+):([^\]]+)\]');
    final match = regex.firstMatch(content);
    if (match != null) {
      return {
        'type': match.group(1) ?? '',
        'filename': match.group(2) ?? '',
        'url': match.group(3) ?? '',
      };
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final bool isUser = message.role == 'user';
    final attachment = _extractAttachment(message.content);
    final cleanContent = _cleanContent(message.content);
    final hasImage = attachment != null && attachment['type'] == '图片';
    final hasDocument = attachment != null && attachment['type'] == '文档';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      child: Row(
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isUser) ...[
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: Constants.primaryColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(
                Icons.smart_toy,
                size: 16,
                color: Colors.white,
              ),
            ),
            const SizedBox(width: 12),
          ],
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.75,
            ),
            padding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 12,
            ),
            decoration: BoxDecoration(
              color: isUser
                  ? Constants.primaryColor
                  : Colors.grey[200],
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(12),
                topRight: const Radius.circular(12),
                bottomLeft: isUser
                    ? const Radius.circular(12)
                    : const Radius.circular(0),
                bottomRight: isUser
                    ? const Radius.circular(0)
                    : const Radius.circular(12),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 图片预览
                if (hasImage && attachment!['url'] != null)
                  GestureDetector(
                    onTap: () {
                      // 点击图片可以放大查看（TODO: 实现图片查看器）
                    },
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(
                        attachment['url']!,
                        width: 120,
                        height: 120,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) {
                          return Container(
                            width: 120,
                            height: 120,
                            color: Colors.grey[300],
                            child: Icon(Icons.broken_image, color: Colors.grey),
                          );
                        },
                      ),
                    ),
                  ),
                // 文档预览
                if (hasDocument && attachment!['url'] != null)
                  GestureDetector(
                    onTap: () {
                      // TODO: 打开文档
                    },
                    child: Container(
                      padding: EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.insert_drive_file, size: 24, color: isUser ? Colors.white : Colors.grey[600]),
                          SizedBox(width: 8),
                          Text(
                            attachment['filename'] ?? '文档',
                            style: TextStyle(
                              color: isUser ? Colors.white : Constants.textPrimaryColor,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (hasImage || hasDocument) SizedBox(height: 8),
                // 文本内容
                if (cleanContent.isNotEmpty)
                  SelectableText(
                    cleanContent,
                    style: TextStyle(
                      color: isUser ? Colors.white : Constants.textPrimaryColor,
                      fontSize: 14,
                      height: 1.5,
                    ),
                  ),
              ],
            ),
          ),
          if (isUser) ...[
            const SizedBox(width: 12),
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: Constants.textSecondaryColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(
                Icons.person,
                size: 16,
                color: Constants.textSecondaryColor,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
