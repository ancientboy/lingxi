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
    final bgColor = isDark ? Color(0xFF1A1A2E) : Colors.white;
    final selectedColor = Constants.primaryColor;
    final unselectedColor = isDark ? Colors.white38 : Colors.black38;

    return PopScope(
      canPop: _currentIndex == 0,
      onPopInvoked: (didPop) {
        if (!didPop && _currentIndex != 0) {
          setState(() => _currentIndex = 0);
        }
      },
      child: Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: [
          ChatPage(
            onRegisterUseSkill: (fn) => _chatUseSkill = fn,
            onRegisterOpenSkills: (register) => register(() => setState(() => _currentIndex = 1)),
          ),
          SkillsPage(onUseSkill: switchToChatWithSkill),
          ToolsPage(),
          ProfilePage(),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: bgColor,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: Offset(0, -2),
            ),
          ],
          border: Border(
            top: BorderSide(
              color: isDark ? Colors.white.withOpacity(0.06) : Colors.black.withOpacity(0.06),
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
