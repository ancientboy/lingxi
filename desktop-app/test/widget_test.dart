import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lume_desktop/main.dart';

void main() {
  testWidgets('App boots to login or web shell', (WidgetTester tester) async {
    await tester.pumpWidget(const LumeDesktopApp());
    await tester.pump();
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
