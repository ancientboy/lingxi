import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

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
    final name = widget.session.displayName ?? 'Lume';
    final filtered = _filtered;

    return Container(
      width: 260,
      decoration: const BoxDecoration(
        color: LumeColors.bgCard,
        border: Border(right: BorderSide(color: LumeColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 10, 8),
            child: Row(
              children: [
                const LumeMark(size: 24),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Lume',
                    style: GoogleFonts.dmSans(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: LumeColors.text1,
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
                style: FilledButton.styleFrom(
                  backgroundColor: LumeColors.accent,
                  foregroundColor: Colors.white,
                  elevation: 0,
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: TextField(
              onChanged: (v) => setState(() => _query = v),
              style: const TextStyle(fontSize: 13),
              decoration: InputDecoration(
                hintText: '搜索对话…',
                hintStyle: TextStyle(color: LumeColors.text3, fontSize: 13),
                prefixIcon: Icon(Icons.search_rounded, size: 20, color: LumeColors.text3),
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
                filled: true,
                fillColor: LumeColors.bg,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: LumeColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: LumeColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: LumeColors.accent),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Text(
              '历史对话',
              style: GoogleFonts.dmSans(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: LumeColors.text3,
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
                    style: const TextStyle(
                      color: LumeColors.danger,
                      fontSize: 12,
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
                  style: const TextStyle(color: LumeColors.text3, fontSize: 12),
                ),
              ),
            )
          else
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                itemCount: filtered.length,
                separatorBuilder: (_, _) => const SizedBox(height: 4),
                itemBuilder: (context, index) {
                  final item = filtered[index];
                  final active = item.key == widget.selectedKey;
                  return Material(
                    color: active
                        ? LumeColors.accent.withValues(alpha: 0.08)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: () => widget.onSelect(item),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 10,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: active
                                    ? LumeColors.accent
                                    : LumeColors.text1,
                              ),
                            ),
                            if (item.preview.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                item.preview,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
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
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 16,
                      backgroundColor: LumeColors.accent.withValues(alpha: 0.12),
                      child: Text(
                        name.isNotEmpty ? name[0].toUpperCase() : 'L',
                        style: const TextStyle(
                          color: LumeColors.accent,
                          fontWeight: FontWeight.w700,
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
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          if (widget.session.email != null)
                            Text(
                              widget.session.email!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 11,
                                color: LumeColors.text3,
                              ),
                            ),
                        ],
                      ),
                    ),
                    const Icon(
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
