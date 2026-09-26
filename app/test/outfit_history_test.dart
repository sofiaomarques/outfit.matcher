import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:outfit_matcher/models/clothing_category.dart';
import 'package:outfit_matcher/models/clothing_item.dart';
import 'package:outfit_matcher/models/outfit.dart';
import 'package:outfit_matcher/repositories/outfit_history_repository.dart';
import 'package:outfit_matcher/services/outfit_history.dart';

/// Repositório em memória no lugar do Supabase.
class _FakeRepository implements OutfitHistoryRepository {
  List<List<String>> favorites = [];
  List<(List<String>, DateTime)> wears = [];
  List<(List<String>, String?)> rejections = [];
  bool fail = false;
  bool failFetchRejections = false;
  // Falha só pra esses looks (ids juntados com '+').
  final failFor = <String>{};
  final added = <List<String>>[];
  final removed = <List<String>>[];
  final worn = <(List<String>, DateTime)>[];
  final rejected = <(List<String>, String?)>[];
  final unrejected = <(List<String>, String?)>[];

  void _maybeFail([List<String>? itemIds]) {
    if (fail) throw Exception('offline');
    if (itemIds != null && failFor.contains(itemIds.join('+'))) {
      throw Exception('recusado');
    }
  }

  @override
  Future<List<List<String>>> fetchFavorites() async => favorites;

  @override
  Future<List<(List<String>, DateTime)>> fetchWears({
    required DateTime since,
  }) async => wears;

  @override
  Future<List<(List<String>, String?)>> fetchRejections() async {
    if (failFetchRejections) throw Exception('tabela não existe');
    return rejections;
  }

  @override
  Future<void> addRejection(List<String> itemIds, String? occasion) async {
    _maybeFail(itemIds);
    rejected.add((itemIds, occasion));
  }

  @override
  Future<void> removeRejection(List<String> itemIds, String? occasion) async {
    _maybeFail(itemIds);
    unrejected.add((itemIds, occasion));
  }

  @override
  Future<void> addFavorite(List<String> itemIds) async {
    // Deixa outros toques acontecerem antes de responder, como na rede.
    await Future<void>.delayed(Duration.zero);
    _maybeFail(itemIds);
    added.add(itemIds);
  }

  @override
  Future<void> removeFavorite(List<String> itemIds) async {
    _maybeFail();
    removed.add(itemIds);
  }

  @override
  Future<void> addWear(List<String> itemIds, DateTime day) async {
    _maybeFail();
    worn.add((itemIds, day));
  }
}

ClothingItem _item(String id, ClothingCategory category) =>
    ClothingItem(id: id, name: id, category: category, swatch: Colors.black);

Outfit _outfit(List<ClothingItem> items) =>
    Outfit(id: items.map((i) => i.id).join('+'), items: items, tags: const []);

