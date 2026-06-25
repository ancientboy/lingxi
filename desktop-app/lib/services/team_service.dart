import 'dart:convert';

import '../data/agent_catalog.dart';
import '../models/lume_agent.dart';
import '../services/auth_storage.dart';

class TeamState {
  const TeamState({
    required this.agents,
    required this.currentAgentId,
  });

  final List<LumeAgent> agents;
  final String currentAgentId;

  LumeAgent get current =>
      AgentCatalog.resolve(currentAgentId);

  List<LumeAgentExample> get quickExamples =>
      current.examples.take(4).toList();
}

class TeamService {
  TeamState fromSession(AuthSession session, {String? currentAgentId}) {
    final raw = session.user['agents'];
    final ids = _parseAgentIds(raw);
    final current = currentAgentId ?? 'lingxi';
    return TeamState(
      agents: AgentCatalog.forIds(ids),
      currentAgentId: current,
    );
  }

  TeamState? fromBridgeJson(String? json) {
    if (json == null || json == 'null' || json.isEmpty) return null;
    try {
      final map = jsonDecode(json) as Map<String, dynamic>;
      final ids = (map['agentIds'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          ['lingxi'];
      final current = map['currentAgentId']?.toString() ?? 'lingxi';
      return TeamState(
        agents: AgentCatalog.forIds(ids),
        currentAgentId: current,
      );
    } catch (_) {
      return null;
    }
  }

  List<String> _parseAgentIds(dynamic raw) {
    if (raw is List) {
      final ids = raw.map((e) => e.toString()).where((s) => s.isNotEmpty).toList();
      if (ids.isNotEmpty) return ids;
    }
    return ['lingxi'];
  }
}
