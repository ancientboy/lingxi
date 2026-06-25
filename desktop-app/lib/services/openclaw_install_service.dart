import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';

import '../config/app_config.dart';
import '../models/openclaw_bootstrap.dart';

typedef InstallProgress = void Function(String step, double progress);

class OpenClawInstallException implements Exception {
  OpenClawInstallException(this.message);
  final String message;
  @override
  String toString() => message;
}

class NodeCheckResult {
  const NodeCheckResult({required this.installed, this.version});

  final bool installed;
  final String? version;

  bool get isNode22 =>
      version != null && RegExp(r'v22\.').hasMatch(version!);
}

class OpenClawInstallService {
  static const _bundleAsset = 'assets/openclaw/lume-local-bundle.tar.gz';

  String get _home => Platform.environment['HOME'] ?? '';
  String get _openclawHome => '$_home/.openclaw';
  String get _pluginDir =>
      '$_openclawHome/workspace/plugins/openclaw-lume';

  Future<NodeCheckResult> checkNode() async {
    final result = await Process.run(
      'bash',
      ['-lc', 'command -v node >/dev/null && node --version'],
    );
    if (result.exitCode != 0) {
      return const NodeCheckResult(installed: false);
    }
    final version = (result.stdout as String).trim();
    return NodeCheckResult(installed: true, version: version);
  }

  Future<bool> isOpenClawCliAvailable() async {
    final result = await Process.run(
      'bash',
      ['-lc', 'command -v openclaw >/dev/null'],
    );
    return result.exitCode == 0;
  }

  Future<void> installOpenClawCli(String version) async {
    final result = await Process.run(
      'bash',
      ['-lc', 'npm install -g openclaw@$version'],
    );
    if (result.exitCode != 0) {
      throw OpenClawInstallException(
        _trimOutput(result.stderr) ?? '安装 OpenClaw CLI 失败',
      );
    }
  }

  Future<void> install({
    required OpenClawBootstrap bootstrap,
    InstallProgress? onProgress,
  }) async {
    if (_home.isEmpty) {
      throw OpenClawInstallException('无法读取用户目录 HOME');
    }

    void report(String step, double p) => onProgress?.call(step, p);

    report('检查 Node.js…', 0.05);
    final node = await checkNode();
    if (!node.installed) {
      throw OpenClawInstallException(
        '未检测到 Node.js。请先安装 Node 22（推荐 Homebrew: brew install node@22）',
      );
    }
    if (!node.isNode22) {
      report('当前 Node ${node.version}，建议使用 v22', 0.08);
    }

    report('释放本机资源包…', 0.15);
    await _extractBundle();

    report('写入 OpenClaw 配置…', 0.35);
    await _applyBootstrap(bootstrap);

    report('安装 Lume 插件依赖…', 0.5);
    await _installPluginDeps();

    report('安装 OpenClaw CLI…', 0.65);
    if (!await isOpenClawCliAvailable()) {
      await installOpenClawCli(bootstrap.openclawVersion);
    }

    report('启动 Gateway…', 0.85);
    await startGateway();

    report('等待 Lume 插件就绪…', 0.92);
    await _waitForLumePlugin(bootstrap.lumePluginPort);

    report('完成', 1.0);
  }

  Future<void> startGateway() async {
    await Process.run('bash', [
      '-lc',
      'pkill -f "openclaw gateway" 2>/dev/null || true',
    ]);
    await Future.delayed(const Duration(seconds: 1));

    final logPath = '/tmp/lume-openclaw-gateway.log';
    await Process.run('bash', [
      '-lc',
      'cd "$_openclawHome" && nohup openclaw gateway > "$logPath" 2>&1 &',
    ]);
  }

  Future<void> _extractBundle() async {
    final temp = await Directory.systemTemp.createTemp('lume-openclaw-');
    final tarPath = '${temp.path}/bundle.tar.gz';
    final bytes = await rootBundle.load(_bundleAsset);
    await File(tarPath).writeAsBytes(
      bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes),
    );

    final extract = await Process.run('tar', ['xzf', tarPath, '-C', temp.path]);
    if (extract.exitCode != 0) {
      throw OpenClawInstallException(
        _trimOutput(extract.stderr) ?? '解压本机资源包失败',
      );
    }

