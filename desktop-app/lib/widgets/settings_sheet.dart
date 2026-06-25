import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/app_config.dart';
import '../services/auth_storage.dart';
import '../theme/lume_theme.dart';
import 'lume_mark.dart';

Future<void> showLumeSettingsSheet(
  BuildContext context, {
  required AuthSession session,
  required VoidCallback onLogout,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: LumeColors.bgCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) => _SettingsSheet(session: session, onLogout: onLogout),
  );
}

class _SettingsSheet extends StatelessWidget {
  const _SettingsSheet({
    required this.session,
    required this.onLogout,
  });

  final AuthSession session;
  final VoidCallback onLogout;

  Future<void> _openWeb() async {
    final uri = Uri.parse(AppConfig.apiOrigin);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final email = session.email ?? session.displayName ?? '账号';

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  '设置',
                  style: GoogleFonts.dmSans(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const LumeMark(size: 36),
              title: Text(
                session.displayName ?? 'Lume 用户',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: Text(email, style: const TextStyle(fontSize: 12)),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.language_rounded, color: LumeColors.text2),
              title: const Text('在浏览器中打开 lumeword.cn'),
              onTap: _openWeb,
            ),
            ListTile(
              leading: const Icon(Icons.info_outline_rounded, color: LumeColors.text2),
              title: const Text('关于 Lume'),
              subtitle: const Text('桌面客户端 · 连接云端 AI 团队'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.pop(context);
                onLogout();
              },
              icon: const Icon(Icons.logout_rounded, size: 18),
              label: const Text('退出登录'),
              style: OutlinedButton.styleFrom(
                foregroundColor: LumeColors.danger,
                side: const BorderSide(color: LumeColors.border),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
