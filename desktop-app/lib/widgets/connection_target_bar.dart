import 'package:flutter/material.dart';

import '../models/connection_mode.dart';
import '../services/local_openclaw_service.dart';
import '../theme/lume_theme.dart';

/// 本机 / 云端快捷切换（Marvis 风格），记住上次选择。
class ConnectionTargetBar extends StatelessWidget {
  const ConnectionTargetBar({
    super.key,
    required this.mode,
    required this.effective,
    required this.localStatus,
    required this.cloudAvailable,
    required this.onModeChanged,
  });

  final ConnectionMode mode;
  final EffectiveConnection? effective;
  final LocalOpenClawStatus? localStatus;
  final bool cloudAvailable;
  final ValueChanged<ConnectionMode> onModeChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final localReady = localStatus?.lumePluginOpen == true;
    final effectiveLabel = effective == EffectiveConnection.local
        ? '本机'
        : effective == EffectiveConnection.cloud
            ? '云端'
            : '—';

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                '连接至',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: LumeColors.text3,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              Text(
                '当前：$effectiveLabel',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: LumeColors.text3,
                  fontSize: 11,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              _Chip(
                label: '本机',
                icon: Icons.laptop_mac_rounded,
                selected: mode == ConnectionMode.local ||
                    (mode == ConnectionMode.auto &&
                        effective == EffectiveConnection.local),
                enabled: true,
                onTap: () => onModeChanged(ConnectionMode.local),
              ),
              const SizedBox(width: 6),
              _Chip(
                label: '云端',
                icon: Icons.cloud_outlined,
                selected: mode == ConnectionMode.cloud ||
                    (mode == ConnectionMode.auto &&
                        effective == EffectiveConnection.cloud),
                enabled: cloudAvailable,
                onTap: cloudAvailable
                    ? () => onModeChanged(ConnectionMode.cloud)
                    : null,
              ),
              const SizedBox(width: 6),
              _Chip(
                label: '自动',
                icon: Icons.sync_alt_rounded,
                selected: mode == ConnectionMode.auto,
                enabled: true,
                onTap: () => onModeChanged(ConnectionMode.auto),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            _hint(localReady, cloudAvailable, mode, effective),
            style: theme.textTheme.labelSmall?.copyWith(
              color: LumeColors.text3,
              fontSize: 11,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }

  String _hint(
    bool localReady,
    bool cloudAvailable,
    ConnectionMode mode,
    EffectiveConnection? effective,
  ) {
    if (mode == ConnectionMode.local && !localReady) {
      return '本机 OpenClaw 未就绪，可在设置中安装或切到云端。';
    }
    if (mode == ConnectionMode.cloud && !cloudAvailable) {
      return '暂无可用云端设备，请先在工作台「设备」中添加或部署。';
    }
    if (mode == ConnectionMode.auto) {
      if (localReady) return '自动：本机已就绪，优先本机；可随时切云端。';
      if (cloudAvailable) return '自动：本机未检测到，已连云端。';
      return '自动：请安装本机 OpenClaw 或添加云端设备。';
    }
    if (effective == EffectiveConnection.local) {
      return '正在通过本机 18790（Lume 插件）对话。';
    }
    if (effective == EffectiveConnection.cloud) {
      return '正在通过云端代理对话，可在「设备」中切换服务器。';
    }
    return '选择连接方式后开始对话。';
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bg = selected ? LumeColors.text1 : LumeColors.fill;
    final fg = selected ? Colors.white : LumeColors.text2;

    return Expanded(
      child: Material(
        color: enabled ? bg : LumeColors.fill,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 7),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  size: 14,
                  color: enabled ? fg : LumeColors.text3,
                ),
                const SizedBox(width: 4),
                Text(
                  label,
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: enabled ? fg : LumeColors.text3,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
