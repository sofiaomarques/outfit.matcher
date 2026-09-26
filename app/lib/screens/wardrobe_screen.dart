import 'package:flutter/material.dart';

import '../models/clothing_category.dart';
import '../models/clothing_item.dart';
import '../repositories/wardrobe_repository.dart';
import '../theme/app_colors.dart';
import '../widgets/garment_thumbnail.dart';
import '../widgets/painted_heart.dart';
import 'add_item_screen.dart';

/// Tela "Meu guarda-roupa": grid de peças filtrável por categoria, com as
/// peças carregadas do Supabase (via [WardrobeRepository]).
class WardrobeScreen extends StatefulWidget {
  const WardrobeScreen({super.key});

  @override
  State<WardrobeScreen> createState() => _WardrobeScreenState();
}

class _WardrobeScreenState extends State<WardrobeScreen> {
  final _repository = WardrobeRepository();
  ClothingCategory? _selectedCategory;
  List<ClothingItem> _items = [];
  bool _isLoading = true;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _loadItems();
  }

  Future<void> _loadItems() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final items = await _repository.fetchItems();
      if (!mounted) return;
      setState(() {
        _items = items;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorText = 'Não foi possível carregar seu guarda-roupa.';
        _isLoading = false;
      });
    }
  }

  Future<void> _openAddItem() async {
    final added = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (context) => AddItemScreen(repository: _repository),
      ),
    );
    if (added == true) _loadItems();
  }

  Future<void> _toggleFavorite(ClothingItem item) async {
    final updated = !item.isFavorite;
    setState(() {
      _items = [
        for (final current in _items)
          if (current.id == item.id)
            current.copyWith(isFavorite: updated)
          else
            current,
      ];
    });
    try {
      await _repository.setFavorite(item, updated);
    } catch (_) {
      if (mounted) _loadItems();
    }
  }

  List<ClothingItem> get _filteredItems {
    if (_selectedCategory == null) return _items;
    return _items.where((item) => item.category == _selectedCategory).toList();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.checkroom, color: AppColors.wine),
                const SizedBox(width: 10),
                Text(
                  'Meu guarda-roupa',
                  style: Theme.of(context).textTheme.headlineLarge,
                ),
                const Spacer(),
                IconButton.filled(
                  onPressed: _openAddItem,
                  style: IconButton.styleFrom(
                    backgroundColor: AppColors.pink,
                  ),
                  icon: const Icon(Icons.add),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _CategoryTabs(
              selected: _selectedCategory,
              onSelected: (category) =>
                  setState(() => _selectedCategory = category),
            ),
            const SizedBox(height: 20),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_errorText != null) {
      return _ErrorState(message: _errorText!, onRetry: _loadItems);
    }
    if (_filteredItems.isEmpty) {
      return const _EmptyState();
    }
    return GridView.builder(
      itemCount: _filteredItems.length,
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 220,
        mainAxisSpacing: 20,
        crossAxisSpacing: 20,
        childAspectRatio: 0.82,
      ),
      itemBuilder: (context, index) {
        final item = _filteredItems[index];
        return _GarmentCard(
          item: item,
          isFavorite: item.isFavorite,
          onFavoriteToggle: () => _toggleFavorite(item),
        );
      },
    );
  }
}

class _CategoryTabs extends StatelessWidget {
  const _CategoryTabs({required this.selected, required this.onSelected});

  final ClothingCategory? selected;
  final ValueChanged<ClothingCategory?> onSelected;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _TabChip(
            label: 'Todos',
            selected: selected == null,
            onTap: () => onSelected(null),
          ),
          for (final category in ClothingCategory.values)
            _TabChip(
              label: category.label,
              selected: selected == category,
              onTap: () => onSelected(category),
            ),
        ],
      ),
    );
  }
}

class _TabChip extends StatelessWidget {
  const _TabChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 20),
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: selected ? AppColors.wine : AppColors.textMuted,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
            const SizedBox(height: 4),
            AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              height: 2,
              width: 28,
              color: selected ? AppColors.wine : Colors.transparent,
            ),
          ],
        ),
      ),
    );
  }
}

class _GarmentCard extends StatelessWidget {
  const _GarmentCard({
    required this.item,
    required this.isFavorite,
    required this.onFavoriteToggle,
  });

  final ClothingItem item;
  final bool isFavorite;
  final VoidCallback onFavoriteToggle;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                children: [
                  Positioned.fill(child: GarmentThumbnail(item: item)),
                  Positioned(
                    top: 0,
                    right: 0,
                    child: InkWell(
                      onTap: onFavoriteToggle,
                      borderRadius: BorderRadius.circular(20),
                      child: Padding(
                        padding: const EdgeInsets.all(4),
                        child: Icon(
                          isFavorite ? Icons.favorite : Icons.favorite_border,
                          size: 20,
                          color: AppColors.wine,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    item.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppColors.textDark,
                    ),
                  ),
                ),
                const Icon(
                  Icons.more_horiz,
                  size: 18,
                  color: AppColors.textMuted,
                ),
              ],
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Opacity(
            opacity: 0.5,
            child: PaintedHeart(size: 40, color: AppColors.pink, rotation: -0.1),
          ),
          const SizedBox(height: 12),
          Text(
            'Nenhuma peça nessa categoria ainda.',
            style: Theme.of(
              context,
            ).textTheme.bodyLarge?.copyWith(color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            message,
            style: Theme.of(
              context,
            ).textTheme.bodyLarge?.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: 12),
          TextButton(onPressed: onRetry, child: const Text('Tentar de novo')),
        ],
      ),
    );
  }
}
