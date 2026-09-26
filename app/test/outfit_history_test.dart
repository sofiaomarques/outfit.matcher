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
  bool fail = false;
  final added = <List<String>>[];
  final removed = <List<String>>[];
  final worn = <(List<String>, DateTime)>[];

  void _maybeFail() {
    if (fail) throw Exception('offline');
  }

  @override
  Future<List<List<String>>> fetchFavorites() async => favorites;

  @override
  Future<List<(List<String>, DateTime)>> fetchWears({
    required DateTime since,
  }) async => wears;

  @override
  Future<void> addFavorite(List<String> itemIds) async {
    _maybeFail();
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
