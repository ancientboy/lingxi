import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:url_launcher/url_launcher.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/models/message.dart';
import 'package:lingxicloud/widgets/file_preview.dart';
import 'package:lingxicloud/widgets/audio_player_widget.dart';
import 'package:lingxicloud/widgets/chat_misc_widgets.dart';

/// 图片预览弹窗
void showImagePreview(BuildContext context, String imageUrl) {
  showDialog(
    context: context,
    builder: (context) => GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      child: Dialog(
        backgroundColor: Colors.transparent,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            InteractiveViewer(
              child: imageUrl.startsWith('data:')
                  ? Image.memory(
                      base64Decode(imageUrl.split(',').last),
                      fit: BoxFit.contain,
                    )
                  : Image.network(
                      imageUrl,
                      fit: BoxFit.contain,
                    ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ElevatedButton.icon(
                  onPressed: () async {
                    try {
                      final uri = Uri.parse(imageUrl);
                      if (await canLaunchUrl(uri)) {
                        await launchUrl(uri, mode: LaunchMode.platformDefault);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('✅ 已在浏览器中打开图片，长按可保存'),
                              backgroundColor: Colors.green,
                            ),
                          );
                        }
                      } else {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('❌ 无法打开图片链接'),
                              backgroundColor: Colors.red,
                            ),
                          );
                        }
                      }
                    } catch (e) {
                      debugPrint('❌ 下载图片失败: $e');
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('下载失败: $e'),
                            backgroundColor: Colors.red,
                          ),
                        );
                      }
                    }
                  },
                  icon: const Icon(Icons.download, size: 18),
                  label: const Text('下载图片'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Constants.primaryColor,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                TextButton.icon(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close, size: 18),
                  label: const Text('关闭'),
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                      side: const BorderSide(color: Colors.white54),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

/// 消息气泡组件
class MessageBubble extends StatelessWidget {
  final String content;
  final bool isUser;
  final String agentId;
  final Map<String, Map<String, dynamic>> agents;
  final bool isDarkMode;
  final String? imageUrl;
  final String? audioUrl;
  final DocumentInfo? documentInfo;
  final String? serverIp;
  final int? serverPort;
  final String? serverToken;
  final Map<String, dynamic>? modelInfo;

  const MessageBubble({
    super.key,
    required this.content,
    required this.isUser,
    required this.agentId,
    required this.agents,
    this.isDarkMode = false,
    this.imageUrl,
    this.audioUrl,
    this.documentInfo,
    this.serverIp,
    this.serverPort,
    this.serverToken,
    this.modelInfo,
  });

  static List<String> extractAudioFiles(String text) {
    final regex = RegExp(r'MEDIA:([^\s\n]+)');
    return regex.allMatches(text).map((m) => m.group(1)!).toList();
  }

  static String _formatModelName(String model) {
    if (model.isEmpty || model == 'auto') return 'Auto';
    final name = model.contains('/') ? model.split('/').last : model;
    const displayMap = {
      'deepseek-v4-pro': 'DeepSeek V4 Pro',
      'glm-5.1': 'GLM-5.2',
      'glm-5.2': 'GLM-5.2',
      'glm-5': 'GLM-5',
      'glm-4': 'GLM-4',
      'gpt-4o': 'GPT-4o',
      'gpt-4o-mini': 'GPT-4o Mini',
      'gpt-4.1': 'GPT-4.1',
      'gpt-5-mini': 'GPT-5 Mini',
      'kimi-k2.6': 'Kimi K2.6',
      'qwen3-max-2026-01-23': 'Qwen3 Max',
      'qwen3.5-plus': 'Qwen3.5 Plus',
      'gpt-5.2': 'GPT-5.2',
      'gpt-5.2-codex': 'GPT-5.2 Codex',
      'gpt-5.3-codex': 'GPT-5.3 Codex',
      'gpt-5.5-high-fast': 'GPT-5.5 Fast',
      'gpt-5.5-high': 'GPT-5.5',
      'claude-4.5-sonnet': 'Claude 4.5 Sonnet',
      'claude-4.5-haiku': 'Claude 4.5 Haiku',
      'claude-4.5-opus': 'Claude 4.5 Opus',
      'claude-4.5-opus-high': 'Claude 4.5 Opus High',
      'claude-4.6-opus-max': 'Claude 4.6 Opus',
      'claude-4.5-sonnet-thinking': 'Claude 4.5 Sonnet Think',
      'claude-4.5-opus-high-thinking': 'Claude 4.5 Opus Think',
      'claude-4.6-opus-max-thinking': 'Claude 4.6 Opus Think',
      'claude-4.6-sonnet-medium-thinking': 'Claude 4.6 Sonnet Think',
      'gemini-3-flash-preview': 'Gemini 3 Flash',
      'kimi-k2.5': 'Kimi K2.5',
      'default': 'Cursor Auto',
      'cu/default': 'Cursor Auto',
      'cu/gpt-5.2': 'GPT-5.2',
      'cu/gpt-5.2-codex': 'GPT-5.2 Codex',
      'cu/gpt-5.3-codex': 'GPT-5.3 Codex',
      'cu/gpt-5.5-high-fast': 'GPT-5.5 Fast',
      'cu/gpt-5.5-high': 'GPT-5.5',
      'cu/claude-4.5-sonnet': 'Claude 4.5 Sonnet',
      'cu/claude-4.5-haiku': 'Claude 4.5 Haiku',
      'cu/claude-4.5-opus': 'Claude 4.5 Opus',
      'cu/claude-4.5-opus-high': 'Claude 4.5 Opus High',
      'cu/claude-4.6-opus-max': 'Claude 4.6 Opus',
      'cu/claude-4.5-sonnet-thinking': 'Claude 4.5 Sonnet Think',
      'cu/claude-4.5-opus-high-thinking': 'Claude 4.5 Opus Think',
      'cu/claude-4.6-opus-max-thinking': 'Claude 4.6 Opus Think',
      'cu/claude-4.6-sonnet-medium-thinking': 'Claude 4.6 Sonnet Think',
      'cu/gemini-3-flash-preview': 'Gemini 3 Flash',
      'cu/kimi-k2.5': 'Kimi K2.5',
    };
    return displayMap[name] ?? displayMap[model] ?? name;
  }

  static Widget _buildHistoryDocumentCard(DocumentInfo doc, bool isDarkMode) {
    final config = _getDocumentConfig(doc.mimeType, doc.filename);

    return Container(
      width: 120,
      height: 120,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: config['gradientColors'] as List<Color>,
        ),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.15),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            top: 8,
            right: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.95),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                config['type'] as String,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: config['accentColor'] as Color,
                ),
              ),
            ),
          ),
          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  config['icon'] as String,
                  style: const TextStyle(fontSize: 40),
                ),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Text(
                    doc.filename.length > 20 ? '${doc.filename.substring(0, 20)}...' : doc.filename,
                    style: const TextStyle(
                      fontSize: 11,
                      color: Colors.white,
                    ),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static Map<String, dynamic> _getDocumentConfig(String mimeType, String filename) {
    final configs = {
      'application/pdf': {
        'type': 'PDF',
        'icon': 'PDF',
        'gradientColors': [const Color(0xFFFF5252), const Color(0xFFFF8A80)],
        'accentColor': const Color(0xFFFF5252),
      },
      'text/markdown': {
        'type': 'MD',
        'icon': 'MD',
        'gradientColors': [const Color(0xFF4CAF50), const Color(0xFF81C784)],
        'accentColor': const Color(0xFF4CAF50),
      },
      'text/html': {
        'type': 'HTML',
        'icon': '<>',
        'gradientColors': [const Color(0xFFFF9800), const Color(0xFFFFB74D)],
        'accentColor': const Color(0xFFFF9800),
      },
      'text/csv': {
        'type': 'CSV',
        'icon': 'CSV',
        'gradientColors': [const Color(0xFF2196F3), const Color(0xFF64B5F6)],
        'accentColor': const Color(0xFF2196F3),
      },
      'application/json': {
        'type': 'JSON',
        'icon': '{ }',
        'gradientColors': [const Color(0xFF9C27B0), const Color(0xFFBA68C8)],
        'accentColor': const Color(0xFF9C27B0),
      },
      'text/plain': {
        'type': 'TXT',
        'icon': 'TXT',
        'gradientColors': [const Color(0xFF757575), const Color(0xFF9E9E9E)],
        'accentColor': const Color(0xFF757575),
      },
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        'type': 'DOCX',
        'icon': 'W',
        'gradientColors': [const Color(0xFF2196F3), const Color(0xFF42A5F5)],
        'accentColor': const Color(0xFF1565C0),
      },
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        'type': 'XLSX',
        'icon': 'X',
        'gradientColors': [const Color(0xFF4CAF50), const Color(0xFF66BB6A)],
        'accentColor': const Color(0xFF2E7D32),
      },
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
        'type': 'PPTX',
        'icon': 'P',
        'gradientColors': [const Color(0xFFFF9800), const Color(0xFFFFA726)],
        'accentColor': const Color(0xFFE65100),
      },
      'application/msword': {
        'type': 'DOC',
        'icon': 'W',
        'gradientColors': [const Color(0xFF2196F3), const Color(0xFF42A5F5)],
        'accentColor': const Color(0xFF1565C0),
      },
      'application/vnd.ms-excel': {
        'type': 'XLS',
        'icon': 'X',
        'gradientColors': [const Color(0xFF4CAF50), const Color(0xFF66BB6A)],
        'accentColor': const Color(0xFF2E7D32),
      },
      'application/vnd.ms-powerpoint': {
        'type': 'PPT',
        'icon': 'P',
        'gradientColors': [const Color(0xFFFF9800), const Color(0xFFFFA726)],
        'accentColor': const Color(0xFFE65100),
      },
    };

    if (filename.endsWith('.md')) {
      return configs['text/markdown']!;
    }

    return configs[mimeType] ?? {
      'type': 'FILE',
      'icon': '📎',
      'gradientColors': [const Color(0xFF667eea), const Color(0xFF764ba2)],
      'accentColor': const Color(0xFF667eea),
    };
  }

  @override
  Widget build(BuildContext context) {
    final bgColor = isUser
        ? (isDarkMode ? const Color(0xFF444654) : Constants.primaryColor)
        : (isDarkMode ? const Color(0xFF343541) : Constants.surfaceColor);
    final textColor = isDarkMode
        ? const Color(0xFFECECF1)
        : (isUser ? Colors.white : Constants.textPrimaryColor);
    final iconColor = isDarkMode ? const Color(0xFF10A37F) : Constants.primaryColor;

    final agent = agents[agentId];
    String agentName = 'AI';
    IconData? agentIcon;

    if (agent != null) {
      final nameValue = agent['name'];
      if (nameValue is String) {
        agentName = nameValue;
      } else if (nameValue != null) {
        agentName = nameValue.toString();
      }
      final iconValue = agent['icon'];
      if (iconValue is IconData) {
        agentIcon = iconValue;
      }
    }

    final imageRegex = RegExp(r'!\[([^\]]*)\]\(([^)]+)\)');
    final markdownImages = <Map<String, String>>[];
    String displayContent = content;

    for (final match in imageRegex.allMatches(content)) {
      markdownImages.add({
        'alt': match.group(1) ?? '',
        'url': match.group(2) ?? '',
      });
      displayContent = displayContent.replaceAll(match.group(0)!, '');
    }

    final audioFiles = extractAudioFiles(displayContent);
    for (final audio in audioFiles) {
      displayContent = displayContent.replaceAll('MEDIA:$audio', '');
    }

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 3, horizontal: 4),
        padding: const EdgeInsets.all(14),
        constraints: const BoxConstraints(maxWidth: 400),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(Constants.radiusMd),
          border: isUser ? null : Border.all(
            color: isDarkMode ? const Color(0xFF404040) : Constants.borderLight,
            width: 0.5,
          ),
          boxShadow: isDarkMode
            ? null
            : [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6, offset: const Offset(0, 1))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isUser)
              Row(
                children: [
                  if (agentIcon != null) Icon(agentIcon, size: 16, color: iconColor),
                  const SizedBox(width: 4),
                  Text(
                    agentName,
                    style: TextStyle(color: iconColor, fontWeight: FontWeight.bold, fontSize: 12),
                  ),
                ],
              ),
            if (!isUser) const SizedBox(height: 8),
            if (imageUrl != null && imageUrl!.isNotEmpty)
              GestureDetector(
                onTap: () => showImagePreview(context, imageUrl!),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: imageUrl!.startsWith('data:')
                      ? Image.memory(
                          base64Decode(imageUrl!.split(',').last),
                          width: 120,
                          height: 120,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(Icons.broken_image, size: 48),
                        )
                      : Image.network(
                          imageUrl!,
                          width: 120,
                          height: 120,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(Icons.broken_image, size: 48),
                        ),
                ),
              ),
            if (imageUrl != null && imageUrl!.isNotEmpty) const SizedBox(height: 8),
            if (documentInfo != null)
              _buildHistoryDocumentCard(documentInfo!, isDarkMode),
            if (documentInfo != null) const SizedBox(height: 8),
            for (final img in markdownImages)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: GestureDetector(
                  onTap: () => showImagePreview(context, img['url']!),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(
                      img['url']!,
                      width: 250,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        width: 250,
                        height: 150,
                        color: Colors.grey.shade200,
                        child: Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.broken_image, size: 48, color: Colors.grey),
                              const SizedBox(height: 8),
                              Text('图片加载失败', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            for (final audioPath in audioFiles)
              AudioPlayerWidget(
                audioPath: audioPath,
                serverIp: serverIp,
                serverPort: serverPort,
                serverToken: serverToken,
                isDarkMode: isDarkMode,
              ),
            if (audioUrl != null && audioUrl!.isNotEmpty)
              AudioPlayerWidget(
                audioPath: audioUrl!,
                serverIp: serverIp,
                serverPort: serverPort,
                serverToken: serverToken,
                isDarkMode: isDarkMode,
              ),
            if (!isUser && displayContent.isNotEmpty)
              FilePreview(
                files: FilePreview.extractFiles(displayContent),
                serverIp: serverIp,
                serverPort: serverPort,
                serverToken: serverToken,
                isDarkMode: isDarkMode,
              ),
            if (displayContent.trim().isNotEmpty)
              isUser
                ? SelectionArea(
                    child: Text(displayContent.trim(), style: TextStyle(color: textColor, fontSize: 14, height: 1.55)),
                  )
                : Stack(
                    children: [
                      SelectionArea(
                        child: MarkdownBody(
                          data: displayContent.trim(),
                          onTapLink: (text, href, title) {
                            if (href != null) {
                              final uri = Uri.tryParse(href);
                              if (uri != null) {
                                launchUrl(uri, mode: LaunchMode.externalApplication);
                              }
                            }
                          },
                    builders: {
                      'code': ChatCodeBlockBuilder(isDarkMode: isDarkMode),
                    },
                    extensionSet: md.ExtensionSet(
                      md.ExtensionSet.gitHubFlavored.blockSyntaxes,
                      [
                        md.EmojiSyntax(),
                        ...md.ExtensionSet.gitHubFlavored.inlineSyntaxes,
                      ],
                    ),
                    styleSheet: MarkdownStyleSheet(
                      p: TextStyle(color: textColor, fontSize: 14, height: 1.65),
                      h1: TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.w700, height: 1.4),
                      h2: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.w600, height: 1.4),
                      h3: TextStyle(color: textColor, fontSize: 15, fontWeight: FontWeight.w600, height: 1.4),
                      h4: TextStyle(color: textColor, fontSize: 14, fontWeight: FontWeight.w600, height: 1.4),
                      strong: TextStyle(color: textColor, fontWeight: FontWeight.w700),
                      em: TextStyle(fontStyle: FontStyle.italic),
                      a: TextStyle(color: Constants.primaryColor, decoration: TextDecoration.underline, decorationColor: Constants.primaryColor),
                      code: TextStyle(color: isDarkMode ? const Color(0xFF90CAF9) : Constants.primaryColor, backgroundColor: isDarkMode ? const Color(0xFF3D3D40) : const Color(0xFFEBEDF0), fontSize: 13, fontFamily: 'SF Mono'),
                      codeblockDecoration: BoxDecoration(color: const Color(0xFF1E1E2E), borderRadius: BorderRadius.circular(8), border: Border.all(color: isDarkMode ? const Color(0xFF3D3D40) : const Color(0xFF2D2D30), width: 0.5)),
                      codeblockPadding: const EdgeInsets.all(12),
                      blockquote: TextStyle(color: isDarkMode ? const Color(0xFF9CA3AF) : Constants.textSecondaryColor, fontSize: 14, height: 1.55),
                      blockquoteDecoration: BoxDecoration(color: isDarkMode ? const Color(0xFF2D2D30) : const Color(0xFFF5F5F5), borderRadius: const BorderRadius.only(topRight: Radius.circular(8), bottomRight: Radius.circular(8)), border: Border(left: BorderSide(color: Constants.primaryColor, width: 3))),
                      blockquotePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      listBullet: TextStyle(color: isDarkMode ? const Color(0xFF9CA3AF) : Constants.textSecondaryColor, fontSize: 14),
                      listIndent: 20,
                      listBulletPadding: const EdgeInsets.only(top: 4, bottom: 4),
                      tableBody: TextStyle(color: textColor, fontSize: 13, height: 1.45),
                      tableHead: TextStyle(color: textColor, fontSize: 13, fontWeight: FontWeight.w600),
                      tableBorder: TableBorder.all(color: isDarkMode ? const Color(0xFF3D3D40) : const Color(0xFFE5E5E5), width: 0.5),
                      tableCellsPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                      horizontalRuleDecoration: BoxDecoration(border: Border(top: BorderSide(color: isDarkMode ? const Color(0xFF3D3D40) : const Color(0xFFE5E5E5), width: 0.5))),
                    ),
                        ),
                      ),
                      Positioned(
                        top: 0,
                        right: 0,
                        child: BubbleCopyButton(
                          text: displayContent.trim(),
                          isDarkMode: isDarkMode,
                        ),
                      ),
                    ],
                  ),
            if (!isUser && modelInfo != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Container(
                  decoration: BoxDecoration(
                    border: Border(top: BorderSide(color: Colors.black.withOpacity(0.04))),
                  ),
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFF10a37f).withOpacity(0.08),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          _formatModelName(modelInfo!['model']?.toString() ?? 'auto'),
                          style: const TextStyle(color: Color(0xFF10a37f), fontSize: 10, fontWeight: FontWeight.w500),
                        ),
                      ),
                      if (modelInfo!['inputTokens'] != null) ...[
                        const SizedBox(width: 6),
                        Text(
                          '↑${modelInfo!['inputTokens']} ↓${modelInfo!['outputTokens'] ?? 0}',
                          style: TextStyle(
                            color: isDarkMode ? Colors.grey.shade500 : Colors.grey.shade400,
                            fontSize: 10,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