void main() {
  final blusa = _item('b-blusa', ClothingCategory.top);
  final calca = _item('a-calca', ClothingCategory.bottom);
  final saia = _item('c-saia', ClothingCategory.skirt);

  test('o mesmo look é o mesmo, em qualquer ordem das peças', () {
    expect(_outfit([blusa, calca]).key, _outfit([calca, blusa]).key);
    expect(_outfit([blusa, calca]).itemIds, ['a-calca', 'b-blusa']);
    expect(_outfit([blusa, calca]).key, isNot(_outfit([blusa, saia]).key));
  });

  test('carrega favoritos e o último uso de cada look', () async {
    final repo = _FakeRepository()
      ..favorites = [
        ['a-calca', 'b-blusa'],
      ]
      ..wears = [
        (['a-calca', 'b-blusa'], DateTime(2026, 9, 20)),
        (['a-calca', 'b-blusa'], DateTime(2026, 9, 1)),
      ];
    final history = OutfitHistory(repository: repo);

    await history.load(now: DateTime(2026, 9, 26));

    expect(history.isFavorite(_outfit([blusa, calca])), isTrue);
    expect(history.isFavorite(_outfit([blusa, saia])), isFalse);
    expect(history.lastWorn(_outfit([calca, blusa])), DateTime(2026, 9, 20));
  });

  test('favoritar e desfavoritar salvam no repositório', () async {
    final repo = _FakeRepository();
    final history = OutfitHistory(repository: repo);
    final look = _outfit([blusa, calca]);

    expect(await history.toggleFavorite(look), isTrue);
    expect(history.isFavorite(look), isTrue);
    expect(history.favorites.first, ['a-calca', 'b-blusa']);
    expect(repo.added, [
      ['a-calca', 'b-blusa'],
    ]);

    expect(await history.toggleFavorite(look), isTrue);
    expect(history.isFavorite(look), isFalse);
    expect(repo.removed, [
      ['a-calca', 'b-blusa'],
    ]);
  });

  test('se o Supabase recusa, o favorito é desfeito', () async {
    final repo = _FakeRepository()..fail = true;
    final history = OutfitHistory(repository: repo);
    final look = _outfit([blusa, calca]);
    var notifications = 0;
    history.addListener(() => notifications++);

    expect(await history.toggleFavorite(look), isFalse);
    expect(history.isFavorite(look), isFalse);
    expect(notifications, 2); // aparece na hora, depois some
  });

  test('marcar como usado guarda o dia local, sem hora', () async {
    final repo = _FakeRepository();
    final history = OutfitHistory(repository: repo);
    final look = _outfit([blusa, calca]);

    expect(
      await history.markWorn(look, now: DateTime(2026, 9, 26, 23, 50)),
      isTrue,
    );
    expect(history.lastWorn(look), DateTime(2026, 9, 26));
    expect(repo.worn.single.$2, DateTime(2026, 9, 26));

    repo.fail = true;
    expect(await history.markWorn(look, now: DateTime(2026, 9, 27)), isFalse);
    expect(history.lastWorn(look), DateTime(2026, 9, 26));
  });

  test(
    'falha de um favorito não desfaz outro favoritado ao mesmo tempo',
    () async {
      final repo = _FakeRepository()..failFor.add('b-blusa+c-saia');
      final history = OutfitHistory(repository: repo);
      final recusado = _outfit([blusa, saia]);
      final aceito = _outfit([blusa, calca]);

      final results = await Future.wait([
        history.toggleFavorite(recusado),
        history.toggleFavorite(aceito),
      ]);

      expect(results, [isFalse, isTrue]);
      expect(history.isFavorite(recusado), isFalse);
      expect(history.isFavorite(aceito), isTrue);
    },
  );

  test(
    'rejeição vale só na ocasião em que foi dada, e dá pra desfazer',
    () async {
      final repo = _FakeRepository();
      final history = OutfitHistory(repository: repo);
      final look = _outfit([blusa, calca]);

      expect(await history.reject(look, occasion: 'trabalho'), isTrue);
      expect(history.isRejected(look, occasion: 'trabalho'), isTrue);
      expect(history.isRejected(look, occasion: 'casual'), isFalse);
      expect(repo.rejected.single.$1, ['a-calca', 'b-blusa']);
      expect(repo.rejected.single.$2, 'trabalho');

      expect(await history.undoReject(look, occasion: 'trabalho'), isTrue);
      expect(history.isRejected(look, occasion: 'trabalho'), isFalse);
      expect(repo.unrejected.single.$2, 'trabalho');
    },
  );

  test('se o Supabase recusa, a rejeição é desfeita', () async {
    final repo = _FakeRepository()..fail = true;
    final history = OutfitHistory(repository: repo);
    final look = _outfit([blusa, calca]);

    expect(await history.reject(look, occasion: 'festa'), isFalse);
    expect(history.isRejected(look, occasion: 'festa'), isFalse);
  });

  test('carrega rejeições e usos pro recomendador', () async {
    final repo = _FakeRepository()
      ..rejections = [
        (['a-calca', 'b-blusa'], 'trabalho'),
      ]
      ..wears = [
        (['a-calca', 'b-blusa'], DateTime(2026, 9, 24)),
      ];
    final history = OutfitHistory(repository: repo);

    await history.load(now: DateTime(2026, 9, 26));

    expect(
      history.isRejected(_outfit([calca, blusa]), occasion: 'trabalho'),
      isTrue,
    );
    final (ids, day) = history.wornLooks.single;
    expect(ids, ['a-calca', 'b-blusa']);
    expect(day, DateTime(2026, 9, 24));
  });

  test('sem a tabela de rejeições, favoritos continuam carregando', () async {
    final repo = _FakeRepository()
      ..failFetchRejections = true
      ..favorites = [
        ['a-calca', 'b-blusa'],
      ];
    final history = OutfitHistory(repository: repo);

    await history.load(now: DateTime(2026, 9, 26));

    expect(history.isFavorite(_outfit([blusa, calca])), isTrue);
    expect(history.rejections, isEmpty);
  });

  test('descreve há quanto tempo o look foi usado', () {
    final now = DateTime(2026, 9, 26, 15);
    expect(describeLastWorn(DateTime(2026, 9, 26), now: now), 'Usado hoje');
    expect(describeLastWorn(DateTime(2026, 9, 25), now: now), 'Usado ontem');
    expect(
      describeLastWorn(DateTime(2026, 9, 19), now: now),
      'Usado há 7 dias',
    );
  });
}