    Directory? packageRoot;
    for (final entity in temp.listSync()) {
      if (entity is Directory &&
          entity.path.contains('lume-local-openclaw')) {
        packageRoot = entity;
        break;
      }
    }
    if (packageRoot == null) {
      throw OpenClawInstallException('资源包结构异常');
    }

    final src = Directory('${packageRoot.path}/.openclaw');
    if (!src.existsSync()) {
      throw OpenClawInstallException('资源包缺少 .openclaw 目录');
    }

    await Directory(_openclawHome).create(recursive: true);
    final cp = await Process.run('cp', ['-R', '${src.path}/.', _openclawHome]);
    if (cp.exitCode != 0) {
      throw OpenClawInstallException(
        _trimOutput(cp.stderr) ?? '复制 OpenClaw 配置失败',
      );
    }
  }

  Future<void> _applyBootstrap(OpenClawBootstrap bootstrap) async {
    final configPath = '$_openclawHome/openclaw.json';
    final configFile = File(configPath);
    if (!configFile.existsSync()) {
      throw OpenClawInstallException('openclaw.json 不存在');
    }

    final config =
        jsonDecode(await configFile.readAsString()) as Map<String, dynamic>;

    config['env'] = {
      'ZHIPU_API_KEY': bootstrap.env['ZHIPU_API_KEY'] ?? '',
      'DASHSCOPE_API_KEY': bootstrap.env['DASHSCOPE_API_KEY'] ?? '',
    };

    final gateway = (config['gateway'] as Map<String, dynamic>?) ?? {};
    gateway['port'] = bootstrap.gatewayPort;
    final auth = (gateway['auth'] as Map<String, dynamic>?) ?? {};
    auth['mode'] = 'token';
    auth['token'] = bootstrap.gatewayToken;
    gateway['auth'] = auth;
    final controlUi = (gateway['controlUi'] as Map<String, dynamic>?) ?? {};
    controlUi['basePath'] = bootstrap.sessionId;
    gateway['controlUi'] = controlUi;
    config['gateway'] = gateway;

    final channels = (config['channels'] as Map<String, dynamic>?) ?? {};
    final lume = (channels['lume'] as Map<String, dynamic>?) ?? {};
    lume['port'] = bootstrap.lumePluginPort;
    lume['secret'] = bootstrap.lumeSecret;
    channels['lume'] = lume;
    config['channels'] = channels;

    await configFile.writeAsString(
      const JsonEncoder.withIndent('  ').convert(config),
    );

    final profilesJson =
        const JsonEncoder.withIndent('  ').convert(bootstrap.authProfiles);
    final mainDir = '$_openclawHome/agents/main';
    await Directory('$mainDir/agent').create(recursive: true);
    await File('$mainDir/auth-profiles.json').writeAsString(profilesJson);
    await File('$mainDir/agent/auth-profiles.json').writeAsString(profilesJson);
  }

  Future<void> _installPluginDeps() async {
    if (!Directory(_pluginDir).existsSync()) return;
    final result = await Process.run(
      'bash',
      [
        '-lc',
        'cd "$_pluginDir" && npm install --production --no-audit --no-fund',
      ],
    );
    if (result.exitCode != 0) {
      final fallback = await Process.run(
        'bash',
        ['-lc', 'cd "$_pluginDir" && npm install ws --no-audit --no-fund'],
      );
      if (fallback.exitCode != 0) {
        throw OpenClawInstallException(
          _trimOutput(fallback.stderr) ?? '安装插件依赖失败',
        );
      }
    }
  }

  Future<void> _waitForLumePlugin(int port) async {
    for (var i = 0; i < 30; i++) {
      try {
        final socket = await Socket.connect(
          AppConfig.localLumeHost,
          port,
          timeout: const Duration(seconds: 2),
        );
        await socket.close();
        return;
      } catch (_) {
        await Future.delayed(const Duration(seconds: 1));
      }
    }
    throw OpenClawInstallException(
      'Lume 插件端口 $port 未就绪，请检查日志 /tmp/lume-openclaw-gateway.log',
    );
  }

  String? _trimOutput(Object? raw) {
    final text = raw?.toString().trim();
    if (text == null || text.isEmpty) return null;
    return text.length > 200 ? text.substring(0, 200) : text;
  }
}
