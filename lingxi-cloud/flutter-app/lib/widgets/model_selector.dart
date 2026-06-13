import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/pages/subscription_page.dart';

/// 模型选择 Pill（对齐 Web model-pill）
class ModelSelectorPill extends StatelessWidget {
  final List<Map<String, String>> models;
  final String selectedModel;
  final bool showDropdown;
  final bool isDarkMode;
  final VoidCallback onTap;

  const ModelSelectorPill({
    super.key,
    required this.models,
    required this.selectedModel,
    required this.showDropdown,
    required this.isDarkMode,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final currentModel = models.firstWhere(
      (m) => m['id'] == selectedModel,
      orElse: () => models.first,
    );
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: showDropdown
            ? (isDarkMode ? const Color(0xFF404040) : Constants.bgHover)
            : Colors.transparent,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 5, height: 5,
              decoration: BoxDecoration(
                color: Constants.primaryColor,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 4),
            Text(
              currentModel['name'] ?? 'GLM-5.2',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: isDarkMode ? const Color(0xFF8E8EA0) : Constants.textTertiaryColor,
              ),
            ),
            const SizedBox(width: 2),
            Icon(
              showDropdown ? Icons.expand_less : Icons.expand_more,
              size: 12,
              color: isDarkMode ? const Color(0xFF8E8EA0) : Constants.textTertiaryColor,
            ),
          ],
        ),
      ),
    );
  }
}

/// 模型下拉面板（对齐 Web model-dropdown）
class ModelSelectorDropdown extends StatelessWidget {
  final List<Map<String, String>> models;
  final String selectedModel;
  final bool isDarkMode;
  final bool isFreeUser;
  final void Function(String modelId) onSelect;

  const ModelSelectorDropdown({
    super.key,
    required this.models,
    required this.selectedModel,
    required this.isDarkMode,
    required this.isFreeUser,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(8, 0, 8, 6),
      constraints: const BoxConstraints(maxHeight: 360),
      decoration: BoxDecoration(
        color: isDarkMode ? const Color(0xFF2D2D30) : Constants.surfaceColor,
        borderRadius: BorderRadius.circular(Constants.radiusMd),
        border: Border.all(
          color: isDarkMode ? const Color(0xFF404040) : Constants.borderDefault,
        ),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 16, offset: const Offset(0, 4)),
        ],
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: models.map((m) {
            final isActive = m['id'] == selectedModel;
            final isPro = m['tier'] == 'pro';
            final isLocked = isPro && isFreeUser;
            return GestureDetector(
              onTap: isLocked ? null : () => onSelect(m['id']!),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: isActive
                    ? Constants.primaryColor.withOpacity(0.08)
                    : Colors.transparent,
                  borderRadius: BorderRadius.circular(Constants.radiusSm),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${m['name']}${isLocked ? ' 🔒' : (isPro ? ' ⭐' : '')}',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: isLocked
                                ? (isDarkMode ? Colors.white24 : Constants.textTertiaryColor)
                                : (isDarkMode ? const Color(0xFFECECF1) : Constants.textPrimaryColor),
                            ),
                          ),
                          const SizedBox(height: 1),
                          Text(
                            isLocked ? '订阅可用' : (m['desc'] ?? ''),
                            style: TextStyle(
                              fontSize: 11,
                              color: isLocked
                                ? const Color(0xFFEAB308)
                                : (isDarkMode ? const Color(0xFF6E6E80) : Constants.textTertiaryColor),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (isActive)
                      Icon(Icons.check, size: 16, color: Constants.primaryColor),
                  ],
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

/// 升级提示弹窗
void showUpgradeDialog(BuildContext context) {
  showDialog(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('解锁 AI 团队'),
      content: const Text('订阅后可以使用完整的 8 位 Agent 团队'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('稍后再说'),
        ),
        ElevatedButton(
          onPressed: () {
            Navigator.pop(dialogContext);
            Navigator.push(
              dialogContext,
              MaterialPageRoute(builder: (_) => SubscriptionPage()),
            );
          },
          child: const Text('立即订阅'),
        ),
      ],
    ),
  );
}

