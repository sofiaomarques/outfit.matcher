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
                    // Pilha de adesivos no canto superior direito.
                    const Positioned(
                      top: 36,
                      right: 28,
                      child: StarShape(
                        size: 84,
                        color: AppColors.wine,
                        rotation: -0.15,
                      ),
                    ),
                    const Positioned(
                      top: 106,
                      right: 108,
                      child: LeopardStar(size: 50, rotation: 0.35),
                    ),
                    const Positioned(
                      top: 152,
                      right: 60,
                      child: PaintedCherries(size: 38, rotation: -0.1),
                    ),
                    // Pilha de adesivos no canto inferior direito.
                    const Positioned(
                      bottom: 56,
                      right: 118,
                      child: LeopardStar(size: 60, rotation: -0.2),
                    ),
                    const Positioned(
                      bottom: 48,
                      right: 36,
                      child: PaintedHeart(size: 38, rotation: 0.2),
                    ),
                  ],
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 28,
                      vertical: 20,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _TopBar(onStart: onStart),
                        Expanded(
                          child: LayoutBuilder(
                            builder: (context, constraints) {
                              return SingleChildScrollView(
                                child: ConstrainedBox(
                                  constraints: BoxConstraints(
                                    minHeight: constraints.maxHeight,
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [_Hero(onStart: onStart)],
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ],
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
