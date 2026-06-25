class LumeModelOption {
  const LumeModelOption({
    required this.id,
    required this.name,
    this.tier,
    this.provider,
  });

  final String id;
  final String name;
  final String? tier;
  final String? provider;

  factory LumeModelOption.fromJson(Map<String, dynamic> json) {
    return LumeModelOption(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? json['id']?.toString() ?? '',
      tier: json['tier']?.toString(),
      provider: json['provider']?.toString(),
    );
  }

  bool get isPro => tier == 'pro';
}

class LumeModelState {
  const LumeModelState({
    required this.currentId,
    required this.models,
    required this.isFreeUser,
  });

  final String currentId;
  final List<LumeModelOption> models;
  final bool isFreeUser;

  String get currentLabel {
    if (currentId == 'auto') return 'Auto';
    final match = models.where((m) => m.id == currentId).toList();
    return match.isNotEmpty ? match.first.name : currentId;
  }

  factory LumeModelState.fromJson(Map<String, dynamic> json) {
    final raw = json['models'] as List<dynamic>? ?? [];
    return LumeModelState(
      currentId: json['current']?.toString() ?? 'auto',
      isFreeUser: json['isFreeUser'] == true,
      models: raw
          .whereType<Map<String, dynamic>>()
          .map(LumeModelOption.fromJson)
          .where((m) => m.id.isNotEmpty)
          .toList(),
    );
  }
}
