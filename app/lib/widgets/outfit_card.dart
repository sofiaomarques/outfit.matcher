import 'package:flutter/material.dart';

import '../models/outfit.dart';
import '../theme/app_colors.dart';
import 'garment_thumbnail.dart';
import 'star_shape.dart';

/// Card de um look: colagem das peças que o compõem, com favoritar
/// e "salvar" (estrela), igual aos cards de "Seus looks" no mockup.
class OutfitCard extends StatelessWidget {
  const OutfitCard({
    super.key,
    required this.outfit,
    required this.isFavorite,
    required this.onFavoriteToggle,
    this.onSave,
    this.onTap,
  });

  final Outfit outfit;
  final bool isFavorite;
  final VoidCallback onFavoriteToggle;
  final VoidCallback? onSave;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.only(right: 4),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final item in outfit.items)
                      GarmentThumbnail(item: item, size: 76),
                  ],
                ),
              ),
              Positioned(
                top: 0,
                right: 0,
                child: InkWell(
                  onTap: onFavoriteToggle,
                  borderRadius: BorderRadius.circular(20),
                  child: Icon(
                    isFavorite ? Icons.favorite : Icons.favorite_border,
                    size: 20,
                    color: AppColors.wine,
                  ),
                ),
              ),
              if (onSave != null)
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: InkWell(
                    onTap: onSave,
                    borderRadius: BorderRadius.circular(20),
                    child: const StarShape(size: 20, color: AppColors.wine),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
