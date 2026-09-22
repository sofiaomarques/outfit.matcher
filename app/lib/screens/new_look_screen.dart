import 'package:flutter/material.dart';

import '../data/mock_wardrobe.dart';
import '../models/outfit.dart';
import '../services/current_user.dart';
import '../theme/app_colors.dart';
import '../widgets/outfit_card.dart';
import 'outfit_detail_screen.dart';

const List<String> _occasions = [
  'Casual',
  'Trabalho',
  'Festa',
  'Encontro',
  'Dia a dia',
];

/// Tela "Novo look": saudação personalizada com o nome escolhido no
/// cadastro, seguida de uma sugestão de look pra ocasião selecionada.
/// A sugestão ainda vem de `MockWardrobe.outfits` — sem o pipeline real
/// conectado, tenta casar a ocasião com as tags dos looks fake e, sem
/// match, cai pro look de maior score.
class NewLookScreen extends StatefulWidget {
  const NewLookScreen({super.key});

  @override
  State<NewLookScreen> createState() => _NewLookScreenState();
}

class _NewLookScreenState extends State<NewLookScreen> {
  String? _selectedOccasion;
  bool _isFavorite = false;

  Outfit? get _suggestion {
    final occasion = _selectedOccasion;
    if (occasion == null) return null;

    final matches = MockWardrobe.outfits
        .where((outfit) => outfit.tags.contains(occasion))
        .toList();
    final pool = matches.isNotEmpty ? matches : MockWardrobe.outfits;
    return pool.reduce((a, b) => b.score > a.score ? b : a);
  }

  void _selectOccasion(String occasion) {
    setState(() {
      _selectedOccasion = occasion;
      _isFavorite = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final name = currentDisplayName();
    final suggestion = _suggestion;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              name.isEmpty ? 'Olá!!' : 'Olá, $name!!',
              style: Theme.of(context).textTheme.headlineLarge,
            ),
            const SizedBox(height: 4),
            Text(
              'Qual a ocasião do dia?',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: AppColors.textMuted,
              ),
            ),
            const SizedBox(height: 20),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final occasion in _occasions)
                  ChoiceChip(
                    label: Text(occasion),
                    selected: _selectedOccasion == occasion,
                    onSelected: (_) => _selectOccasion(occasion),
                  ),
              ],
            ),
            const SizedBox(height: 28),
            Expanded(
              child: suggestion == null
                  ? const _EmptyState()
                  : Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 320),
                        child: AspectRatio(
                          aspectRatio: 0.85,
                          child: OutfitCard(
                            outfit: suggestion,
                            isFavorite: _isFavorite,
                            onFavoriteToggle: () =>
                                setState(() => _isFavorite = !_isFavorite),
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) =>
                                    OutfitDetailScreen(outfit: suggestion),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        'Escolha uma ocasião pra ver a sugestão de look de hoje.',
        textAlign: TextAlign.center,
        style: Theme.of(
          context,
        ).textTheme.bodyLarge?.copyWith(color: AppColors.textMuted),
      ),
    );
  }
}
