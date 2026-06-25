import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/app_config.dart';
import '../models/connection_mode.dart';
import '../services/auth_storage.dart';
import '../services/connection_mode_service.dart';
import '../services/local_openclaw_service.dart';
import '../services/subscription_service.dart';
import '../theme/lume_theme.dart';
import 'lume_mark.dart';

Future<void> showLumeSettingsSheet(
  BuildContext context, {
  required AuthSession session,
  required VoidCallback onLogout,
  required String token,
  ConnectionMode? initialMode,
  EffectiveConnection? effectiveConnection,
  LocalOpenClawStatus? localStatus,
  Future<void> Function(ConnectionMode mode)? onConnectionModeChanged,
  Future<void> Function()? onInstallOpenClaw,
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
      initialMode: initialMode,
      effectiveConnection: effectiveConnection,
      localStatus: localStatus,
      onConnectionModeChanged: onConnectionModeChanged,
      onInstallOpenClaw: onInstallOpenClaw,
    ),
  );
}

class _SettingsSheet extends StatefulWidget {
  const _SettingsSheet({
    required this.session,
    required this.token,
    required this.onLogout,
    this.initialMode,
    this.effectiveConnection,
    this.localStatus,
    this.onConnectionModeChanged,
    this.onInstallOpenClaw,
  });

  final AuthSession session;
  final String token;
  final VoidCallback onLogout;
  final ConnectionMode? initialMode;
  final EffectiveConnection? effectiveConnection;
  final LocalOpenClawStatus? localStatus;
  final Future<void> Function(ConnectionMode mode)? onConnectionModeChanged;
  final Future<void> Function()? onInstallOpenClaw;

  @override
  State<_SettingsSheet> createState() => _SettingsSheetState();
}

class _SettingsSheetState extends State<_SettingsSheet> {
  final _subscriptionService = SubscriptionService();
  final _connectionService = ConnectionModeService();
  final _localProbe = LocalOpenClawService();

  SubscriptionInfo? _subscription;
  bool _loadingSub = true;
  ConnectionMode _mode = ConnectionMode.auto;
  EffectiveConnection? _effective;
  LocalOpenClawStatus? _localStatus;
  bool _probing = false;
  bool _savingMode = false;

  @override
  void initState() {
    super.initState();
    _mode = widget.initialMode ?? ConnectionMode.auto;
    _effective = widget.effectiveConnection;
    _localStatus = widget.localStatus;
    _loadSubscription();
    if (_localStatus == null) _probeLocal();
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

  Future<void> _probeLocal() async {
    setState(() => _probing = true);
    final status = await _localProbe.probeLocal();
    final resolved = await _connectionService.resolve();
    if (mounted) {
      setState(() {
        _localStatus = status;
        _effective = resolved.effective;
        _probing = false;
      });
    }
  }

  Future<void> _setMode(ConnectionMode mode) async {
    if (_savingMode || _mode == mode) return;
    setState(() {
      _savingMode = true;
      _mode = mode;
    });
    await _connectionService.saveMode(mode);
    if (widget.onConnectionModeChanged != null) {
      await widget.onConnectionModeChanged!(mode);
    }
    final resolved = await _connectionService.resolve();
    if (mounted) {
      setState(() {
        _effective = resolved.effective;
        _localStatus = resolved.status;
        _savingMode = false;
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

  Future<void> _openOpenClawInstall() async {
    if (widget.onInstallOpenClaw != null) {
      await widget.onInstallOpenClaw!();
      return;
    }
    final uri = Uri.parse(AppConfig.openClawInstallUrl);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  String _effectiveLabel() {
    switch (_effective) {
      case EffectiveConnection.local:
        return '当前：本机直连';
      case EffectiveConnection.cloud:
        return '当前：云端代理';
      case null:
        return '检测连接方式…';
    }
  }

  @override
  Widget build(BuildContext context) {
    final email = widget.session.email ?? widget.session.displayName ?? '账号';
    final localReady = _localStatus?.lumePluginOpen ?? false;

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
              leading: const LumeMark(size: 40, badge: true),
              title: Text(
                widget.session.displayName ?? 'Lume 用户',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: Text(email, style: const TextStyle(fontSize: 12)),
            ),
            const Divider(),
            Padding(
              padding: const EdgeInsets.only(top: 4, bottom: 4),
              child: Text(
                'OpenClaw 连接',
                style: GoogleFonts.dmSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: LumeColors.text2,
                ),
              ),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                localReady ? Icons.check_circle_rounded : Icons.cloud_outlined,
                color: localReady ? LumeColors.accent : LumeColors.text3,
              ),
              title: Text(_localStatus?.summary ?? '检测本机 OpenClaw…'),
              subtitle: Text(
                '${_effectiveLabel()} · Gateway ${AppConfig.gatewayPort} · Lume ${AppConfig.lumePluginPort}',
                style: const TextStyle(fontSize: 12),
              ),
              trailing: _probing
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : IconButton(
                      icon: const Icon(Icons.refresh_rounded, size: 20),
                      onPressed: _probeLocal,
                      tooltip: '重新检测',
                    ),
            ),
            ...ConnectionMode.values.map((mode) {
              final selected = _mode == mode;
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  selected
                      ? Icons.radio_button_checked_rounded
                      : Icons.radio_button_off_rounded,
                  color: selected ? LumeColors.accent : LumeColors.text3,
                  size: 22,
                ),
                title: Text(mode.label),
                subtitle: Text(
                  mode.description,
                  style: const TextStyle(fontSize: 12),
                ),
                onTap: _savingMode ? null : () => _setMode(mode),
              );
            }),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.terminal_rounded, color: LumeColors.text2),
              title: const Text('安装 OpenClaw'),
              subtitle: const Text(
                '在本机安装 Gateway 与 Lume 插件',
                style: TextStyle(fontSize: 12),
              ),
              trailing: const Icon(Icons.open_in_new_rounded, size: 18),
              onTap: _openOpenClawInstall,
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
              subtitle: const Text('桌面客户端 v1.6.1 · 本机优先 / 云端可选'),
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
