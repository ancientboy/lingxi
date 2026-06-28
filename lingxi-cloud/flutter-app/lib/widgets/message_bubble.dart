import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:lingxicloud/models/message.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:markdown/markdown.dart' as md;

class MessageBubble extends StatelessWidget {
  final Message message;

  MessageBubble({super.key, required this.message});

  /// 清理消息内容，移除附件标记
  String _cleanContent(String content) {
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

  /// 打开链接
  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  /// 复制到剪贴板
  void _copyToClipboard(BuildContext context, String text) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('已复制到剪贴板'),
        duration: Duration(seconds: 1),
        behavior: SnackBarBehavior.floating,
        margin: EdgeInsets.only(bottom: 80, left: 16, right: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        backgroundColor: Constants.textSecondaryColor,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bool isUser = message.role == 'user';
    final attachment = _extractAttachment(message.content);
    final cleanContent = _cleanContent(message.content);
    final hasImage = attachment != null && attachment['type'] == '图片';
    final hasDocument = attachment != null && attachment['type'] == '文档';
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;

    return Container(
      margin: EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isUser) ...[
            // 助手头像
            Container(
              width: 30,
              height: 30,
              margin: EdgeInsets.only(top: 2),
              decoration: BoxDecoration(
                color: Constants.primaryColor,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                Icons.smart_toy,
                size: 15,
                color: Colors.white,
              ),
            ),
            SizedBox(width: 10),
          ],
          // 气泡主体
          GestureDetector(
            onLongPress: () => _copyToClipboard(context, cleanContent),
            child: Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.78,
              ),
              padding: EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 10,
              ),
              decoration: BoxDecoration(
                color: isUser
                    ? Constants.primaryColor
                    : isDarkMode
                        ? Color(0xFF2D2D30)
                        : Colors.white,
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(14),
                  topRight: Radius.circular(14),
                  bottomLeft: isUser
                      ? Radius.circular(14)
                      : Radius.circular(3),
                  bottomRight: isUser
                      ? Radius.circular(3)
                      : Radius.circular(14),
                ),
                border: isUser
                    ? null
                    : Border.all(
                        color: isDarkMode
                            ? Color(0xFF3D3D40)
                            : Color(0xFFE5E5E5),
                        width: 0.5,
                      ),
                boxShadow: isUser
                    ? null
                    : [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.04),
                          blurRadius: 6,
                          offset: Offset(0, 1),
                        ),
                      ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 图片预览
                  if (hasImage && attachment!['url'] != null)
                    GestureDetector(
                      onTap: () {
                        // TODO: 图片查看器
                      },
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.network(
                          attachment['url']!,
                          width: 160,
                          height: 160,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return Container(
                              width: 160,
                              height: 160,
                              color: isDarkMode
                                  ? Color(0xFF3D3D40)
                                  : Colors.grey[200],
                              child: Icon(Icons.broken_image,
                                  color: isDarkMode
                                      ? Colors.grey[600]
                                      : Colors.grey),
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
                        padding: EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: isUser
                              ? Colors.white.withOpacity(0.15)
                              : isDarkMode
                                  ? Color(0xFF3D3D40)
                                  : Color(0xFFF5F5F5),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.insert_drive_file,
                                size: 22,
                                color: isUser
                                    ? Colors.white
                                    : Constants.textSecondaryColor),
                            SizedBox(width: 8),
                            Text(
                              attachment['filename'] ?? '文档',
                              style: TextStyle(
                                color: isUser
                                    ? Colors.white
                                    : Constants.textPrimaryColor,
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
                    isUser
                        ? _buildUserText(cleanContent)
                        : _buildAssistantMarkdown(context, cleanContent),
                ],
              ),
            ),
          ),
          if (isUser) ...[
            SizedBox(width: 10),
            // 用户头像
            Container(
              width: 30,
              height: 30,
              margin: EdgeInsets.only(top: 2),
              decoration: BoxDecoration(
                color: Constants.textSecondaryColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                Icons.person,
                size: 15,
                color: Constants.textSecondaryColor,
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// 用户消息：简单富文本（链接可点击）
  Widget _buildUserText(String text) {
    final urlRegex = RegExp(
      r'https://[^\s<>\[\]{}|\\^]+',
      caseSensitive: false,
    );
    final matches = urlRegex.allMatches(text);
    if (matches.isEmpty) {
      return SelectableText(
        text,
        style: TextStyle(
          color: Colors.white,
          fontSize: 14,
          height: 1.55,
        ),
      );
    }

    final spans = <TextSpan>[];
    int lastEnd = 0;
    for (final match in matches) {
      if (match.start > lastEnd) {
        spans.add(TextSpan(
          text: text.substring(lastEnd, match.start),
          style: TextStyle(
            color: Colors.white,
            fontSize: 14,
            height: 1.55,
          ),
        ));
      }
      final url = match.group(0);
      spans.add(TextSpan(
        text: url,
        style: TextStyle(
          color: Color(0xFFB3E5FC),
          fontSize: 14,
          height: 1.55,
          decoration: TextDecoration.underline,
          decorationColor: Color(0xFFB3E5FC),
        ),
        recognizer: TapGestureRecognizer()..onTap = () => _openUrl(url!),
      ));
      lastEnd = match.end;
    }
    if (lastEnd < text.length) {
      spans.add(TextSpan(
        text: text.substring(lastEnd),
        style: TextStyle(
          color: Colors.white,
          fontSize: 14,
          height: 1.55,
        ),
      ));
    }

    return SelectionArea(
      child: RichText(
        text: TextSpan(children: spans),
      ),
    );
  }

  /// 助手消息：Markdown 渲染
  Widget _buildAssistantMarkdown(BuildContext context, String text) {
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;

    return MarkdownBody(
      data: text,
      onTapLink: (text, href, title) {
        if (href != null) _openUrl(href);
      },
      builders: {
        'code': _CodeBlockBuilder(isDarkMode: isDarkMode),
      },
      extensionSet: md.ExtensionSet(
        md.ExtensionSet.gitHubFlavored.blockSyntaxes,
        [
          md.EmojiSyntax(),
          ...md.ExtensionSet.gitHubFlavored.inlineSyntaxes,
        ],
      ),
      styleSheet: MarkdownStyleSheet(
        // 段落
        p: TextStyle(
          color: isDarkMode ? Color(0xFFE0E0E0) : Constants.textPrimaryColor,
          fontSize: 14,
          height: 1.65,
        ),
        // 标题
        h1: TextStyle(
          color: isDarkMode ? Color(0xFFF0F0F0) : Constants.textPrimaryColor,
          fontSize: 18,
          fontWeight: FontWeight.w700,
          height: 1.4,
        ),
        h2: TextStyle(
          color: isDarkMode ? Color(0xFFF0F0F0) : Constants.textPrimaryColor,
          fontSize: 16,
          fontWeight: FontWeight.w600,
          height: 1.4,
        ),
        h3: TextStyle(
          color: isDarkMode ? Color(0xFFF0F0F0) : Constants.textPrimaryColor,
          fontSize: 15,
          fontWeight: FontWeight.w600,
          height: 1.4,
        ),
        h4: TextStyle(
          color: isDarkMode ? Color(0xFFE0E0E0) : Constants.textPrimaryColor,
          fontSize: 14,
          fontWeight: FontWeight.w600,
          height: 1.4,
        ),
        // 加粗
        strong: TextStyle(
          color: isDarkMode ? Color(0xFFF0F0F0) : Constants.textPrimaryColor,
          fontWeight: FontWeight.w700,
        ),
        // 斜体
        em: TextStyle(fontStyle: FontStyle.italic),
        // 链接
        a: TextStyle(
          color: Constants.primaryColor,
          decoration: TextDecoration.underline,
          decorationColor: Constants.primaryColor,
        ),
        // 行内代码
        code: TextStyle(
          color: isDarkMode ? Color(0xFF90CAF9) : Constants.primaryColor,
          backgroundColor: isDarkMode
              ? Color(0xFF3D3D40)
              : Color(0xFFF3F4F6),
          fontSize: 13,
          fontFamily: 'SF Mono',
        ),
        // 代码块
        codeblockDecoration: BoxDecoration(
          color: isDarkMode ? Color(0xFF1E1E2E) : Color(0xFF1E1E2E),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isDarkMode ? Color(0xFF3D3D40) : Color(0xFF2D2D30),
            width: 0.5,
          ),
        ),
        codeblockPadding: EdgeInsets.all(12),
        // codeblockAlign: not available in flutter_markdown 0.6.x
        // 引用
        blockquote: TextStyle(
          color: isDarkMode ? Color(0xFF9CA3AF) : Constants.textSecondaryColor,
          fontSize: 14,
          height: 1.55,
        ),
        blockquoteDecoration: BoxDecoration(
          color: isDarkMode
              ? Color(0xFF2D2D30)
              : Color(0xFFF5F5F5),
          borderRadius: BorderRadius.only(
            topRight: Radius.circular(8),
            bottomRight: Radius.circular(8),
          ),
          border: Border(
            left: BorderSide(
              color: Constants.primaryColor,
              width: 3,
            ),
          ),
        ),
        blockquotePadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        // 列表
        listBullet: TextStyle(
          color: isDarkMode ? Color(0xFF9CA3AF) : Constants.textSecondaryColor,
          fontSize: 14,
        ),
        listIndent: 20,
        // 表格
        tableBody: TextStyle(
          color: isDarkMode ? Color(0xFFE0E0E0) : Constants.textPrimaryColor,
          fontSize: 13,
          height: 1.45,
        ),
        tableHead: TextStyle(
          color: isDarkMode ? Color(0xFFF0F0F0) : Constants.textPrimaryColor,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
        tableBorder: TableBorder.all(
          color: isDarkMode ? Color(0xFF3D3D40) : Color(0xFFE5E5E5),
          width: 0.5,
        ),
        tableCellsPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        // 分隔线
        horizontalRuleDecoration: BoxDecoration(
          border: Border(
            top: BorderSide(
              color: isDarkMode ? Color(0xFF3D3D40) : Color(0xFFE5E5E5),
              width: 0.5,
            ),
          ),
        ),
        // 列表间距
        listBulletPadding: EdgeInsets.only(top: 4, bottom: 4),
      ),
    );
  }
}

/// 自定义代码块渲染器（带语言标签 + 复制按钮）
class _CodeBlockBuilder extends MarkdownElementBuilder {
  final bool isDarkMode;
  _CodeBlockBuilder({required this.isDarkMode});

  @override
  Widget? visitElementAfterWithContext(
    BuildContext context,
    md.Element element,
    TextStyle? _,
    TextStyle? __,
  ) {
    final code = element.textContent;
    // 提取语言标签（从 class 属性）
    final langClass = element.attributes['class'] ?? '';
    final lang = langClass.replaceFirst('language-', '').trim();
    final showLang = lang.isNotEmpty && lang != 'text';

    return Container(
      margin: EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: Color(0xFF1E1E2E),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isDarkMode ? Color(0xFF3D3D40) : Color(0xFF2D2D30),
          width: 0.5,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 顶部栏：语言标签 + 复制按钮
          if (showLang || true) // 始终显示顶栏
            Container(
              padding: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Color(0xFF2D2D3D),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(10),
                  topRight: Radius.circular(10),
                ),
                border: Border(
                  bottom: BorderSide(
                    color: Color(0xFF3D3D4D),
                    width: 0.5,
                  ),
                ),
              ),
              child: Row(
                children: [
                  // 语言标签
                  if (showLang)
                    Container(
                      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Color(0xFF3D3D4D),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        lang.toUpperCase(),
                        style: TextStyle(
                          color: Color(0xFF8E8EA0),
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          fontFamily: 'SF Mono',
                        ),
                      ),
                    ),
                  Spacer(),
                  // 复制按钮
                  Builder(
                    builder: (ctx) => GestureDetector(
                      onTap: () {
                        Clipboard.setData(ClipboardData(text: code));
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          SnackBar(
                            content: Text('代码已复制'),
                            duration: Duration(seconds: 1),
                            behavior: SnackBarBehavior.floating,
                            margin: EdgeInsets.only(bottom: 80, left: 16, right: 16),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            backgroundColor: Color(0xFF10A37F),
                          ),
                        );
                      },
                      child: Container(
                        padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Color(0xFF3D3D4D),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.copy_rounded, size: 12, color: Color(0xFF8E8EA0)),
                            SizedBox(width: 4),
                            Text(
                              '复制',
                              style: TextStyle(
                                color: Color(0xFF8E8EA0),
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          // 代码内容
          Padding(
            padding: EdgeInsets.all(14),
            child: SelectableText(
              code,
              style: TextStyle(
                color: Color(0xFFCDD6F4),
                fontFamily: 'SF Mono',
                fontSize: 12.5,
                height: 1.6,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
