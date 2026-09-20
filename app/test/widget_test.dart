import 'package:flutter_test/flutter_test.dart';

import 'package:outfit_matcher/main.dart';

void main() {
  testWidgets('mostra a tela inicial e navega pro guarda-roupa ao começar', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const OutfitMatcherApp());

    expect(find.text('Seu guarda-roupa,\nmais inteligente.'), findsOneWidget);

    await tester.ensureVisible(find.text('Começar'));
    await tester.tap(find.text('Começar'));
    await tester.pumpAndSettle();

    expect(find.text('Meu guarda-roupa'), findsWidgets);
  });
}
