/// How the desktop client routes Lume WebSocket traffic.
enum ConnectionMode {
  /// Probe local Lume plugin (18790); fall back to cloud WSS.
  auto,

  /// Direct `ws://127.0.0.1:18790` with Lume auth.
  local,

  /// Cloud proxy via lumeword.cn `/api/lume-ws`.
  cloud,
}

extension ConnectionModeLabels on ConnectionMode {
  String get label {
    switch (this) {
      case ConnectionMode.auto:
        return '自动';
      case ConnectionMode.local:
        return '本机';
      case ConnectionMode.cloud:
        return '云端';
    }
  }

  String get description {
    switch (this) {
      case ConnectionMode.auto:
        return '优先本机 OpenClaw，不可用时走云端';
      case ConnectionMode.local:
        return '仅连接本机 Lume 插件 (18790)';
      case ConnectionMode.cloud:
        return '经 lumeword.cn 连接活跃设备';
    }
  }

  static ConnectionMode fromStorage(String? raw) {
    switch (raw) {
      case 'local':
        return ConnectionMode.local;
      case 'cloud':
        return ConnectionMode.cloud;
      default:
        return ConnectionMode.auto;
    }
  }

  String get storageValue {
    switch (this) {
      case ConnectionMode.auto:
        return 'auto';
      case ConnectionMode.local:
        return 'local';
      case ConnectionMode.cloud:
        return 'cloud';
    }
  }
}

/// Resolved connection target after probing / user preference.
enum EffectiveConnection {
  local,
  cloud,
}
