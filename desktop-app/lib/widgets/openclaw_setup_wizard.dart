import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/openclaw_bootstrap.dart';
import '../services/openclaw_bootstrap_service.dart';
import '../services/openclaw_install_service.dart';
import '../services/openclaw_setup_storage.dart';
import '../theme/lume_theme.dart';
import 'lume_mark.dart';

/// 首次本机 OpenClaw 安装向导（新用户默认走本机；老用户可在设置中打开）。
Future<bool> showOpenClawSetupWizard(
  BuildContext context, {
  required String token,
  required OpenClawBootstrap bootstrap,
  bool allowSkip = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    barrierDismissible: allowSkip,
    builder: (ctx) => _OpenClawSetupDialog(
      token: token,
      bootstrap: bootstrap,
      allowSkip: allowSkip,
    ),
  );
  return result == true;
}

class _OpenClawSetupDialog extends StatefulWidget {
  const _OpenClawSetupDialog({
    required this.token,
    required this.bootstrap,
    required this.allowSkip,
  });

  final String token;
  final OpenClawBootstrap bootstrap;
  final bool allowSkip;

  @override
  State<_OpenClawSetupDialog> createState() => _OpenClawSetupDialogState();
}

class _OpenClawSetupDialogState extends State<_OpenClawSetupDialog> {
  final _installer = OpenClawInstallService();
  final _bootstrapApi = OpenClawBootstrapService();
  final _setupStorage = OpenClawSetupStorage();

  bool _running = false;
  bool _done = false;
  String _step = '准备安装本机 OpenClaw…';
  double _progress = 0;
  String? _error;
  NodeCheckResult? _nodeCheck;

  @override
  void initState() {
    super.initState();
    _checkNode();
  }

  Future<void> _checkNode() async {
    final node = await _installer.checkNode();
    if (mounted) setState(() => _nodeCheck = node);
  }

  Future<void> _runInstall() async {
    setState(() {
      _running = true;
      _error = null;
      _done = false;
    });

    try {
      await _installer.install(
        bootstrap: widget.bootstrap,
        onProgress: (step, p) {
          if (mounted) {
            setState(() {
              _step = step;
              _progress = p;
            });
          }
        },
      );
      await _bootstrapApi.markComplete(
        token: widget.token,
        gatewayToken: widget.bootstrap.gatewayToken,
        sessionId: widget.bootstrap.sessionId,
      );
      await _setupStorage.markSetupDone();
      if (mounted) {
        setState(() {
          _running = false;
          _done = true;
          _step = '本机 OpenClaw 已就绪';
          _progress = 1;
        });
      }
    } on OpenClawInstallException catch (e) {
      if (mounted) {
        setState(() {
          _running = false;
          _error = e.message;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _running = false;
          _error = e.toString();
        });
      }
    }
  }

  Future<void> _openNodeInstall() async {
    final uri = Uri.parse('https://nodejs.org/en/download');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final nodeOk = _nodeCheck?.installed == true;

    return AlertDialog(
      backgroundColor: LumeColors.bgCard,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Row(
        children: [
          const LumeMark(size: 28),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              '本机 OpenClaw',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.bootstrap.recommendLocalFirst
                  ? '新用户默认在本机运行 OpenClaw，安装后即可免费开始对话。付费后可申请云端专属服务器。'
                  : '在本机安装 OpenClaw 与 Lume 插件，可通过 18790 直连聊天。',
              style: const TextStyle(
                color: LumeColors.text2,
                fontSize: 13,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 16),
            if (_nodeCheck != null)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  nodeOk ? Icons.check_circle_rounded : Icons.warning_rounded,
                  color: nodeOk ? LumeColors.accent : Colors.orange,
                  size: 22,
                ),
                title: Text(
                  nodeOk
                      ? 'Node.js ${_nodeCheck!.version ?? ""}'
                      : '未检测到 Node.js',
                ),
                subtitle: nodeOk && !_nodeCheck!.isNode22
                    ? const Text('建议使用 Node 22', style: TextStyle(fontSize: 12))
                    : null,
                trailing: nodeOk
                    ? null
                    : TextButton(
                        onPressed: _openNodeInstall,
                        child: const Text('下载 Node'),
                      ),
              ),
            if (_running || _done) ...[
              const SizedBox(height: 8),
              LinearProgressIndicator(value: _progress > 0 ? _progress : null),
              const SizedBox(height: 8),
              Text(
                _step,
                style: const TextStyle(fontSize: 12, color: LumeColors.text2),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(color: Colors.redAccent, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
      actions: [
        if (widget.allowSkip && !_done)
          TextButton(
            onPressed: _running ? null : () => Navigator.pop(context, false),
            child: const Text('稍后'),
          ),
        if (!_done)
          FilledButton(
            onPressed: (_running || !nodeOk) ? null : _runInstall,
            child: Text(_running ? '安装中…' : '一键安装'),
          ),
        if (_done)
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('开始聊天'),
          ),
      ],
    );
  }
}
