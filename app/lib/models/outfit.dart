import 'clothing_item.dart';

/// Um look sugerido, equivalente ao dicionario `{"pecas": [...], "score": ...}`
/// retornado por `/looks/recommend` (`model/recomendar.py`), com metadados
/// extras para a UI.
class Outfit {
  const Outfit({
    required this.id,
    required this.items,
    required this.tags,
    this.score = 1.0,
    this.isFavorite = false,
  });

  final String id;
  final List<ClothingItem> items;
  final List<String> tags;
  final double score;
  final bool isFavorite;

  /// Ids das peças em ordem crescente: o mesmo look vira sempre a mesma
  /// lista, não importa a ordem em que o recomendador devolveu as peças.
  /// É assim que ele fica salvo em `outfit_favorites` / `outfit_wears`.
  List<String> get itemIds => sortedIds([for (final item in items) item.id]);

  /// Identidade do look (favoritos, histórico de uso).
  String get key => keyFor(itemIds);

  static List<String> sortedIds(Iterable<String> ids) => ids.toList()..sort();

  static String keyFor(Iterable<String> ids) => sortedIds(ids).join('+');
}
