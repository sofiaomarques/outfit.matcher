import 'clothing_item.dart';

/// Um look sugerido, equivalente ao dicionario `{"pecas": [...], "score": ...}`
/// retornado por `model/gerar_outfit.py`, com metadados extras para a UI.
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
}
