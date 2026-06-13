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
      if (LumeWebSocketService().isConnected || WebSocketService().isConnected) {
        return;
      }
      await Future.delayed(const Duration(milliseconds: 200));
    }
    debugPrint('DeviceSwitchManager: 等待 RPC 超时');
  }

  /// 绑定传输层到新设备（对齐 Web：断开旧连接 + 按 DB activeServer 重建）
  Future<bool> rebindTransport(String serverId) async {
    final lume = LumeWebSocketService();
    final gw = WebSocketService();

    debugPrint('🖥️ [DSM] 设备硬重连 → $serverId（Web 等效于整页 reload）');

    // 必须清 Gateway 缓存，否则 connect() 仍连旧设备 IP
    gw.reset();
    lume.disconnect();
    await Future.delayed(const Duration(milliseconds: 400));

    try {
      await lume.reconnectForDevice();
    } catch (e) {
      debugPrint('⚠️ [DSM] Lume reconnectForDevice: $e');
    }
    await waitForRpc(timeoutMs: 15000);
    if (lume.isConnected) {
      lastSwitchedServerId = serverId;
      return true;
    }

    debugPrint('⚠️ [DSM] Lume 不可用，降级 Gateway（已 reset 缓存）');
    try {
      await gw.connect();
    } catch (e) {
      debugPrint('⚠️ [DSM] Gateway connect: $e');
    }
    await waitForRpc(timeoutMs: 12000);
    final ok = lume.isConnected || gw.isConnected;
    if (ok) lastSwitchedServerId = serverId;
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
