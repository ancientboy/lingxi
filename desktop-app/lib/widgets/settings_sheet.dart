import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/app_config.dart';
import '../services/auth_storage.dart';
import '../services/subscription_service.dart';
import '../theme/lume_theme.dart';
import 'lume_mark.dart';

Future<void> showLumeSettingsSheet(
  BuildContext context, {
  required AuthSession session,
  required VoidCallback onLogout,
  required String token,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: LumeColors.bgCard,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) => _SettingsSheet(
      session: session,
      token: token,
      onLogout: onLogout,
    ),
  );
}

class _SettingsSheet extends StatefulWidget {
  const _SettingsSheet({
    required this.session,
    required this.token,
    required this.onLogout,
  });

  final AuthSession session;
  final String token;
  final VoidCallback onLogout;

  @override
  State<_SettingsSheet> createState() => _SettingsSheetState();
}

class _SettingsSheetState extends State<_SettingsSheet> {
  final _subscriptionService = SubscriptionService();
  SubscriptionInfo? _subscription;
  bool _loadingSub = true;

  @override
  void initState() {
    super.initState();
    _loadSubscription();
  }

  Future<void> _loadSubscription() async {
    final info = await _subscriptionService.fetchStatus(widget.token);
    if (mounted) {
      setState(() {
        _subscription = info;
        _loadingSub = false;
      });
    }
  }

  Future<void> _openWeb() async {
    final uri = Uri.parse(AppConfig.apiOrigin);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _openSubscription() async {
    final uri = Uri.parse('${AppConfig.apiOrigin}/subscription.html');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final email = widget.session.email ?? widget.session.displayName ?? '账号';

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
                widget.session.displayName ?? 'Lume 用户',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: Text(email, style: const TextStyle(fontSize: 12)),
            ),
            const Divider(),
            if (_loadingSub)
              const ListTile(
                leading: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                title: Text('加载订阅信息…'),
              )
            else if (_subscription != null)
              ListTile(
                leading: const Icon(Icons.workspace_premium_outlined,
                    color: LumeColors.accent),
                title: Text('订阅 · ${_subscription!.planLabel}'),
                subtitle: Text(
                  _subscription!.serverOnline
                      ? '服务器在线'
                      : '服务器未就绪',
                  style: TextStyle(
                    color: _subscription!.serverOnline
                        ? LumeColors.accent
                        : LumeColors.text3,
                    fontSize: 12,
                  ),
                ),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: _openSubscription,
              ),
            ListTile(
              leading:
                  const Icon(Icons.language_rounded, color: LumeColors.text2),
              title: const Text('在浏览器中打开 lumeword.cn'),
              onTap: _openWeb,
            ),
            ListTile(
              leading:
                  const Icon(Icons.info_outline_rounded, color: LumeColors.text2),
              title: const Text('关于 Lume'),
              subtitle: const Text('桌面客户端 v1.3.0 · 连接云端 AI 团队'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.pop(context);
                widget.onLogout();
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
