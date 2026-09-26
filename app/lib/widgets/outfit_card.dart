import 'package:flutter/material.dart';

import '../models/outfit.dart';
import '../theme/app_colors.dart';
import 'garment_thumbnail.dart';

/// Card de um look: colagem das peças que o compõem, com favoritar,
/// igual aos cards de "Seus looks" no mockup.
///
/// As miniaturas ficam numa única linha e se redimensionam pro espaço
/// disponível, então o card nunca estoura mesmo com poucas colunas.
class OutfitCard extends StatelessWidget {
  const OutfitCard({
    super.key,
    required this.outfit,
    required this.isFavorite,
    required this.onFavoriteToggle,
    this.onTap,
  });

  final Outfit outfit;
  final bool isFavorite;
  final VoidCallback onFavoriteToggle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              InkWell(
                onTap: onFavoriteToggle,
                borderRadius: BorderRadius.circular(20),
                child: Icon(
                  isFavorite ? Icons.favorite : Icons.favorite_border,
                  size: 20,
                  color: AppColors.wine,
                ),
              ),
              const SizedBox(height: 4),
              Expanded(
                child: Row(
                  children: [
                    for (final item in outfit.items)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 3),
                          child: AspectRatio(
                            aspectRatio: 1,
                            child: GarmentThumbnail(item: item),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
