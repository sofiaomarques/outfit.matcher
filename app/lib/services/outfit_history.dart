import 'package:flutter/foundation.dart';

import '../models/outfit.dart';
import '../repositories/outfit_history_repository.dart';

/// Favoritos e último uso de cada look, compartilhados por todas as telas
/// (Novo look, Seus looks, detalhe do look, Favoritos): favoritar numa
/// aba já aparece nas outras. As mudanças aparecem na hora e são
/// desfeitas se o Supabase recusar.
class OutfitHistory extends ChangeNotifier {
  OutfitHistory({OutfitHistoryRepository? repository})
    : _repositoryOverride = repository;

  static final instance = OutfitHistory();

  /// Janela do histórico de uso carregado.
  static const wearWindow = Duration(days: 90);

  final OutfitHistoryRepository? _repositoryOverride;
  // Criado só no primeiro uso: `Supabase.instance` não existe nos testes.
  late final OutfitHistoryRepository _repository =
      _repositoryOverride ?? OutfitHistoryRepository();

  List<List<String>> _favorites = [];
  Map<String, DateTime> _lastWorn = {};
  Future<void>? _loading;

  /// Ids das peças de cada look favoritado, do mais recente pro mais antigo.
  List<List<String>> get favorites => List.unmodifiable(_favorites);

  bool isFavorite(Outfit outfit) =>
      _favorites.any((ids) => Outfit.keyFor(ids) == outfit.key);

  /// Último dia (dentro de [wearWindow]) em que o look foi marcado como
  /// usado, ou nulo.
  DateTime? lastWorn(Outfit outfit) => _lastWorn[outfit.key];

  /// Recarrega do Supabase. Várias telas abrem juntas e chamam isso ao
  /// mesmo tempo; elas compartilham o mesmo pedido.
  Future<void> load({DateTime? now}) {
    return _loading ??= _load(now ?? DateTime.now())
        .whenComplete(() => _loading = null);
  }

  Future<void> _load(DateTime now) async {
    final (favorites, wears) = await (
      _repository.fetchFavorites(),
      _repository.fetchWears(since: now.subtract(wearWindow)),
    ).wait;
    _favorites = favorites;
    _lastWorn = {};
    for (final (ids, day) in wears) {
      // Vem do mais recente pro mais antigo: o primeiro de cada look vale.
      _lastWorn.putIfAbsent(Outfit.keyFor(ids), () => day);
    }
    notifyListeners();
  }

  /// Favorita ou desfavorita. Devolve false (e desfaz) se não conseguiu
  /// salvar.
  Future<bool> toggleFavorite(Outfit outfit) async {
    final ids = outfit.itemIds;
    final before = _favorites;
    final adding = !isFavorite(outfit);
    _favorites = adding
        ? [ids, ..._favorites]
        : [
            for (final favorite in _favorites)
              if (Outfit.keyFor(favorite) != outfit.key) favorite,
          ];
    notifyListeners();
    try {
      if (adding) {
        await _repository.addFavorite(ids);
      } else {
        await _repository.removeFavorite(ids);
      }
      return true;
    } catch (_) {
      _favorites = before;
      notifyListeners();
      return false;
    }
  }

  /// Marca o look como usado hoje. Devolve false (e desfaz) se não
  /// conseguiu salvar.
  Future<bool> markWorn(Outfit outfit, {DateTime? now}) async {
    final moment = now ?? DateTime.now();
    final today = DateTime(moment.year, moment.month, moment.day);
    final before = _lastWorn[outfit.key];
    _lastWorn[outfit.key] = today;
    notifyListeners();
    try {
      await _repository.addWear(outfit.itemIds, today);
      return true;
    } catch (_) {
      if (before == null) {
        _lastWorn.remove(outfit.key);
      } else {
        _lastWorn[outfit.key] = before;
      }
      notifyListeners();
      return false;
    }
  }
}

/// "Usado hoje", "Usado ontem", "Usado há 5 dias".
String describeLastWorn(DateTime day, {DateTime? now}) {
  final moment = now ?? DateTime.now();
  final today = DateTime(moment.year, moment.month, moment.day);
  // Arredonda as horas: com horário de verão um "dia" pode ter 23 ou 25h.
  final hours = today
      .difference(DateTime(day.year, day.month, day.day))
      .inHours;
  final days = (hours / 24).round();
  if (days <= 0) return 'Usado hoje';
  if (days == 1) return 'Usado ontem';
  return 'Usado há $days dias';
}
