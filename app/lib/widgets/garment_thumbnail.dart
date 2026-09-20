import 'package:flutter/material.dart';

import '../models/clothing_item.dart';
import '../theme/app_colors.dart';

/// Miniatura de uma peça no estilo "foto de catálogo" (isolada, sem
/// modelo vestindo). Enquanto não há fotos reais, usa um placeholder
/// colorido com o ícone da categoria — o [ClothingItem.imagePath], quando
/// existir, deve substituir esse placeholder por uma imagem real.
class GarmentThumbnail extends StatelessWidget {
  const GarmentThumbnail({super.key, required this.item, this.size});

  final ClothingItem item;
  final double? size;

  @override
  Widget build(BuildContext context) {
    final content = item.imagePath == null
        ? _Placeholder(item: item)
        : ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Image.asset(item.imagePath!, fit: BoxFit.cover),
          );

    if (size == null) return content;
    return SizedBox(width: size, height: size, child: content);
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.item});

  final ClothingItem item;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: item.swatch.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: item.swatch.withValues(alpha: 0.5)),
      ),
      child: Center(
        child: Icon(item.category.icon, size: 36, color: AppColors.wine),
      ),
    );
  }
}
