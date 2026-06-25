import 'package:flutter/material.dart';

import '../theme/lume_theme.dart';

/// Quick workspace tools — mirrors web right-rail shortcuts.
class DesktopToolsBar extends StatelessWidget {
  const DesktopToolsBar({
    super.key,
    required this.onWorkspace,
    required this.onSkills,
    required this.onServers,
    required this.onToggleRail,
  });

  final VoidCallback onWorkspace;
  final VoidCallback onSkills;
  final VoidCallback onServers;
  final VoidCallback onToggleRail;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: const BoxDecoration(
        color: LumeColors.bgCard,
        border: Border(top: BorderSide(color: LumeColors.border)),
      ),
      child: Row(
        children: [
          _ToolChip(
            icon: Icons.business_rounded,
            label: '办公区',
            onTap: onWorkspace,
          ),
          const SizedBox(width: 8),
          _ToolChip(
            icon: Icons.grid_view_rounded,
            label: '技能库',
            onTap: onSkills,
          ),
          const SizedBox(width: 8),
          _ToolChip(
            icon: Icons.devices_rounded,
            label: '设备',
            onTap: onServers,
          ),
          const Spacer(),
          IconButton(
            tooltip: '切换右侧工作台',
            icon: const Icon(Icons.view_sidebar_outlined, size: 20),
            onPressed: onToggleRail,
            color: LumeColors.text2,
          ),
        ],
      ),
    );
  }
}

class _ToolChip extends StatelessWidget {
  const _ToolChip({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: LumeColors.bg,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: LumeColors.text2),
              const SizedBox(width: 6),
              Text(
                label,
                style: const TextStyle(fontSize: 12, color: LumeColors.text2),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
