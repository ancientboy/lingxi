import 'dart:convert';
import 'package:lingxicloud/services/rpc_ws.dart';

/// OpenClaw Agent 配置 — 经 Lume gateway.call / Gateway 直连
class GatewayAgentsService {
  static Map<String, dynamic>? _parseConfigPayload(Map<String, dynamic>? res) {
    return rpcGatewayPayload(res);
  }

  static List<Map<String, dynamic>> _mapAgentList(dynamic list) {
    if (list is! List) return [];
    return list.whereType<Map>().map((a) {
      final row = Map<String, dynamic>.from(a);
      final identity = row['identity'];
      return {
        'id': row['id']?.toString() ?? '',
        'name': (identity is Map ? identity['name'] : null)?.toString() ??
            row['name']?.toString() ??
            row['id']?.toString() ??
            '',
        'workspace': row['workspace']?.toString(),
        'model': row['model']?.toString(),
        'isDefault': row['default'] == true,
      };
    }).toList();
  }

  /// UI id → OpenClaw agent id（默认映射，部分实例实际用 auto/notes 等）
  static String toOpenClawId(String uiId) {
    switch (uiId) {
      case 'lingxi':
      case 'captain':
        return 'main';
      case 'notes':
        return 'noter';
      case 'operator':
        return 'ops';
      case 'auto':
        return 'smart';
      default:
        return uiId;
    }
  }

  static Iterable<String> candidateIds(String uiAgentId) sync* {
    yield toOpenClawId(uiAgentId);
    yield uiAgentId;
    switch (uiAgentId) {
      case 'auto':
        yield 'smart';
      case 'smart':
        yield 'auto';
      case 'notes':
        yield 'noter';
      case 'noter':
        yield 'notes';
      case 'operator':
        yield 'ops';
      case 'ops':
        yield 'operator';
      case 'lingxi':
      case 'captain':
        yield 'main';
    }
  }

  /// 在 OpenClaw 配置中解析真实 agent id（兼容 auto/smart 等别名）
  static String? resolveOpenClawId(
    String uiAgentId,
    List<Map<String, dynamic>> agentsList,
  ) {
    for (final id in candidateIds(uiAgentId)) {
      if (agentsList.any((a) => a['id'] == id)) return id;
    }
    return null;
  }

  static String idForCreate(String uiAgentId, List<Map<String, dynamic>> agentsList) {
    final usesLegacyIds = agentsList.any((a) {
      final id = a['id']?.toString() ?? '';
      return id == 'auto' || id == 'reviewer';
    });
    if (usesLegacyIds) {
      switch (uiAgentId) {
        case 'lingxi':
        case 'captain':
          return 'main';
        case 'auto':
          return 'auto';
        case 'notes':
          return 'noter';
        case 'operator':
          return 'ops';
        default:
          return uiAgentId;
      }
    }
    return toOpenClawId(uiAgentId);
  }

  static Future<List<Map<String, dynamic>>?> fetchAgents() async {
    final res = await rpcGatewayCall('config.get', {});
    final payload = _parseConfigPayload(res);
    if (payload == null) return null;
    final config = payload['config'];
    if (config is! Map) return [];
    final agents = config['agents'];
    if (agents is! Map) return [];
    return _mapAgentList(agents['list']);
  }

  static Future<bool> addAgent(
    String uiAgentId, {
    String? name,
    String? emoji,
  }) async {
    final getRes = await rpcGatewayCall('config.get', {});
    final payload = _parseConfigPayload(getRes);
    if (payload == null) return false;

    final baseHash = payload['hash'];
    final config = payload['config'];
    if (config is! Map) return false;
    final agents = config['agents'];
    if (agents is! Map) return false;
    final list = agents['list'];
    final agentsList = list is List
        ? list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
        : <Map<String, dynamic>>[];

    if (resolveOpenClawId(uiAgentId, agentsList) != null) return false;

    final agentId = idForCreate(uiAgentId, agentsList);
    if (agentId == 'main') return false;

    final defaultWs = agents['defaults'] is Map
        ? (agents['defaults']['workspace']?.toString() ?? '~/.openclaw/workspace')
        : '~/.openclaw/workspace';

    final newAgent = {
      'id': agentId,
      'workspace': '$defaultWs-$agentId',
      'identity': {'name': name ?? agentId, 'emoji': emoji ?? '🤖'},
    };

    final newList = [...agentsList, newAgent];
    final mainIdx = newList.indexWhere((a) => a['id'] == 'main' || a['default'] == true);
    if (mainIdx >= 0) {
      final main = Map<String, dynamic>.from(newList[mainIdx]);
      final sub = Map<String, dynamic>.from(main['subagents'] as Map? ?? {});
      final allow = List<String>.from((sub['allowAgents'] as List?)?.map((e) => e.toString()) ?? []);
      if (!allow.contains(agentId)) allow.add(agentId);
      sub['allowAgents'] = allow;
      main['subagents'] = sub;
      newList[mainIdx] = main;
    }

    final patchRes = await rpcGatewayCall('config.patch', {
      'raw': jsonEncode({'agents': {'list': newList}}),
      'baseHash': baseHash,
      'note': '灵犀云添加 Agent: ${name ?? agentId}',
    }, timeout: const Duration(seconds: 20));

    return rpcGatewayOk(patchRes);
  }

  static Future<bool> removeAgent(String uiAgentId) async {
    final getRes = await rpcGatewayCall('config.get', {});
    final payload = _parseConfigPayload(getRes);
    if (payload == null) return false;

    final baseHash = payload['hash'];
    final config = payload['config'];
    if (config is! Map) return false;
    final agents = config['agents'];
    if (agents is! Map) return false;
    final list = agents['list'];
    final agentsList = list is List
        ? list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
        : <Map<String, dynamic>>[];

    final agentId = resolveOpenClawId(uiAgentId, agentsList);
    if (agentId == null || agentId == 'main') return false;

    final updatedList = agentsList.where((a) => a['id'] != agentId).toList();
    if (updatedList.length == agentsList.length) return false;

    final mainIdx = updatedList.indexWhere((a) => a['id'] == 'main' || a['default'] == true);
    if (mainIdx >= 0) {
      final main = Map<String, dynamic>.from(updatedList[mainIdx]);
      final sub = Map<String, dynamic>.from(main['subagents'] as Map? ?? {});
      final allow = List<String>.from((sub['allowAgents'] as List?)?.map((e) => e.toString()) ?? []);
      sub['allowAgents'] = allow.where((id) => id != agentId).toList();
      main['subagents'] = sub;
      updatedList[mainIdx] = main;
    }

    final patchRes = await rpcGatewayCall('config.patch', {
      'raw': jsonEncode({'agents': {'list': updatedList}}),
      'baseHash': baseHash,
      'note': '灵犀云移除 Agent: $agentId',
    }, timeout: const Duration(seconds: 20));

    if (!rpcGatewayOk(patchRes)) return false;

    await rpcGatewayCall('agents.delete', {'agentId': agentId},
        timeout: const Duration(seconds: 10));
    return true;
  }
}
