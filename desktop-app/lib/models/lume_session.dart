/// Chat session from `/api/lume-ws/sessions`.
class LumeSession {
  LumeSession({
    required this.key,
    required this.title,
    required this.preview,
    this.updatedAt,
  });

  final String key;
  final String title;
  final String preview;
  final String? updatedAt;

  factory LumeSession.fromJson(Map<String, dynamic> json) {
    final title = (json['title'] ??
            json['derivedTitle'] ??
            json['label'] ??
            json['displayName'] ??
            '新对话')
        .toString();
    final preview = (json['lastMessagePreview'] ??
            json['preview'] ??
            json['lastMessage'] ??
            '')
        .toString();
    return LumeSession(
      key: json['key']?.toString() ?? '',
      title: title,
      preview: preview,
      updatedAt: json['updatedAt']?.toString(),
    );
  }
}
