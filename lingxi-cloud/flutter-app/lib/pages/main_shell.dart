import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';
import 'package:lingxicloud/pages/chat_page.dart';
import 'package:lingxicloud/pages/skills_page.dart';
import 'package:lingxicloud/pages/tools_page.dart';
import 'package:lingxicloud/pages/profile_page.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;

  // Lazy-loaded pages
  static const List<Widget> _pages = [
    ChatPage(),
    SkillsPage(),
    ToolsPage(),
    ProfilePage(),
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDark ? const Color(0xFF1A1A2E) : Colors.white;
    final selectedColor = Constants.primaryColor;
    final unselectedColor = isDark ? Colors.white38 : Colors.black38;

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _pages,
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: bgColor,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, -2),
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
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
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
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: Icon(
                selected ? activeIcon : icon,
                key: ValueKey(selected),
                color: selected ? selectedColor : unselectedColor,
                size: 24,
              ),
            ),
            const SizedBox(height: 2),
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
