import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lingxicloud/providers/chat_provider.dart';
import 'package:lingxicloud/utils/constants.dart';

class AgentSelector extends StatelessWidget {
  const AgentSelector({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<ChatProvider>(
      builder: (context, chatProvider, child) {
        return Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                value: chatProvider.selectedAgentId,
                decoration: InputDecoration(
                  labelText: '选择 Agent',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  prefixIcon: const Icon(
                    Icons.smart_toy_outlined,
                    color: Constants.primaryColor,
                  ),
                ),
                items:
                    chatProvider.availableAgents.map((agent) {
                  return DropdownMenuItem<String>(
                    value: agent['id'] as String?,
                    child: Text(
                      agent['name'] as String? ?? 'Unknown',
                      style: TextStyle(
                        color: agent['is_default'] == true
                            ? Constants.primaryColor
                            : null,
                        fontWeight: agent['is_default'] == true
                            ? FontWeight.w600
                            : null,
                      ),
                    ),
                  );
                }).toList(),
                onChanged: (value) {
                  chatProvider.selectAgent(value);
                  chatProvider.loadHistory(agentId: value);
                },
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return '请选择一个 Agent';
                  }
                  return null;
                },
              ),
            ),
            const SizedBox(width: 12),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 10,
              ),
              decoration: BoxDecoration(
                color: Constants.primaryColor,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.info_outlined,
                    size: 16,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${chatProvider.availableAgents.length} 个 Agent',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
