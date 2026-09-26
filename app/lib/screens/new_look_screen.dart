import 'package:flutter/material.dart';

import '../models/clothing_item.dart';
import '../models/outfit.dart';
import '../repositories/wardrobe_repository.dart';
import '../services/current_user.dart';
import '../services/outfit_history.dart';
import '../services/recommendation_service.dart';
import '../theme/app_colors.dart';
import '../widgets/looks_status.dart';
import '../widgets/outfit_actions.dart';
import '../widgets/outfit_card.dart';
import 'outfit_detail_screen.dart';

/// Tela "Novo look": saudação personalizada com o nome escolhido no
/// cadastro, seguida de uma sugestão de look pra ocasião selecionada,
/// montada com as peças reais do guarda-roupa pelo recomendador da API
/// (`model/recomendar.py`). "Ver outra" percorre as próximas sugestões.
class NewLookScreen extends StatefulWidget {
  const NewLookScreen({super.key});

  @override
  State<NewLookScreen> createState() => _NewLookScreenState();
}

class _NewLookScreenState extends State<NewLookScreen> {
  static const _suggestionCount = 5;

  final _recommender = RecommendationService(WardrobeRepository());

  List<ClothingItem>? _items;
  String? _selectedOccasion;
  List<Outfit> _looks = [];
  int _lookIndex = 0;
  bool _isLoading = true;
  String _loadingText = 'Carregando seu guarda-roupa...';
  String? _errorText;
  // Trocar de ocasião rápido dispara pedidos em paralelo; só o último vale.
  int _requestId = 0;

  @override
  void initState() {
    super.initState();
    _loadWardrobe();
    // Sem o histórico, o coração só começa vazio; não trava a sugestão.
    OutfitHistory.instance.load().ignore();
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
      setState(() {
        _items = items;
        _isLoading = false;
      });
      if (_selectedOccasion != null) _recommend();
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
      _loadingText = 'Montando seu look...';
      _errorText = null;
      _looks = [];
      _lookIndex = 0;
    });
    try {
      final looks = await _recommender.recommend(
        items,
        occasion: _selectedOccasion,
        topK: _suggestionCount,
      );
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _looks = looks;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _errorText =
            'Não foi possível gerar o look. Confira se a API está rodando.';
        _isLoading = false;
      });
    }
  }

  void _selectOccasion(String occasion) {
    setState(() => _selectedOccasion = occasion);
    _recommend();
  }

  void _nextLook() {
    setState(() {
      _lookIndex = (_lookIndex + 1) % _looks.length;
    });
  }

  Widget _buildSuggestion() {
    if (_isLoading) {
      return LooksStatus(message: _loadingText, isLoading: true);
    }
    if (_errorText != null) {
      return LooksStatus(
        message: _errorText!,
        onRetry: _items == null ? _loadWardrobe : _recommend,
      );
    }
    if (_selectedOccasion == null) {
      return const LooksStatus(
        message: 'Escolha uma ocasião pra ver a sugestão de look de hoje.',
      );
    }
    if (_looks.isEmpty) {
      return const LooksStatus(
        message:
            'Ainda não dá pra montar um look: cadastre pelo menos uma peça '
            'de cima e uma de baixo, ou um vestido.',
      );
    }

    final suggestion = _looks[_lookIndex];
    return Column(
      children: [
        Expanded(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 320),
              child: AspectRatio(
                aspectRatio: 0.85,
                child: ListenableBuilder(
                  listenable: OutfitHistory.instance,
                  builder: (context, _) => OutfitCard(
                    outfit: suggestion,
                    isFavorite: OutfitHistory.instance.isFavorite(suggestion),
                    onFavoriteToggle: () =>
                        toggleOutfitFavorite(context, suggestion),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => OutfitDetailScreen(outfit: suggestion),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        if (_looks.length > 1)
          TextButton.icon(
            onPressed: _nextLook,
            icon: const Icon(Icons.refresh),
            label: Text('Ver outra (${_lookIndex + 1}/${_looks.length})'),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final name = currentDisplayName();

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
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: 20),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final occasion in occasionKeys.keys)
                  ChoiceChip(
                    label: Text(occasion),
                    selected: _selectedOccasion == occasion,
                    onSelected: _items == null
                        ? null
                        : (_) => _selectOccasion(occasion),
                  ),
              ],
            ),
            const SizedBox(height: 28),
            Expanded(child: _buildSuggestion()),
          ],
        ),
      ),
    );
  }
}
