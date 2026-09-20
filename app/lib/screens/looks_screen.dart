import 'package:flutter/material.dart';

import '../data/mock_wardrobe.dart';
import '../models/outfit.dart';
import '../theme/app_colors.dart';
import '../widgets/outfit_card.dart';
import 'outfit_detail_screen.dart';

const List<String> _weatherFilters = [
  'Qualquer clima',
  'Calor',
  'Frio',
  'Chuva',
];

/// Tela "Seus looks": grade paginada com os looks sugeridos.
class LooksScreen extends StatefulWidget {
  const LooksScreen({super.key});

  @override
  State<LooksScreen> createState() => _LooksScreenState();
}

class _LooksScreenState extends State<LooksScreen> {
  static const _perPage = 6;

  final Set<String> _favoriteIds = {};
  String _weather = _weatherFilters.first;
  final PageController _pageController = PageController();
  int _page = 0;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  List<List<Outfit>> get _pages {
    final outfits = MockWardrobe.outfits;
    return [
      for (var i = 0; i < outfits.length; i += _perPage)
        outfits.sublist(
          i,
          i + _perPage > outfits.length ? outfits.length : i + _perPage,
        ),
    ];
  }

  void _openDetail(Outfit outfit) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => OutfitDetailScreen(outfit: outfit)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = _pages;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  'Seus looks',
                  style: Theme.of(context).textTheme.headlineLarge,
                ),
                const Spacer(),
                _WeatherDropdown(
                  value: _weather,
                  onChanged: (value) => setState(() => _weather = value),
                ),
              ],
            ),
            const SizedBox(height: 20),
            Expanded(
              child: PageView(
                controller: _pageController,
                onPageChanged: (page) => setState(() => _page = page),
                children: [
                  for (final page in pages)
                    GridView.builder(
                      itemCount: page.length,
                      gridDelegate:
                          const SliverGridDelegateWithMaxCrossAxisExtent(
                            maxCrossAxisExtent: 260,
                            mainAxisSpacing: 20,
                            crossAxisSpacing: 20,
                            childAspectRatio: 1.15,
                          ),
                      itemBuilder: (context, index) {
                        final outfit = page[index];
                        return OutfitCard(
                          outfit: outfit,
                          isFavorite: _favoriteIds.contains(outfit.id),
                          onFavoriteToggle: () => setState(() {
                            if (!_favoriteIds.remove(outfit.id)) {
                              _favoriteIds.add(outfit.id);
                            }
                          }),
                          onTap: () => _openDetail(outfit),
                          onSave: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Look salvo!')),
                            );
                          },
                        );
                      },
                    ),
                ],
              ),
            ),
            if (pages.length > 1) ...[
              const SizedBox(height: 12),
              _PageIndicator(
                pageCount: pages.length,
                currentPage: _page,
                onPrevious: _page > 0
                    ? () => _pageController.previousPage(
                        duration: const Duration(milliseconds: 250),
                        curve: Curves.easeOut,
                      )
                    : null,
                onNext: _page < pages.length - 1
                    ? () => _pageController.nextPage(
                        duration: const Duration(milliseconds: 250),
                        curve: Curves.easeOut,
                      )
                    : null,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _WeatherDropdown extends StatelessWidget {
  const _WeatherDropdown({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.pink.withValues(alpha: 0.5)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: value,
            icon: const Icon(Icons.wb_sunny_outlined, color: AppColors.wine),
            borderRadius: BorderRadius.circular(16),
            items: [
              for (final option in _weatherFilters)
                DropdownMenuItem(value: option, child: Text(option)),
            ],
            onChanged: (value) => value != null ? onChanged(value) : null,
          ),
        ),
      ),
    );
  }
}

class _PageIndicator extends StatelessWidget {
  const _PageIndicator({
    required this.pageCount,
    required this.currentPage,
    required this.onPrevious,
    required this.onNext,
  });

  final int pageCount;
  final int currentPage;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconButton(
          onPressed: onPrevious,
          icon: const Icon(Icons.chevron_left),
          color: AppColors.wine,
        ),
        for (var i = 0; i < pageCount; i++)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3),
            child: CircleAvatar(
              radius: 4,
              backgroundColor: i == currentPage
                  ? AppColors.wine
                  : AppColors.pink.withValues(alpha: 0.4),
            ),
          ),
        IconButton(
          onPressed: onNext,
          icon: const Icon(Icons.chevron_right),
          color: AppColors.wine,
        ),
      ],
    );
  }
}
