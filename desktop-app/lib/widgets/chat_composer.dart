import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/lume_model.dart';
import '../theme/lume_theme.dart';

/// Native message composer — Cursor-style floating capsule in the shell.
class ChatComposer extends StatefulWidget {
  const ChatComposer({
    super.key,
    required this.onSend,
    required this.onRefreshModels,
    required this.onSelectModel,
    this.modelState,
    this.enabled = true,
    this.hint = 'Message Lume…',
  });

  final Future<void> Function(String text) onSend;
  final Future<void> Function() onRefreshModels;
  final Future<void> Function(String modelId) onSelectModel;
  final LumeModelState? modelState;
  final bool enabled;
  final String hint;

  @override
  State<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends State<ChatComposer> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  bool get _canSend =>
      widget.enabled && !_sending && _controller.text.trim().isNotEmpty;

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty || !widget.enabled || _sending) return;

    setState(() => _sending = true);
    try {
      await widget.onSend(text);
      _controller.clear();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent || !widget.enabled) {
      return KeyEventResult.ignored;
    }

    final enter = event.logicalKey == LogicalKeyboardKey.enter;
    final isShift = HardwareKeyboard.instance.isShiftPressed;
    final isMeta = HardwareKeyboard.instance.isMetaPressed;

    if (enter && isMeta) {
      _submit();
      return KeyEventResult.handled;
    }
    if (enter && !isShift) {
      _submit();
      return KeyEventResult.handled;
    }
    if (isMeta) return KeyEventResult.ignored;

    return KeyEventResult.ignored;
  }

  Future<void> _openModelPicker() async {
    await widget.onRefreshModels();
    if (!mounted) return;
    final state = widget.modelState;
    if (state == null) return;

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: LumeColors.bg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                child: Text(
                  '选择模型',
                  style: Theme.of(ctx).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
              ),
              ListTile(
                title: const Text('Auto'),
                trailing: state.currentId == 'auto'
                    ? Icon(Icons.check_rounded, color: LumeColors.focus)
                    : null,
                onTap: () {
                  Navigator.pop(ctx);
                  widget.onSelectModel('auto');
                },
              ),
              const Divider(height: 1),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: state.models.map((m) {
                    final locked = state.isFreeUser && m.isPro;
                    final active = m.id == state.currentId;
                    return ListTile(
                      title: Text(m.name),
                      subtitle: m.provider != null
                          ? Text(m.provider!, style: const TextStyle(fontSize: 11))
                          : null,
                      trailing: locked
                          ? const Icon(Icons.lock_outline, size: 18)
                          : active
                              ? Icon(Icons.check_rounded, color: LumeColors.focus)
                              : null,
                      enabled: !locked,
                      onTap: locked
                          ? null
                          : () {
                              Navigator.pop(ctx);
                              widget.onSelectModel(m.id);
                            },
                    );
                  }).toList(),
                ),
              ),
              if (state.isFreeUser)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    '升级订阅可解锁 Pro 模型',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: LumeColors.text3),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final modelLabel = widget.modelState?.currentLabel ?? 'Auto';

    return ColoredBox(
      color: LumeColors.bg,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 14),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: LumeColors.fill,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: LumeColors.hairline),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Material(
                      color: LumeColors.bg,
                      borderRadius: BorderRadius.circular(8),
                      child: InkWell(
                        onTap: widget.enabled ? _openModelPicker : null,
                        borderRadius: BorderRadius.circular(8),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 5,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.auto_awesome_rounded,
                                size: 14,
                                color: LumeColors.text2,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                modelLabel,
                                style: theme.textTheme.labelMedium?.copyWith(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(width: 2),
                              Icon(
                                Icons.expand_more_rounded,
                                size: 16,
                                color: LumeColors.text3,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const Spacer(),
                    Text(
                      'Enter 发送',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: LumeColors.text3,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Focus(
                        onKeyEvent: _onKey,
                        child: TextField(
                          controller: _controller,
                          focusNode: _focusNode,
                          enabled: widget.enabled && !_sending,
                          minLines: 1,
                          maxLines: 6,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontSize: 14,
                            height: 1.45,
                          ),
                          decoration: InputDecoration(
                            hintText:
                                widget.enabled ? widget.hint : '正在连接…',
                            hintStyle: TextStyle(
                              color: LumeColors.text3,
                              fontSize: 14,
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 4,
                              vertical: 8,
                            ),
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            filled: false,
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    _SendButton(
                      enabled: _canSend,
                      loading: _sending,
                      onPressed: _submit,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SendButton extends StatelessWidget {
  const _SendButton({
    required this.enabled,
    required this.loading,
    required this.onPressed,
  });

  final bool enabled;
  final bool loading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: enabled ? LumeColors.accent : LumeColors.fillHover,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: enabled ? onPressed : null,
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(
          width: 36,
          height: 36,
          child: loading
              ? const Padding(
                  padding: EdgeInsets.all(10),
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : Icon(
                  Icons.arrow_upward_rounded,
                  color: enabled ? Colors.white : LumeColors.text3,
                  size: 20,
                ),
        ),
      ),
    );
  }
}
