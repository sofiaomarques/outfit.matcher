import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:outfit_matcher/main.dart';
import 'package:outfit_matcher/screens/auth_screen.dart';
import 'package:outfit_matcher/theme/app_theme.dart';

void main() {
  testWidgets('sem os dart-define do Supabase, avisa que falta configuração', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const OutfitMatcherApp());

    expect(
      find.textContaining('Configuração do Supabase ausente.'),
      findsOneWidget,
    );
  });

  // AuthScreen só fala com o Supabase ao enviar um formulário válido, então
  // a navegação entre boas-vindas, cadastro e login roda sem backend.
  group('AuthScreen', () {
    Future<void> pumpAuth(WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(theme: AppTheme.light, home: const AuthScreen()),
      );
    }

    testWidgets('"Começar" abre o cadastro e valida os campos', (
      WidgetTester tester,
    ) async {
      await pumpAuth(tester);
      expect(find.text('Seu guarda-roupa,\nmais inteligente.'), findsOneWidget);

      await tester.ensureVisible(find.text('Começar'));
      await tester.tap(find.text('Começar'));
      await tester.pumpAndSettle();

      expect(find.text('Criar conta'), findsOneWidget);
      expect(find.text('Como você quer ser chamada?'), findsOneWidget);

      final cadastrar = find.widgetWithText(ElevatedButton, 'Cadastrar');
      await tester.ensureVisible(cadastrar);
      await tester.tap(cadastrar);
      await tester.pump();

      expect(find.text('Diz como podemos te chamar'), findsOneWidget);
      expect(find.text('Digite um e-mail válido'), findsOneWidget);
      expect(
        find.text('A senha precisa de pelo menos 6 caracteres'),
        findsOneWidget,
      );
    });

    testWidgets('"Entrar" abre o login, que alterna pro cadastro', (
      WidgetTester tester,
    ) async {
      await pumpAuth(tester);

      await tester.tap(find.text('Entrar'));
      await tester.pumpAndSettle();

      expect(find.widgetWithText(ElevatedButton, 'Entrar'), findsOneWidget);
      expect(find.text('Como você quer ser chamada?'), findsNothing);

      final alternar = find.text('Não tem conta? Cadastre-se');
      await tester.ensureVisible(alternar);
      await tester.tap(alternar);
      await tester.pumpAndSettle();

      expect(find.text('Criar conta'), findsOneWidget);
    });
  });
}
