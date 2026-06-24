import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class LoopTab extends StatefulWidget {
  final bool dk;
  const LoopTab({super.key, required this.dk});

  @override
  State<LoopTab> createState() => _LoopTabState();
}

class _LoopTabState extends State<LoopTab> with AutomaticKeepAliveClientMixin {
  late final WebViewController _controller;
  bool _isLoading = true;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            if (mounted) setState(() => _isLoading = false);
          },
        ),
      )
      ..loadRequest(Uri.parse('http://120.55.192.144:3000/loops.html'));
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Stack(
      children: [
        WebViewWidget(controller: _controller),
        if (_isLoading)
          Container(
            color: widget.dk ? const Color(0xFF1A1A2E) : const Color(0xFFF5F1EB),
            child: const Center(child: CircularProgressIndicator()),
          ),
      ],
    );
  }
}
