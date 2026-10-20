import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:outfit_matcher/models/clothing_category.dart';
import 'package:outfit_matcher/models/clothing_item.dart';
import 'package:outfit_matcher/repositories/wardrobe_repository.dart';
import 'package:outfit_matcher/screens/add_item_screen.dart';
import 'package:outfit_matcher/services/garment_analysis_service.dart';
import 'package:outfit_matcher/theme/app_theme.dart';

// PNG de 1x1 pixel.
final _foto = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
);

/// Análise que só termina quando o teste manda (`analysis` é a da última
/// foto); o recorte sempre falha (a tela fica com a foto original).
class _FakeAnalysis extends GarmentAnalysisService {
  final _analyses = <Completer<Map<String, dynamic>>>[];
  Completer<Map<String, dynamic>> get analysis => _analyses.last;

  @override
  Future<Map<String, dynamic>> analisarPeca(Uint8List imageBytes) {
    _analyses.add(Completer());
    return analysis.future;
  }

  @override
  Future<Uint8List> recortarPeca(Uint8List imageBytes) =>
      Future.error(Exception('sem recorte'));
}

class _FakeRepository implements WardrobeRepository {
  ClothingCategory? savedCategory;
  Map<String, dynamic>? savedFeatures;

  @override
  Future<ClothingItem> addItem({
    required String name,
    required ClothingCategory category,
    required Uint8List imageBytes,
    required Color swatch,
    Map<String, dynamic>? features,
  }) async {
    savedCategory = category;
    savedFeatures = features;
    return ClothingItem(
      id: '1',
      name: name,
      category: category,
      swatch: swatch,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Map<String, dynamic> _features(int codigo, String categoria) => {
  'cor_principal': [10, 20, 30],
  'categoria': categoria,
  'categoria_codigo': codigo,
};

void main() {
  test('categoria_codigo vira o chip do app', () {
    expect(ClothingCategory.fromDetectedCode(1), ClothingCategory.bottom);
    expect(ClothingCategory.fromDetectedCode(2), ClothingCategory.bottom);
    expect(ClothingCategory.fromDetectedCode(3), ClothingCategory.skirt);
    expect(ClothingCategory.fromDetectedCode(4), ClothingCategory.dress);
    for (final codigo in [5, 6, 7, 8, 9, 10]) {
      expect(ClothingCategory.fromDetectedCode(codigo), ClothingCategory.top);
    }
    expect(ClothingCategory.fromDetectedCode(0), isNull);
    expect(ClothingCategory.fromDetectedCode(11), isNull);
    expect(ClothingCategory.fromDetectedCode(null), isNull);
    expect(detectedCategory(null), isNull);
    expect(detectedCategory({'categoria_codigo': 1}), isNull);
  });

  group('AddItemScreen', () {
    late _FakeAnalysis analysis;
    late _FakeRepository repository;

    Future<void> pumpScreen(WidgetTester tester) async {
      analysis = _FakeAnalysis();
      repository = _FakeRepository();
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: AddItemScreen(
            repository: repository,
            analysisService: analysis,
            pickImage: (_) async => _foto,
          ),
        ),
      );
    }

    Future<void> pickPhoto(WidgetTester tester) async {
      // Com foto, toca na própria foto (troca).
      final area = find.byType(AspectRatio).first;
      await tester.ensureVisible(area);
      await tester.tap(area);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Escolher da galeria'));
      await tester.pumpAndSettle();
    }

    bool selected(WidgetTester tester, ClothingCategory category) => tester
        .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, category.label))
        .selected;

    Future<void> choose(WidgetTester tester, ClothingCategory category) async {
      final chip = find.widgetWithText(ChoiceChip, category.label);
      await tester.ensureVisible(chip);
      await tester.tap(chip);
    }

    Future<void> save(WidgetTester tester) async {
      await tester.enterText(find.byType(TextField), 'Calça jeans');
      final salvar = find.widgetWithText(ElevatedButton, 'Salvar');
      await tester.ensureVisible(salvar);
      await tester.tap(salvar);
      await tester.pumpAndSettle();
    }

    testWidgets('a categoria detectada já vem marcada e é registrada', (
      tester,
    ) async {
      await pumpScreen(tester);
      await pickPhoto(tester);
      expect(find.text('Detectando a categoria...'), findsOneWidget);
      expect(
        ClothingCategory.values.where((c) => selected(tester, c)),
        isEmpty,
      );

      analysis.analysis.complete(_features(1, 'calça'));
      await tester.pumpAndSettle();

      expect(selected(tester, ClothingCategory.bottom), isTrue);
      expect(
        find.text('Detectamos: Calça. Confere? Se não, toque na certa.'),
        findsOneWidget,
      );

      await save(tester);
      expect(repository.savedCategory, ClothingCategory.bottom);
      expect(repository.savedFeatures?['categoria_sugerida'], 'bottom');
      expect(repository.savedFeatures?['categoria_codigo'], 1);
    });

    testWidgets('a correção da usuária vale e a sugestão fica registrada', (
      tester,
    ) async {
      await pumpScreen(tester);
      await pickPhoto(tester);
      analysis.analysis.complete(_features(1, 'calça'));
      await tester.pumpAndSettle();

      await choose(tester, ClothingCategory.skirt);
      await tester.pump();
      expect(selected(tester, ClothingCategory.skirt), isTrue);
      expect(find.text('Detectamos: Calça.'), findsOneWidget);

      await save(tester);
      expect(repository.savedCategory, ClothingCategory.skirt);
      expect(repository.savedFeatures?['categoria_sugerida'], 'bottom');
    });

    testWidgets('escolha feita antes da análise não é trocada', (tester) async {
      await pumpScreen(tester);
      await pickPhoto(tester);
      await choose(tester, ClothingCategory.dress);
      await tester.pump();

      analysis.analysis.complete(_features(6, 'camiseta'));
      await tester.pumpAndSettle();

      expect(selected(tester, ClothingCategory.dress), isTrue);
      expect(find.text('Detectamos: Camiseta.'), findsOneWidget);
    });

    testWidgets('sem análise, pede a categoria antes de salvar', (
      tester,
    ) async {
      await pumpScreen(tester);
      await pickPhoto(tester);
      analysis.analysis.completeError(Exception('API fora'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Detectamos'), findsNothing);
      expect(find.text('Detectando a categoria...'), findsNothing);

      await save(tester);
      expect(find.text('Escolha a categoria da peça.'), findsOneWidget);
      expect(repository.savedCategory, isNull);

      await choose(tester, ClothingCategory.top);
      await save(tester);
      expect(repository.savedCategory, ClothingCategory.top);
      expect(repository.savedFeatures, isNull);
    });

    testWidgets('salvar antes da detecção espera a análise', (tester) async {
      await pumpScreen(tester);
      await pickPhoto(tester);

      await tester.enterText(find.byType(TextField), 'Calça jeans');
      final salvar = find.widgetWithText(ElevatedButton, 'Salvar');
      await tester.ensureVisible(salvar);
      await tester.tap(salvar);
      await tester.pump();
      expect(find.text('Escolha a categoria da peça.'), findsNothing);
      expect(repository.savedCategory, isNull);

      analysis.analysis.complete(_features(1, 'calça'));
      await tester.pumpAndSettle();

      expect(repository.savedCategory, ClothingCategory.bottom);
      expect(repository.savedFeatures?['categoria_sugerida'], 'bottom');
    });

    testWidgets('trocar a foto descarta a categoria da anterior', (
      tester,
    ) async {
      await pumpScreen(tester);
      await pickPhoto(tester);
      analysis.analysis.complete(_features(1, 'calça'));
      await tester.pumpAndSettle();
      await choose(tester, ClothingCategory.skirt);
      await tester.pump();

      await pickPhoto(tester);
      expect(
        ClothingCategory.values.where((c) => selected(tester, c)),
        isEmpty,
      );

      analysis.analysis.complete(_features(4, 'vestido'));
      await tester.pumpAndSettle();
      expect(selected(tester, ClothingCategory.dress), isTrue);
    });
  });
}
