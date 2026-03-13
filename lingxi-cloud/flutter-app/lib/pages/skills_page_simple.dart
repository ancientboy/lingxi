// 极简版技能库页面 - 用于测试黑屏问题
// 没有任何网络请求，没有任何异步操作

import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';

class SkillsPageSimple extends StatefulWidget {
  const SkillsPageSimple({super.key});

  @override
  State<SkillsPageSimple> createState() => _SkillsPageSimpleState();
}

class _SkillsPageSimpleState extends State<SkillsPageSimple> {
  // 静态数据，没有网络请求
  final List<Map<String, dynamic>> _skills = [
    {'id': '1', 'name': '技能 1', 'desc': '测试技能 1'},
    {'id': '2', 'name': '技能 2', 'desc': '测试技能 2'},
    {'id': '3', 'name': '技能 3', 'desc': '测试技能 3'},
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('技能库（极简版）'),
        backgroundColor: Constants.primaryColor,
        foregroundColor: Colors.white,
      ),
      body: ListView.builder(
        itemCount: _skills.length,
        itemBuilder: (context, index) {
          final skill = _skills[index];
          return ListTile(
            title: Text(skill['name']),
            subtitle: Text(skill['desc']),
            leading: const Icon(Icons.extension),
          );
        },
      ),
    );
  }
}
