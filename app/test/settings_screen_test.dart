import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:outfit_matcher/repositories/account_repository.dart';
import 'package:outfit_matcher/screens/settings_screen.dart';
import 'package:outfit_matcher/theme/app_theme.dart';

/// Conta em memória no lugar do Supabase.
class _FakeAccount implements AccountRepository {
  @override
  String? email = 'ana@exemplo.com';
  bool fail = false;
  int signOuts = 0;
  int erases = 0;

  @override
  Future<void> signOut() async {
    if (fail) throw Exception('offline');
    signOuts++;
  }

  @override
  Future<void> eraseMyData() async {
    if (fail) throw Exception('offline');
    erases++;
  }
}

void main() {
  late _FakeAccount account;
  late int erasedCallbacks;

  setUp(() {
    account = _FakeAccount();
    erasedCallbacks = 0;
  });

  Future<void> pumpSettings(
    WidgetTester tester, {
    String feedbackLink = '',
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: SettingsScreen(
            repository: account,
            feedbackLink: feedbackLink,
            onDataErased: () => erasedCallbacks++,
          ),
        ),
      ),
    );
  }

  Future<void> tapErase(WidgetTester tester) async {
    await tester.tap(find.text('Apagar meus dados'));
    await tester.pumpAndSettle();
  }

  testWidgets('mostra a conta logada e a versão, sem feedback sem link', (
    tester,
  ) async {
    await pumpSettings(tester);

    expect(find.text('ana@exemplo.com'), findsOneWidget);
    expect(find.text('Versão $appVersion'), findsOneWidget);
    expect(find.text('Mandar feedback'), findsNothing);
  });

  testWidgets('com link de feedback, mostra a opção', (tester) async {
    await pumpSettings(tester, feedbackLink: 'https://exemplo.com/form');

    expect(find.text('Mandar feedback'), findsOneWidget);
  });

  testWidgets('"Sair" desloga; se falhar, avisa', (tester) async {
    await pumpSettings(tester);

    await tester.tap(find.text('Sair'));
    await tester.pump();
    expect(account.signOuts, 1);

    account.fail = true;
    await tester.tap(find.text('Sair'));
    await tester.pump();
    expect(find.text('Não foi possível sair. Tente de novo.'), findsOneWidget);
  });

  testWidgets('cancelar a confirmação não apaga nada', (tester) async {
    await pumpSettings(tester);

    await tapErase(tester);
    expect(find.text('Apagar meus dados?'), findsOneWidget);
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();

    expect(account.erases, 0);
    expect(erasedCallbacks, 0);
  });

  testWidgets('confirmar apaga e avisa as outras telas', (tester) async {
    await pumpSettings(tester);

    await tapErase(tester);
    await tester.tap(find.text('Apagar tudo'));
    await tester.pumpAndSettle();

    expect(account.erases, 1);
    expect(erasedCallbacks, 1);
    expect(
      find.text('Pronto: seus dados e fotos foram apagados.'),
      findsOneWidget,
    );
  });

  testWidgets('se apagar falhar, avisa e não recarrega as telas', (
    tester,
  ) async {
    account.fail = true;
    await pumpSettings(tester);

    await tapErase(tester);
    await tester.tap(find.text('Apagar tudo'));
    await tester.pumpAndSettle();

    expect(erasedCallbacks, 0);
    expect(
      find.textContaining('Não foi possível apagar tudo.'),
      findsOneWidget,
    );
    // O botão volta a funcionar pra tentar de novo.
    expect(find.text('Apagar meus dados'), findsOneWidget);
  });

  group('removeAllFiles', () {
    test('apaga em lotes até a pasta ficar vazia', () async {
      final files = [for (var i = 0; i < 250; i++) 'u/$i.jpg'];
      final batches = <int>[];

      await removeAllFiles(
        list: () async => files.take(100).toList(),
        remove: (paths) async {
          batches.add(paths.length);
          files.removeWhere(paths.contains);
          return paths.length;
        },
      );

      expect(files, isEmpty);
      expect(batches, [100, 100, 50]);
    });

    test('lança quando o Storage não apaga nada (RLS recusou)', () async {
      await expectLater(
        removeAllFiles(list: () async => ['u/1.jpg'], remove: (_) async => 0),
        throwsStateError,
      );
    });
  });
}
