import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:lingxicloud/services/lume_websocket_service.dart';
import 'package:lingxicloud/services/websocket_service.dart';

/// 设备切换编排：热切换 device.switch → 失败则 WSS 重连（Lume 主通道）
class DeviceSwitchManager extends ChangeNotifier {
  DeviceSwitchManager._();
  static final DeviceSwitchManager instance = DeviceSwitchManager._();

  int deviceEpoch = 0;
  bool switching = false;
  bool initialLoadDone = false;
  String? trackedServerId;
  String? lastSwitchedServerId;
  String? lastServerName;

  bool isEpochValid(int epoch) => epoch == deviceEpoch;

  int bumpEpoch() {
    deviceEpoch++;
    return deviceEpoch;
  }

  Future<String> resolveServerId() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeId = prefs.getString('active_server_id');
      if (activeId != null && activeId.isNotEmpty) return activeId;
      final activeIp = prefs.getString('active_server_ip');
      if (activeIp != null && activeIp.isNotEmpty) {
        return activeIp.replaceAll('.', '_');
      }
    } catch (e) {
      debugPrint('DeviceSwitchManager.resolveServerId: $e');
    }
    return 'default';
  }

  Future<void> waitForRpc({int timeoutMs = 12000}) async {
    final deadline = DateTime.now().add(Duration(milliseconds: timeoutMs));
    while (DateTime.now().isBefore(deadline)) {
      if (LumeWebSocketService().isConnected) {
        return;
      }
      await Future.delayed(const Duration(milliseconds: 200));
    }
    debugPrint('DeviceSwitchManager: 等待 Lume RPC 超时');
  }

  /// 绑定传输层到新设备
  /// 优先热切换（不断 WS），失败才全量重连
  Future<bool> rebindTransport(String serverId) async {
    final lume = LumeWebSocketService();
    // 对齐 Web：重置 Gateway 缓存，避免双通道仍指向旧设备
    WebSocketService().reset();

    // 路径 1: 热切换（WS 不断，proxy 换后端）
    if (lume.isConnected) {
      debugPrint('🖥️ [DSM] 热切换 → $serverId');
      try {
        final ok = await lume.deviceSwitch(serverId, timeout: const Duration(seconds: 20));
        if (ok) {
          lastSwitchedServerId = serverId;
          debugPrint('✅ [DSM] 热切换成功');
          return true;
        }
        debugPrint('⚠️ [DSM] 热切换失败，降级全量重连');
      } catch (e) {
        debugPrint('⚠️ [DSM] 热切换异常: $e，降级全量重连');
      }
    }

    // 路径 2: 全量重连（disconnect → wait → connect）
    debugPrint('🖥️ [DSM] 全量重连 → $serverId');
    lume.disconnect();
    await Future.delayed(const Duration(milliseconds: 800));
    try {
      await lume.reconnectForDevice();
    } catch (e) {
      debugPrint('⚠️ [DSM] reconnectForDevice: $e');
    }
    await waitForRpc(timeoutMs: 15000);
    final ok = lume.isConnected;
    if (ok) {
      lastSwitchedServerId = serverId;
      debugPrint('✅ [DSM] 全量重连成功');
    } else {
      debugPrint('❌ [DSM] 全量重连失败');
    }
    return ok;
  }

  /// 开始切换（仅 transport + epoch，UI/数据由 ChatPage 回调处理）
  Future<int> beginSwitch(String serverId) async {
    if (switching) return deviceEpoch;
    switching = true;
    trackedServerId = serverId;
    final epoch = bumpEpoch();
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('need_refresh_after_switch');
    return epoch;
  }

  void endSwitch() {
    switching = false;
    notifyListeners();
  }

  void markInitialLoadDone() {
    initialLoadDone = true;
  }

  void onDeviceSwitchedEvent(Map<String, dynamic> payload) {
    lastSwitchedServerId = payload['serverId']?.toString();
    lastServerName = payload['serverName']?.toString();
    if (lastSwitchedServerId != null) {
      trackedServerId = lastSwitchedServerId;
    }
    notifyListeners();
  }
}
