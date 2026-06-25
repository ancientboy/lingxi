import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models/lume_session.dart';
import '../theme/lume_theme.dart';

class SessionSidebar extends StatelessWidget {
  const SessionSidebar({
    super.key,
    required this.sessions,
    required this.loading,
    required this.error,
    required this.selectedKey,
    required this.onNewChat,
    required this.onSelect,
    required this.onRefresh,
  });

  final List<LumeSession> sessions;
  final bool loading;
  final String? error;
  final String? selectedKey;
  final VoidCallback onNewChat;
  final ValueChanged<LumeSession> onSelect;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 280,
      decoration: const BoxDecoration(
        color: LumeColors.bgCard,
        border: Border(right: BorderSide(color: LumeColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '历史对话',
                    style: GoogleFonts.dmSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: LumeColors.text2,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: '刷新列表',
                  icon: const Icon(Icons.refresh_rounded, size: 20),
                  onPressed: onRefresh,
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: SizedBox(
              height: 40,
              child: OutlinedButton.icon(
                onPressed: onNewChat,
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('新对话'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: LumeColors.accent,
                  side: const BorderSide(color: LumeColors.border),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          if (loading)
            const Expanded(
              child: Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          else if (error != null)
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: LumeColors.danger,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
            )
          else
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                itemCount: sessions.length,
                separatorBuilder: (_, _) => const SizedBox(height: 4),
                itemBuilder: (context, index) {
                  final item = sessions[index];
                  final active = item.key == selectedKey;
                  return Material(
                    color: active
                        ? LumeColors.accent.withValues(alpha: 0.08)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: () => onSelect(item),
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
        ],
      ),
    );
  }
}
