import 'dart:async';
import 'dart:io';

import '../config/app_config.dart';

/// TCP reachability of local OpenClaw stack ports.
class LocalOpenClawStatus {
  const LocalOpenClawStatus({
    required this.lumePluginOpen,
    required this.gatewayOpen,
    required this.probedAt,
  });

  final bool lumePluginOpen;
  final bool gatewayOpen;
  final DateTime probedAt;

  bool get anyOpen => lumePluginOpen || gatewayOpen;

  String get summary {
    if (lumePluginOpen) return '本机 Lume 插件已就绪';
    if (gatewayOpen) return 'Gateway 在线，Lume 插件未检测到';
    return '未检测到本机 OpenClaw';
  }
}

class LocalOpenClawService {
  Future<bool> probePort(String host, int port, {Duration? timeout}) async {
    final ms = timeout ?? AppConfig.localProbeTimeout;
    try {
      final socket = await Socket.connect(host, port, timeout: ms);
      await socket.close();
      return true;
    } on SocketException {
      return false;
    } on TimeoutException {
      return false;
    } on Object {
      return false;
    }
  }

  Future<LocalOpenClawStatus> probeLocal() async {
    final host = AppConfig.localLumeHost;
    final lume = await probePort(host, AppConfig.lumePluginPort);
    final gateway = await probePort(host, AppConfig.gatewayPort);
    return LocalOpenClawStatus(
      lumePluginOpen: lume,
      gatewayOpen: gateway,
      probedAt: DateTime.now(),
    );
  }
}
