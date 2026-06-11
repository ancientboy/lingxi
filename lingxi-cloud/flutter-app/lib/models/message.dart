class Message {
  final String id;
  final String content;
  final String role;
  final DateTime createdAt;
  final String? agentId;
  final String? imageUrl;
  final String? audioUrl;
  final DocumentInfo? documentInfo;  // 🆕 文档信息
  final Map<String, dynamic>? metadata;
  final Map<String, dynamic>? modelInfo;  // 🆕 模型信息（模型名 + token 统计）

  Message({
    required this.id,
    required this.content,
    required this.role,
    DateTime? createdAt,
    this.agentId,
    this.imageUrl,
    this.audioUrl,
    this.documentInfo,
    this.metadata,
    this.modelInfo,
  }) : createdAt = createdAt ?? DateTime.now();

  factory Message.fromJson(Map<String, dynamic> json) {
    // 🆕 解析文档附件
    DocumentInfo? docInfo;
    final attachments = json['attachments'] as List? ?? json['parts'] as List?;
    if (attachments != null && attachments.isNotEmpty) {
      for (final att in attachments) {
        if (att is Map) {
          final type = att['type']?.toString() ?? '';
          final mimeType = att['mimeType']?.toString() ?? '';
          
          // 如果是文档类型（不是图片）
          if (type == 'document' || (mimeType.isNotEmpty && !mimeType.startsWith('image/'))) {
            docInfo = DocumentInfo(
              url: att['url']?.toString() ?? att['content']?.toString() ?? '',
              mimeType: mimeType.isNotEmpty ? mimeType : 'application/octet-stream',
              filename: att['filename']?.toString() ?? 'document',
            );
            break;
          }
        }
      }
    }

    // 🆕 清理内容中的附件标记（只在有附件时才清理，避免误删用户文本）
    String rawContent = json['content']?.toString() ?? '';
    final hasAttachments = docInfo != null || (json['attachments'] != null);
    String cleanContent = hasAttachments 
        ? rawContent.replaceAll(RegExp(r'\[附件:[^\]]+\]\s*'), '').trim() 
        : rawContent.trim();
    
    return Message(
      id: json['id']?.toString() ?? '',
      content: cleanContent,
      role: json['role']?.toString() ?? 'user',
      createdAt: _parseDateTime(json['created_at'] ?? json['createdAt']),
      agentId: json['agent_id']?.toString() ?? json['agentId']?.toString(),
      imageUrl: json['imageUrl']?.toString() ?? json['image_url']?.toString(),
      audioUrl: json['audioUrl']?.toString() ?? json['audio_url']?.toString(),
      documentInfo: docInfo ?? (json['documentInfo'] is Map ? DocumentInfo.fromJson(json['documentInfo'] as Map<String, dynamic>) : null),
      metadata: json['metadata'] as Map<String, dynamic>?,
      modelInfo: json['modelInfo'] as Map<String, dynamic>?,
    );
  }

  static DateTime _parseDateTime(dynamic value) {
    if (value == null) return DateTime.now();
    if (value is DateTime) return value;
    if (value is int) return DateTime.fromMillisecondsSinceEpoch(value);
    if (value is String) {
      final parsed = DateTime.tryParse(value);
      return parsed ?? DateTime.now();
    }
    return DateTime.now();
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'content': content,
      'role': role,
      'created_at': createdAt.toIso8601String(),
      'agent_id': agentId,
      'imageUrl': imageUrl,
      'audioUrl': audioUrl,
      'documentInfo': documentInfo?.toJson(),
      'metadata': metadata,
      'modelInfo': modelInfo,
    };
  }

  Message copyWith({
    String? id,
    String? content,
    String? role,
    DateTime? createdAt,
    String? agentId,
    String? imageUrl,
    String? audioUrl,
    DocumentInfo? documentInfo,
    Map<String, dynamic>? metadata,
    Map<String, dynamic>? modelInfo,
  }) {
    return Message(
      id: id ?? this.id,
      content: content ?? this.content,
      role: role ?? this.role,
      createdAt: createdAt ?? this.createdAt,
      agentId: agentId ?? this.agentId,
      imageUrl: imageUrl ?? this.imageUrl,
      audioUrl: audioUrl ?? this.audioUrl,
      documentInfo: documentInfo ?? this.documentInfo,
      metadata: metadata ?? this.metadata,
      modelInfo: modelInfo ?? this.modelInfo,
    );
  }
}

// 🆕 文档信息模型
class DocumentInfo {
  final String url;
  final String mimeType;
  final String filename;

  DocumentInfo({
    required this.url,
    required this.mimeType,
    required this.filename,
  });

  factory DocumentInfo.fromJson(Map<String, dynamic> json) {
    return DocumentInfo(
      url: json['url']?.toString() ?? '',
      mimeType: json['mimeType']?.toString() ?? 'application/octet-stream',
      filename: json['filename']?.toString() ?? 'document',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'url': url,
      'mimeType': mimeType,
      'filename': filename,
    };
  }
}
