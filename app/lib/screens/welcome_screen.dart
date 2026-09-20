import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../widgets/gingham_background.dart';
import '../widgets/leopard_star.dart';
import '../widgets/painted_cherries.dart';
import '../widgets/painted_heart.dart';
import '../widgets/star_shape.dart';

/// Primeira tela do app: apresentação + call-to-action pra começar,
/// igual ao mockup.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key, required this.onStart});

  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: GinghamBackground(
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, outerConstraints) {
              // Nas larguras estreitas (celular) as estrelas decorativas
              // fixas colidiriam com o texto, então só aparecem a partir
              // daqui.
              final showDecorations = outerConstraints.maxWidth >= 700;

              return Stack(
                children: [
                  if (showDecorations) ...[
                    const Positioned(
                      top: 40,
                      right: 24,
                      child: StarShape(
                        size: 90,
                        color: AppColors.wine,
                        rotation: -0.2,
                      ),
                    ),
                    const Positioned(
                      top: 130,
                      right: 90,
                      child: LeopardStar(size: 56, rotation: 0.3),
                    ),
                    const Positioned(
                      bottom: 190,
                      right: 150,
                      child: PaintedCherries(size: 44, rotation: -0.2),
                    ),
                    const Positioned(
                      bottom: 60,
                      right: 140,
                      child: LeopardStar(size: 64, rotation: -0.15),
                    ),
                    const Positioned(
                      bottom: 70,
                      right: 40,
                      child: PaintedHeart(size: 40, rotation: 0.25),
                    ),
                  ],
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 28,
                      vertical: 20,
                    ),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        return SingleChildScrollView(
                          child: ConstrainedBox(
                            constraints: BoxConstraints(
                              minHeight: constraints.maxHeight,
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                _TopBar(onStart: onStart),
                                const SizedBox(height: 48),
                                _Hero(onStart: onStart),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.onStart});

  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const StarShape(size: 24, color: AppColors.wine),
        const SizedBox(width: 8),
        Text(
          'Wable',
          style: Theme.of(
            context,
          ).textTheme.headlineMedium?.copyWith(fontSize: 20, height: 1),
        ),
        const Spacer(),
        TextButton(
          onPressed: onStart,
          child: const Text(
            'Entrar',
            style: TextStyle(color: AppColors.wine, fontWeight: FontWeight.w600),
          ),
        ),
        const SizedBox(width: 8),
        ElevatedButton(onPressed: onStart, child: const Text('Cadastrar')),
      ],
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.onStart});

  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 480),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Seu guarda-roupa,\nmais inteligente.',
            style: Theme.of(context).textTheme.displayLarge,
          ),
          const SizedBox(height: 20),
          Text(
            'Combine suas peças, descubra novos looks e '
            'aproveite o que você já tem.',
            style: Theme.of(
              context,
            ).textTheme.bodyLarge?.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: 28),
          ElevatedButton.icon(
            onPressed: onStart,
            icon: const Icon(Icons.arrow_forward),
            label: const Text('Começar'),
          ),
        ],
      ),
    );
  }
}
