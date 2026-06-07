import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lingxicloud/models/message.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:url_launcher/url_launcher.dart';

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

  /// 识别文本中的链接并渲染为可点击的富文本
  /// 链接点击 → 浏览器打开；非链接文字长按 → 复制全文
  Widget _buildRichText(String text, {required bool isUser}) {
    final urlRegex = RegExp(
      r'https?://[^\s<>\[\]{}|\\^`"\')]+',
      caseSensitive: false,
    );

    final matches = urlRegex.allMatches(text);
    if (matches.isEmpty) {
      // 没有链接，用普通的可选中文字
      return SelectableText(
        text,
        style: TextStyle(
          color: isUser ? Colors.white : Constants.textPrimaryColor,
          fontSize: 14,
          height: 1.5,
        ),
        contextMenuBuilder: (context, editableTextState) {
          return _buildContextMenu(editableTextState);
        },
      );
    }

    // 有链接 → 用 RichText 渲染
    final spans = <TextSpan>[];
    int lastEnd = 0;

    for (final match in matches) {
      // 链接前的普通文字
      if (match.start > lastEnd) {
        spans.add(TextSpan(
          text: text.substring(lastEnd, match.start),
          style: TextStyle(
            color: isUser ? Colors.white : Constants.textPrimaryColor,
            fontSize: 14,
            height: 1.5,
          ),
        ));
      }

      // 链接文字（可点击）
      final url = match.group(0);
      spans.add(TextSpan(
        text: url,
        style: TextStyle(
          color: isUser ? const Color(0xFFB3E5FC) : const Color(0xFF1565C0),
          fontSize: 14,
          height: 1.5,
          decoration: TextDecoration.underline,
          decorationColor: isUser ? const Color(0xFFB3E5FC) : const Color(0xFF1565C0),
        ),
        recognizer: TapGestureRecognizer()
          ..onTap = () => _openUrl(url),
      ));

      lastEnd = match.end;
    }

    // 链接后的普通文字
    if (lastEnd < text.length) {
      spans.add(TextSpan(
        text: text.substring(lastEnd),
        style: TextStyle(
          color: isUser ? Colors.white : Constants.textPrimaryColor,
          fontSize: 14,
          height: 1.5,
        ),
      ));
    }

    return GestureDetector(
      onLongPress: () => _copyToClipboard(text),
      child: RichText(
        text: TextSpan(children: spans),
        selectable: true,
      ),
    );
  }

  /// 打开链接
  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  /// 复制到剪贴板
  void _copyToClipboard(String text) {
    Clipboard.setData(ClipboardData(text: text));
  }

  /// 自定义右键菜单（复制）
  AdaptiveTextSelectionToolbar _buildContextMenu(EditableTextState state) {
    final items = [
      ContextMenuButtonItem(
        label: '复制',
        type: ContextMenuButtonType.copy,
        onPressed: () {
          state.copyEnabled ? state.renderEditable.handleCopy() : null;
          Clipboard.setData(ClipboardData(text: state.currentTextEditingValue.selection.textInside(state.currentTextEditingValue.text)));
        },
      ),
    ];
    return AdaptiveTextSelectionToolbar(buttonItems: items, anchors: state.contextMenuAnchors);
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
                // 文本内容（链接可点击，长按复制全文）
                if (cleanContent.isNotEmpty)
                  _buildRichText(cleanContent, isUser: isUser),
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
