import 'package:flutter/material.dart';

import '../models/lume_session.dart';
import '../services/auth_storage.dart';
import '../theme/lume_theme.dart';
import 'lume_mark.dart';

class SessionSidebar extends StatefulWidget {
  const SessionSidebar({
    super.key,
    required this.session,
    required this.sessions,
    required this.loading,
    required this.error,
    required this.selectedKey,
    required this.onNewChat,
    required this.onSelect,
    required this.onRefresh,
    required this.onOpenSettings,
  });

  final AuthSession session;
  final List<LumeSession> sessions;
  final bool loading;
  final String? error;
  final String? selectedKey;
  final VoidCallback onNewChat;
  final ValueChanged<LumeSession> onSelect;
  final VoidCallback onRefresh;
  final VoidCallback onOpenSettings;

  @override
  State<SessionSidebar> createState() => _SessionSidebarState();
}

class _SessionSidebarState extends State<SessionSidebar> {
  String _query = '';

  List<LumeSession> get _filtered {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return widget.sessions;
    return widget.sessions
        .where(
          (s) =>
              s.title.toLowerCase().contains(q) ||
              s.preview.toLowerCase().contains(q),
        )
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = widget.session.displayName ?? 'Lume';
    final filtered = _filtered;

    return Container(
      width: 260,
      color: LumeColors.bg,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 10, 8),
            child: Row(
              children: [
                const LumeMark(size: 36, badge: true),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Lume',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      fontSize: 17,
                      height: 1,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: '刷新 (⌘R)',
                  icon: const Icon(Icons.refresh_rounded, size: 20),
                  onPressed: widget.onRefresh,
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: SizedBox(
              height: 40,
              child: FilledButton.icon(
                onPressed: widget.onNewChat,
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('新对话'),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: TextField(
              onChanged: (v) => setState(() => _query = v),
              style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13),
              decoration: lumeFilledDecoration(
                hintText: '搜索对话…',
                prefixIcon: Icon(
                  Icons.search_rounded,
                  size: 20,
                  color: LumeColors.text3,
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Text(
              '历史对话',
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: LumeColors.text3,
                letterSpacing: 0.2,
              ),
            ),
          ),
          const SizedBox(height: 4),
          if (widget.loading)
            const Expanded(
              child: Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          else if (widget.error != null)
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    widget.error!,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: LumeColors.danger,
                    ),
                  ),
                ),
              ),
            )
          else if (filtered.isEmpty)
            Expanded(
              child: Center(
                child: Text(
                  _query.isEmpty ? '暂无对话' : '没有匹配的对话',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: LumeColors.text3,
                  ),
                ),
              ),
            )
          else
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                itemCount: filtered.length,
                separatorBuilder: (_, _) => const SizedBox(height: 2),
                itemBuilder: (context, index) {
                  final item = filtered[index];
                  final active = item.key == widget.selectedKey;
                  return Material(
                    color: active ? LumeColors.fill : Colors.transparent,
                    borderRadius: BorderRadius.circular(8),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(8),
                      hoverColor: LumeColors.fillHover.withValues(alpha: 0.6),
                      onTap: () => widget.onSelect(item),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 9,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontSize: 13,
                                fontWeight:
                                    active ? FontWeight.w600 : FontWeight.w500,
                                color: LumeColors.text1,
                              ),
                            ),
                            if (item.preview.isNotEmpty) ...[
                              const SizedBox(height: 3),
                              Text(
                                item.preview,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  fontSize: 11,
                                  color: LumeColors.text3,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          const Divider(height: 1),
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: widget.onOpenSettings,
              hoverColor: LumeColors.fill,
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 16,
                      backgroundColor: LumeColors.fill,
                      child: Text(
                        name.isNotEmpty ? name[0].toUpperCase() : 'L',
                        style: theme.textTheme.labelLarge?.copyWith(
                          color: LumeColors.text1,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                          if (widget.session.email != null)
                            Text(
                              widget.session.email!,
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
                    Icon(
                      Icons.settings_outlined,
                      size: 18,
                      color: LumeColors.text3,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
