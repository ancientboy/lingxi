import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/pages/chat_page.dart';
import 'package:lingxicloud/pages/skills_page.dart';
import 'package:lingxicloud/pages/tools_page.dart';
import 'package:lingxicloud/pages/profile_page.dart';

class MainShell extends StatefulWidget {
  MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;

  // 🆕 ChatPage 回调：由 ChatPage 在 initState 时注册
  void Function(String skillId, String skillName, String example)? _chatUseSkill;

  // 🆕 切换到聊天页并使用技能
  void switchToChatWithSkill(String skillId, String skillName, String example) {
    setState(() => _currentIndex = 0);
    // 使用 WidgetsBinding 确保在 build 完成后调用
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _chatUseSkill?.call(skillId, skillName, example);
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDark ? Color(0xFF1A1A1A) : Constants.surfaceColor;
    final selectedColor = Constants.textPrimaryColor;
    final unselectedColor = isDark ? Colors.white38 : Constants.textTertiaryColor;

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: [
          ChatPage(onRegisterUseSkill: (fn) => _chatUseSkill = fn),
          SkillsPage(onUseSkill: switchToChatWithSkill),
          ToolsPage(),
          ProfilePage(),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: bgColor,
          border: Border(
            top: BorderSide(
              color: isDark ? Color(0xFF404040) : Constants.borderDefault,
              width: 0.5,
            ),
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildItem(Icons.chat_bubble_outline, Icons.chat_bubble, '对话', 0, selectedColor, unselectedColor),
                _buildItem(Icons.auto_awesome_outlined, Icons.auto_awesome, '技能', 1, selectedColor, unselectedColor),
                _buildItem(Icons.build_outlined, Icons.build, '工具', 2, selectedColor, unselectedColor),
                _buildItem(Icons.person_outline, Icons.person, '我的', 3, selectedColor, unselectedColor),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildItem(IconData icon, IconData activeIcon, String label, int index, Color selectedColor, Color unselectedColor) {
    final selected = _currentIndex == index;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => setState(() => _currentIndex = index),
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedSwitcher(
              duration: Duration(milliseconds: 200),
              child: Icon(
                selected ? activeIcon : icon,
                key: ValueKey(selected),
                color: selected ? selectedColor : unselectedColor,
                size: 24,
              ),
            ),
            SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                color: selected ? selectedColor : unselectedColor,
                fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
