import 'package:flutter/material.dart';

import '../models/outfit.dart';
import '../theme/app_colors.dart';
import '../widgets/garment_thumbnail.dart';
import '../widgets/star_shape.dart';

/// Tela de detalhe de um look ("Look do dia" no mockup): colagem maior
/// das peças, tags e paleta de cores, com opção de salvar.
class OutfitDetailScreen extends StatefulWidget {
  const OutfitDetailScreen({super.key, required this.outfit, this.title});

  final Outfit outfit;
  final String? title;

  @override
  State<OutfitDetailScreen> createState() => _OutfitDetailScreenState();
}

class _OutfitDetailScreenState extends State<OutfitDetailScreen> {
  bool _saved = false;

  @override
  Widget build(BuildContext context) {
    final outfit = widget.outfit;
    final palette = [
      for (final item in outfit.items) item.swatch,
    ];

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.arrow_back, color: AppColors.wine),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Voltar',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: AppColors.wine,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth >= 640;
                    final collage = _Collage(outfit: outfit);
                    final info = _DetailInfo(
                      title: widget.title ?? 'Look do dia',
                      tags: outfit.tags,
                      palette: palette,
                      saved: _saved,
                      onSave: () => setState(() => _saved = true),
                    );

                    if (isWide) {
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(flex: 5, child: collage),
                          const SizedBox(width: 32),
                          Expanded(flex: 4, child: info),
                        ],
                      );
                    }

                    return SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(height: 320, child: collage),
                          const SizedBox(height: 24),
                          info,
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Collage extends StatelessWidget {
  const _Collage({required this.outfit});

  final Outfit outfit;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.pinkPale,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Wrap(
            alignment: WrapAlignment.center,
            spacing: 16,
            runSpacing: 16,
            children: [
              for (final item in outfit.items)
                GarmentThumbnail(item: item, size: 140),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailInfo extends StatelessWidget {
  const _DetailInfo({
    required this.title,
    required this.tags,
    required this.palette,
    required this.saved,
    required this.onSave,
  });

  final String title;
  final List<String> tags;
  final List<Color> palette;
  final bool saved;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const StarShape(size: 22, color: AppColors.wine),
            const SizedBox(width: 8),
            Text(title, style: Theme.of(context).textTheme.headlineMedium),
          ],
        ),
        const SizedBox(height: 20),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [for (final tag in tags) _TagChip(label: tag)],
        ),
        const SizedBox(height: 24),
        Text('Paleta de cores', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        Row(
          children: [
            for (final color in palette)
              Padding(
                padding: const EdgeInsets.only(right: 10),
                child: CircleAvatar(radius: 16, backgroundColor: color),
              ),
          ],
        ),
        const SizedBox(height: 32),
        ElevatedButton.icon(
          onPressed: saved ? null : onSave,
          icon: Icon(saved ? Icons.favorite : Icons.favorite_border),
          label: Text(saved ? 'Look salvo' : 'Salvar look'),
        ),
      ],
    );
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.pinkLight,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.bodyMedium?.copyWith(color: AppColors.wine),
      ),
    );
  }
}
