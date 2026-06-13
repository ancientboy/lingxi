import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';

/// 邀请统计项
class InviteStat extends StatelessWidget {
  final String value;
  final String label;

  const InviteStat(this.value, this.label, {super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.bold,
            color: Constants.primaryColor,
          ),
        ),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
      ],
    );
  }
}

/// 用量统计行
class UsageRow extends StatelessWidget {
  final String label;
  final String value;

  const UsageRow(this.label, this.value, {super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: Colors.grey)),
          Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

/// Token 统计卡片
class TokenCard extends StatelessWidget {
  final String label;
  final String tokens;
  final String requests;

  const TokenCard(this.label, this.tokens, this.requests, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
          const SizedBox(height: 4),
          Text(tokens, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          Text(requests, style: const TextStyle(fontSize: 11, color: Colors.grey)),
        ],
      ),
    );
  }
}

/// 侧边栏工具项
class SidebarToolItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final bool isDarkMode;

  const SidebarToolItem({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    required this.isDarkMode,
  });

  @override
  Widget build(BuildContext context) {
    final textColor = isDarkMode ? Colors.white : Colors.black87;
    return ListTile(
      dense: true,
      leading: Icon(icon, color: Constants.primaryColor, size: 20),
      title: Text(title, style: TextStyle(color: textColor, fontSize: 14)),
      onTap: () {
        Navigator.pop(context);
        onTap();
      },
    );
  }
}
