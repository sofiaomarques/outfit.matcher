import 'package:flutter/material.dart';

import 'clothing_category.dart';

/// Uma peça do guarda-roupa. Peças vindas do Supabase (ver
/// WardrobeRepository) trazem [imageUrl] preenchida; [imagePath] é só pra
/// assets embutidos no app. Sem nenhuma das duas, a peça é representada
/// por um placeholder colorido no estilo catálogo. Ate a integracao com o
/// pipeline em Python (model/gerar_outfit.py), a cor de placeholder não
/// reflete a cor real da foto.
class ClothingItem {
  const ClothingItem({
    required this.id,
    required this.name,
    required this.category,
    required this.swatch,
    this.imagePath,
    this.imageUrl,
    this.isFavorite = false,
  });

  final String id;
  final String name;
  final ClothingCategory category;

  /// Cor dominante da peça, usada no placeholder e na paleta do look.
  final Color swatch;

  /// Asset embutido no app (dados fake).
  final String? imagePath;

  /// URL (assinada) da foto no Supabase Storage.
  final String? imageUrl;
  final bool isFavorite;
}
