class Message {
  final String id;
  final String content;
  final String role;
  final DateTime createdAt;
  final String? agentId;
  final String? imageUrl;
  final Map<String, dynamic>? metadata;

  Message({
    required this.id,
    required this.content,
    required this.role,
    DateTime? createdAt,
    this.agentId,
    this.imageUrl,
    this.metadata,
  }) : createdAt = createdAt ?? DateTime.now();

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id']?.toString() ?? '',
      content: json['content']?.toString() ?? '',
      role: json['role']?.toString() ?? 'user',
      createdAt: _parseDateTime(json['created_at'] ?? json['createdAt']),
      agentId: json['agent_id']?.toString() ?? json['agentId']?.toString(),
      imageUrl: json['imageUrl']?.toString() ?? json['image_url']?.toString(),
      metadata: json['metadata'] as Map<String, dynamic>?,
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
      'metadata': metadata,
    };
  }

  Message copyWith({
    String? id,
    String? content,
    String? role,
    DateTime? createdAt,
    String? agentId,
    String? imageUrl,
    Map<String, dynamic>? metadata,
  }) {
    return Message(
      id: id ?? this.id,
      content: content ?? this.content,
      role: role ?? this.role,
      createdAt: createdAt ?? this.createdAt,
      agentId: agentId ?? this.agentId,
      imageUrl: imageUrl ?? this.imageUrl,
      metadata: metadata ?? this.metadata,
    );
  }
}
