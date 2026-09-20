import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../widgets/star_shape.dart';

/// Placeholder para seções do menu que ainda não foram desenhadas no
/// mockup (Favoritos, Configurações).
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({super.key, required this.title, this.icon});

  final String title;

  /// Ícone decorativo. Se omitido, usa a estrela padrão.
  final Widget? icon;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            icon ??
                const StarShape(
                  size: 48,
                  color: AppColors.pink,
                  filled: false,
                  strokeWidth: 4,
                ),
            const SizedBox(height: 16),
            Text(title, style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            Text(
              'Essa tela ainda não foi desenhada.',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: AppColors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}
