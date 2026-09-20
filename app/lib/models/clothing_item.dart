import 'package:flutter/material.dart';

import 'clothing_category.dart';

/// Uma peça do guarda-roupa. Ate a integracao com o pipeline em Python
/// (model/gerar_outfit.py), [imagePath] fica nulo e a peca e representada
/// por um placeholder colorido no estilo catalogo.
class ClothingItem {
  const ClothingItem({
    required this.id,
    required this.name,
    required this.category,
    required this.swatch,
    this.imagePath,
    this.isFavorite = false,
  });

  final String id;
  final String name;
  final ClothingCategory category;

  /// Cor dominante da peça, usada no placeholder e na paleta do look.
  final Color swatch;
  final String? imagePath;
  final bool isFavorite;
}
