import 'package:flutter/material.dart';
import 'package:lingxicloud/utils/constants.dart';

class TestPage extends StatelessWidget {
  TestPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('测试页面'),
        backgroundColor: Constants.primaryColor,
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: Text(
          '这是一个测试页面',
          style: TextStyle(fontSize: 24),
        ),
      ),
    );
  }
}
