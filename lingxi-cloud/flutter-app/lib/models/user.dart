class User {
  final String id;
  final String nickname;
  final int points;
  final String? userInviteCode;
  final int inviteCount;
  final List<String> agents;
  final bool? canClaimTeam;
  final String? subscriptionPlan;
  final Map<String, dynamic>? subscription;
  final Map<String, dynamic>? credits;

  User({
    required this.id,
    required this.nickname,
    this.points = 0,
    this.userInviteCode,
    this.inviteCount = 0,
    this.agents = const [],
    this.canClaimTeam,
    this.subscriptionPlan,
    this.subscription,
    this.credits,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id']?.toString() ?? '',
      nickname: json['nickname']?.toString() ?? '',
      points: (json['points'] as num?)?.toInt() ?? 0,
      userInviteCode: json['userInviteCode']?.toString(),
      inviteCount: (json['inviteCount'] as num?)?.toInt() ?? 0,
      agents: json['agents'] != null 
          ? List<String>.from(json['agents'].map((e) => e?.toString() ?? ''))
          : [],
      canClaimTeam: json['canClaimTeam'] as bool?,
      subscriptionPlan: json['subscriptionPlan']?.toString(),
      subscription: json['subscription'] as Map<String, dynamic>?,
      credits: json['credits'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'nickname': nickname,
      'points': points,
      'userInviteCode': userInviteCode,
      'inviteCount': inviteCount,
      'agents': agents,
      'canClaimTeam': canClaimTeam,
      'subscriptionPlan': subscriptionPlan,
      'subscription': subscription,
      'credits': credits,
    };
  }

  User copyWith({
    String? id,
    String? nickname,
    int? points,
    String? userInviteCode,
    int? inviteCount,
    List<String>? agents,
    bool? canClaimTeam,
    String? subscriptionPlan,
    Map<String, dynamic>? subscription,
    Map<String, dynamic>? credits,
  }) {
    return User(
      id: id ?? this.id,
      nickname: nickname ?? this.nickname,
      points: points ?? this.points,
      userInviteCode: userInviteCode ?? this.userInviteCode,
      inviteCount: inviteCount ?? this.inviteCount,
      agents: agents ?? this.agents,
      canClaimTeam: canClaimTeam ?? this.canClaimTeam,
      subscriptionPlan: subscriptionPlan ?? this.subscriptionPlan,
      subscription: subscription ?? this.subscription,
      credits: credits ?? this.credits,
    );
  }
}
