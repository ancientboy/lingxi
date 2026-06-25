import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/lume_theme.dart';

/// Native message composer for macOS desktop — sends via WebView JS bridge.
class ChatComposer extends StatefulWidget {
  const ChatComposer({
    super.key,
    required this.onSend,
    this.enabled = true,
    this.hint = 'Message Lume…',
  });

  final Future<void> Function(String text) onSend;
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
      widget.enabled &&
      !_sending &&
      _controller.text.trim().isNotEmpty;

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
    final nKey = event.logicalKey == LogicalKeyboardKey.keyN;
    final isMeta = HardwareKeyboard.instance.isMetaPressed;
    final isShift = HardwareKeyboard.instance.isShiftPressed;

    if (enter && isMeta) {
      _submit();
      return KeyEventResult.handled;
    }
    if (enter && !isShift) {
      _submit();
      return KeyEventResult.handled;
    }
    if (nKey && isMeta) {
      return KeyEventResult.ignored;
    }

    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: LumeColors.bgCard,
        border: Border(top: BorderSide(color: LumeColors.border)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      child: Row(
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
                style: const TextStyle(fontSize: 14, height: 1.45),
                decoration: InputDecoration(
                  hintText: widget.enabled ? widget.hint : '正在连接…',
                  hintStyle: TextStyle(color: LumeColors.text3, fontSize: 14),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: LumeColors.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: LumeColors.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(
                      color: LumeColors.accent,
                      width: 1.5,
                    ),
                  ),
                  filled: true,
                  fillColor: LumeColors.bg,
                ),
                onChanged: (_) => setState(() {}),
              ),
            ),
          ),
          const SizedBox(width: 10),
          _SendButton(
            enabled: _canSend,
            loading: _sending,
            onPressed: _submit,
          ),
        ],
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
      color: enabled ? LumeColors.accent : LumeColors.border,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: enabled ? onPressed : null,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 44,
          height: 44,
          child: loading
              ? const Padding(
                  padding: EdgeInsets.all(12),
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.arrow_upward_rounded, color: Colors.white, size: 22),
        ),
      ),
    );
  }
}

/// Footer hint for keyboard shortcuts.
class ComposerShortcutHint extends StatelessWidget {
  const ComposerShortcutHint({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text(
        'Enter 发送 · Shift+Enter 换行 · ⌘N 新对话',
        style: GoogleFonts.inter(
          fontSize: 11,
          color: LumeColors.text3,
        ),
      ),
    );
  }
}
