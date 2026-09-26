import 'package:flutter/material.dart';

import '../models/clothing_item.dart';
import '../models/outfit.dart';
import '../repositories/wardrobe_repository.dart';
import '../services/outfit_history.dart';
import '../services/recommendation_service.dart';
import '../theme/app_colors.dart';
import '../widgets/looks_status.dart';
import '../widgets/outfit_actions.dart';
import '../widgets/outfit_card.dart';
import 'outfit_detail_screen.dart';

const List<String> _weatherFilters = [
  'Qualquer clima',
  'Calor',
  'Frio',
  'Chuva',
];

/// Tela "Seus looks": grade paginada com os looks sugeridos pelo
/// recomendador (`model/recomendar.py`) a partir do guarda-roupa real,
/// refeitos a cada troca do filtro de clima.
class LooksScreen extends StatefulWidget {
  const LooksScreen({super.key});

  @override
  State<LooksScreen> createState() => _LooksScreenState();
}

class _LooksScreenState extends State<LooksScreen> {
  static const _perPage = 6;
  static const _lookCount = 24;

  final _recommender = RecommendationService(WardrobeRepository());
  String _weather = _weatherFilters.first;
  final PageController _pageController = PageController();
  int _page = 0;

  List<ClothingItem>? _items;
  List<Outfit> _outfits = [];
  bool _isLoading = true;
  String _loadingText = 'Carregando seu guarda-roupa...';
  String? _errorText;
  // Trocar de clima rápido dispara pedidos em paralelo; só o último vale.
  int _requestId = 0;

  @override
  void initState() {
    super.initState();
    _loadWardrobe();
    // Sem o histórico, os corações só começam vazios; não trava os looks.
    OutfitHistory.instance.load().ignore();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _loadWardrobe() async {
    setState(() {
      _isLoading = true;
      _loadingText = 'Carregando seu guarda-roupa...';
      _errorText = null;
    });
    try {
      final items = await _recommender.loadWardrobe(
        onProgress: (done, total) {
          if (mounted) {
            setState(
              () => _loadingText = 'Analisando suas peças ($done/$total)...',
            );
          }
        },
      );
      if (!mounted) return;
      _items = items;
      await _recommend();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorText = 'Não foi possível carregar seu guarda-roupa.';
        _isLoading = false;
      });
    }
  }

  Future<void> _recommend() async {
    final items = _items;
    if (items == null) return;
    final requestId = ++_requestId;
    setState(() {
      _isLoading = true;
      _loadingText = 'Montando seus looks...';
      _errorText = null;
    });
    try {
      final outfits = await _recommender.recommend(
        items,
        weather: _weather,
        topK: _lookCount,
      );
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _outfits = outfits;
        _isLoading = false;
        _page = 0;
      });
      if (_pageController.hasClients) _pageController.jumpToPage(0);
    } catch (error) {
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _errorText = error is NoAnalyzedItemsException
            ? 'Não foi possível analisar suas peças. '
                  'Confira se a API está rodando.'
            : 'Não foi possível gerar os looks. Confira se a API está rodando.';
        _isLoading = false;
      });
    }
  }

  void _selectWeather(String weather) {
    setState(() => _weather = weather);
    _recommend();
  }

  List<List<Outfit>> get _pages {
    final outfits = _outfits;
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

  Widget _buildBody(List<List<Outfit>> pages) {
    if (_isLoading) {
      return LooksStatus(message: _loadingText, isLoading: true);
    }
    if (_errorText != null) {
      return LooksStatus(
        message: _errorText!,
        onRetry: _items == null ? _loadWardrobe : _recommend,
      );
    }
    if (pages.isEmpty) {
      return const LooksStatus(
        message:
            'Ainda não dá pra montar looks: cadastre pelo menos uma peça '
            'de cima e uma de baixo, ou um vestido.',
      );
    }
    return PageView(
      controller: _pageController,
      onPageChanged: (page) => setState(() => _page = page),
      children: [
        for (final page in pages)
          GridView.builder(
            itemCount: page.length,
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 260,
              mainAxisSpacing: 20,
              crossAxisSpacing: 20,
              childAspectRatio: 1.15,
            ),
            itemBuilder: (context, index) {
              final outfit = page[index];
              return ListenableBuilder(
                listenable: OutfitHistory.instance,
                builder: (context, _) => OutfitCard(
                  outfit: outfit,
                  isFavorite: OutfitHistory.instance.isFavorite(outfit),
                  onFavoriteToggle: () => toggleOutfitFavorite(context, outfit),
                  onTap: () => _openDetail(outfit),
                ),
              );
            },
          ),
      ],
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
                _WeatherDropdown(value: _weather, onChanged: _selectWeather),
              ],
            ),
            const SizedBox(height: 20),
            Expanded(child: _buildBody(pages)),
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
