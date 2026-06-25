import 'package:flutter/material.dart';

import '../services/team_service.dart';
import '../theme/lume_theme.dart';

/// Native right workspace panel — replaces web #rightSidebar (300px).
class WorkspacePanel extends StatelessWidget {
  const WorkspacePanel({
    super.key,
    required this.teamState,
    required this.collapsed,
    required this.activeTool,
    required this.onToggleCollapse,
    required this.onSwitchAgent,
    required this.onQuickSend,
    required this.onOpenView,
    required this.onOpenFiles,
    required this.onOpenNotifications,
    required this.onBackToChat,
  });

  final TeamState teamState;
  final bool collapsed;
  final String? activeTool;
  final VoidCallback onToggleCollapse;
  final ValueChanged<String> onSwitchAgent;
  final ValueChanged<String> onQuickSend;
  final ValueChanged<String> onOpenView;
  final VoidCallback onOpenFiles;
  final VoidCallback onOpenNotifications;
  final VoidCallback onBackToChat;

  static const expandedWidth = 300.0;
  static const collapsedWidth = 44.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (collapsed) {
      return Container(
        width: collapsedWidth,
        color: LumeColors.bg,
        child: Column(
          children: [
            const SizedBox(height: 8),
            IconButton(
              tooltip: '展开工作台',
              icon: const Icon(Icons.chevron_left_rounded),
              onPressed: onToggleCollapse,
            ),
            const Spacer(),
          ],
        ),
      );
    }

    final examples = teamState.quickExamples;

    return Container(
      width: expandedWidth,
      color: LumeColors.bg,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 8),
            child: Row(
              children: [
                Text(
                  '工作台',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Spacer(),
                if (activeTool != null && activeTool != 'chat')
                  IconButton(
                    tooltip: '返回对话',
                    icon: const Icon(Icons.chat_bubble_outline_rounded, size: 20),
                    onPressed: onBackToChat,
                  ),
                IconButton(
                  tooltip: '收起',
                  icon: const Icon(Icons.chevron_right_rounded, size: 20),
                  onPressed: onToggleCollapse,
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              '工具',
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: LumeColors.text3,
              ),
            ),
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _ToolButton(
                  icon: Icons.business_rounded,
                  label: '办公区',
                  active: activeTool == 'workspace',
                  onTap: () => onOpenView('workspace'),
                ),
                _ToolButton(
                  icon: Icons.devices_rounded,
                  label: '设备',
                  active: activeTool == 'servers',
                  onTap: () => onOpenView('servers'),
                ),
                _ToolButton(
                  icon: Icons.grid_view_rounded,
                  label: '技能库',
                  active: activeTool == 'skills',
                  onTap: () => onOpenView('skills'),
                ),
                _ToolButton(
                  icon: Icons.folder_open_rounded,
                  label: '文件',
                  onTap: onOpenFiles,
                ),
                _ToolButton(
                  icon: Icons.schedule_rounded,
                  label: '定时',
                  active: activeTool == 'cron',
                  onTap: () => onOpenView('cron'),
                ),
                _ToolButton(
                  icon: Icons.repeat_rounded,
                  label: 'Loop',
                  active: activeTool == 'loops',
                  onTap: () => onOpenView('loops'),
                ),
                _ToolButton(
                  icon: Icons.notifications_outlined,
                  label: '通知',
                  onTap: onOpenNotifications,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Text(
              '对话智能体',
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: LumeColors.text3,
              ),
            ),
          ),
          const SizedBox(height: 6),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              children: teamState.agents.map((agent) {
                final active = agent.id == teamState.currentAgentId;
                return Material(
                  color: active ? LumeColors.fill : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(8),
                    hoverColor: LumeColors.fillHover.withValues(alpha: 0.5),
                    onTap: () => onSwitchAgent(agent.id),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 14,
                            backgroundColor: LumeColors.fill,
                            child: Icon(
                              _agentIcon(agent.iconKey),
                              size: 16,
                              color: LumeColors.text2,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  agent.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: LumeColors.text1,
                                  ),
                                ),
                                Text(
                                  agent.desc,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    fontSize: 11,
                                    color: LumeColors.text3,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 4, 14, 10),
            child: Text(
              '快捷技能',
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: LumeColors.text3,
              ),
            ),
          ),
          if (examples.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              child: Text(
                '暂无快捷技能',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: LumeColors.text3,
                ),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 12),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: examples.map((ex) {
                  return ActionChip(
                    label: Text(
                      ex.desc ?? ex.text,
                      style: const TextStyle(fontSize: 11),
                    ),
                    backgroundColor: LumeColors.fill,
                    side: BorderSide.none,
                    onPressed: () => onQuickSend(ex.text),
                  );
                }).toList(),
              ),
            ),
        ],
      ),
    );
  }

  static IconData _agentIcon(String key) {
    switch (key) {
      case 'zap':
        return Icons.bolt_rounded;
      case 'code':
        return Icons.code_rounded;
      case 'chart':
        return Icons.bar_chart_rounded;
      case 'lightbulb':
        return Icons.lightbulb_outline_rounded;
      case 'target':
        return Icons.track_changes_rounded;
      case 'file':
        return Icons.description_outlined;
      case 'palette':
        return Icons.palette_outlined;
      case 'home':
        return Icons.home_rounded;
      case 'search':
        return Icons.search_rounded;
      case 'check':
        return Icons.check_circle_outline_rounded;
      default:
        return Icons.smart_toy_outlined;
    }
  }
}

class _ToolButton extends StatelessWidget {
  const _ToolButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: active ? LumeColors.fill : Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        hoverColor: LumeColors.fillHover.withValues(alpha: 0.5),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 14,
                color: active ? LumeColors.text1 : LumeColors.text2,
              ),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                  color: active ? LumeColors.text1 : LumeColors.text2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
