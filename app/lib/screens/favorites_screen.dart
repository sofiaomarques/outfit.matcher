import 'package:flutter/material.dart';

import '../models/clothing_item.dart';
import '../models/outfit.dart';
import '../repositories/wardrobe_repository.dart';
import '../services/outfit_history.dart';
import '../widgets/looks_status.dart';
import '../widgets/outfit_actions.dart';
import '../widgets/outfit_card.dart';
import 'outfit_detail_screen.dart';

/// Tela "Favoritos": os looks salvos com o coração em qualquer tela, do
/// mais recente pro mais antigo, montados com as peças do guarda-roupa.
/// Looks com alguma peça que já foi apagada não aparecem.
class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  final _repository = WardrobeRepository();
  final _history = OutfitHistory.instance;

  Map<String, ClothingItem> _itemsById = {};
  bool _isLoading = true;
  String? _errorText;
  // Ids já procurados no guarda-roupa sem sucesso (peças apagadas): não
  // recarrega de novo por causa deles.
  final Set<String> _knownMissing = {};

  @override
  void initState() {
    super.initState();
    _history.addListener(_onHistoryChanged);
    _load();
  }

  @override
  void dispose() {
    _history.removeListener(_onHistoryChanged);
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final (items, _) = await (_repository.fetchItems(), _history.load()).wait;
      if (!mounted) return;
      setState(() {
        _setItems(items);
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorText = 'Não foi possível carregar seus favoritos.';
        _isLoading = false;
      });
    }
  }

  void _setItems(List<ClothingItem> items) {
    _itemsById = {for (final item in items) item.id: item};
    _knownMissing
      ..clear()
      ..addAll(_unknownIds());
  }

  Iterable<String> _unknownIds() => {
    for (final ids in _history.favorites)
      for (final id in ids)
        if (!_itemsById.containsKey(id)) id,
  };

  /// Favoritado em outra aba um look com peça cadastrada depois que essa
  /// tela carregou: busca o guarda-roupa de novo.
  Future<void> _onHistoryChanged() async {
    if (_isLoading || !_unknownIds().any((id) => !_knownMissing.contains(id))) {
      return;
    }
    try {
      final items = await _repository.fetchItems();
      if (mounted) setState(() => _setItems(items));
    } catch (_) {
      // Fica com o que já tinha; o look aparece na próxima abertura.
    }
  }

  List<Outfit> get _outfits => [
    for (final ids in _history.favorites)
      if (ids.every(_itemsById.containsKey))
        Outfit(
          id: Outfit.keyFor(ids),
          // Os ids ficam salvos em ordem de id; mostra de cima pra baixo.
          items: [for (final id in ids) _itemsById[id]!]
            ..sort((a, b) => a.category.index.compareTo(b.category.index)),
          tags: const [],
        ),
  ];

  Widget _buildBody() {
    if (_isLoading) {
      return const LooksStatus(
        message: 'Carregando seus favoritos...',
        isLoading: true,
      );
    }
    if (_errorText != null) {
      return LooksStatus(message: _errorText!, onRetry: _load);
    }
    return ListenableBuilder(
      listenable: _history,
      builder: (context, _) {
        final outfits = _outfits;
        if (outfits.isEmpty) {
          return const LooksStatus(
            message:
                'Nenhum look salvo ainda. Toque no coração de um look em '
                '"Novo look" ou "Looks" pra guardar aqui.',
          );
        }
        return GridView.builder(
          itemCount: outfits.length,
          gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
            maxCrossAxisExtent: 260,
            mainAxisSpacing: 20,
            crossAxisSpacing: 20,
            childAspectRatio: 1.15,
          ),
          itemBuilder: (context, index) {
            final outfit = outfits[index];
            return OutfitCard(
              outfit: outfit,
              isFavorite: true,
              onFavoriteToggle: () => toggleOutfitFavorite(context, outfit),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      OutfitDetailScreen(outfit: outfit, title: 'Look salvo'),
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Favoritos', style: Theme.of(context).textTheme.headlineLarge),
            const SizedBox(height: 20),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }
}
