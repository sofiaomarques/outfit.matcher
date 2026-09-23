import 'package:flutter/material.dart';

import '../models/wishlist_item.dart';
import '../repositories/wishlist_repository.dart';
import '../theme/app_colors.dart';
import 'add_wishlist_item_screen.dart';

/// Tela "Wishlist": grid de peças que a usuária ainda não tem mas quer
/// comprar (foto + descrição livre), carregadas do Supabase (via
/// [WishlistRepository]).
class WishlistScreen extends StatefulWidget {
  const WishlistScreen({super.key});

  @override
  State<WishlistScreen> createState() => _WishlistScreenState();
}

class _WishlistScreenState extends State<WishlistScreen> {
  final _repository = WishlistRepository();
  List<WishlistItem> _items = [];
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
        _errorText = 'Não foi possível carregar sua wishlist.';
        _isLoading = false;
      });
    }
  }

  Future<void> _openAddItem() async {
    final added = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (context) => AddWishlistItemScreen(repository: _repository),
      ),
    );
    if (added == true) _loadItems();
  }

  Future<void> _deleteItem(WishlistItem item) async {
    final previous = _items;
    setState(() => _items = _items.where((i) => i.id != item.id).toList());
    try {
      await _repository.deleteItem(item);
    } catch (_) {
      if (mounted) setState(() => _items = previous);
    }
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
                const Icon(
                  Icons.shopping_cart_outlined,
                  color: AppColors.wine,
                ),
                const SizedBox(width: 10),
                Text(
                  'Wishlist',
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
    if (_items.isEmpty) {
      return const _EmptyState();
    }
    return GridView.builder(
      itemCount: _items.length,
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 220,
        mainAxisSpacing: 20,
        crossAxisSpacing: 20,
        childAspectRatio: 0.78,
      ),
      itemBuilder: (context, index) {
        final item = _items[index];
        return _WishlistCard(item: item, onDelete: () => _deleteItem(item));
      },
    );
  }
}

class _WishlistCard extends StatelessWidget {
  const _WishlistCard({required this.item, required this.onDelete});

  final WishlistItem item;
  final VoidCallback onDelete;

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
                  Positioned.fill(child: _WishlistThumbnail(item: item)),
                  Positioned(
                    top: 0,
                    right: 0,
                    child: InkWell(
                      onTap: onDelete,
                      borderRadius: BorderRadius.circular(20),
                      child: const Padding(
                        padding: EdgeInsets.all(4),
                        child: Icon(
                          Icons.close,
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
            Text(
              item.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: AppColors.textDark),
            ),
          ],
        ),
      ),
    );
  }
}

class _WishlistThumbnail extends StatelessWidget {
  const _WishlistThumbnail({required this.item});

  final WishlistItem item;

  @override
  Widget build(BuildContext context) {
    if (item.imageUrl == null) {
      return DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.pinkLight,
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Center(
          child: Icon(
            Icons.shopping_cart_outlined,
            size: 36,
            color: AppColors.wine,
          ),
        ),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Image.network(
        item.imageUrl!,
        fit: BoxFit.cover,
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return const Center(
            child: CircularProgressIndicator(strokeWidth: 2),
          );
        },
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
          const Opacity(
            opacity: 0.5,
            child: Icon(
              Icons.shopping_cart_outlined,
              size: 40,
              color: AppColors.pink,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Nenhuma peça na wishlist ainda.',
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
