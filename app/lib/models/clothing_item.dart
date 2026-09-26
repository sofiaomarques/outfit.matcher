import 'package:flutter/material.dart';

import 'clothing_category.dart';

/// Uma peça do guarda-roupa. Peças vindas do Supabase (ver
/// WardrobeRepository) trazem [imageUrl] preenchida; [imagePath] é só pra
/// assets embutidos no app. Sem nenhuma das duas, a peça é representada
/// por um placeholder colorido no estilo catálogo.
class ClothingItem {
  const ClothingItem({
    required this.id,
    required this.name,
    required this.category,
    required this.swatch,
    this.imagePath,
    this.imageUrl,
    this.storagePath,
    this.isFavorite = false,
    this.features,
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

  /// Caminho da foto dentro do bucket `clothing-images` do Supabase.
  final String? storagePath;
  final bool isFavorite;

  /// Saída de `/items/analyze` (cor, categoria detectada, formalidade,
  /// embedding...). Nula enquanto a peça não foi analisada — o
  /// recomendador ignora peças sem features.
  final Map<String, dynamic>? features;

  ClothingItem copyWith({bool? isFavorite, Map<String, dynamic>? features}) {
    return ClothingItem(
      id: id,
      name: name,
      category: category,
      swatch: swatch,
      imagePath: imagePath,
      imageUrl: imageUrl,
      storagePath: storagePath,
      isFavorite: isFavorite ?? this.isFavorite,
      features: features ?? this.features,
    );
  }
}
