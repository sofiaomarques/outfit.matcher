import 'package:flutter/foundation.dart';

import '../models/outfit.dart';
import '../repositories/outfit_history_repository.dart';

/// Favoritos, rejeições e último uso de cada look, compartilhados por todas
/// as telas (Novo look, Seus looks, detalhe do look, Favoritos): favoritar
/// numa aba já aparece nas outras. As mudanças aparecem na hora e são
/// desfeitas se o Supabase recusar. Também é o feedback que o recomendador
/// usa (`RecommendationService`).
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
  List<(List<String>, String?)> _rejections = [];
  Map<String, DateTime> _lastWorn = {};
  Map<String, List<String>> _wornIds = {};
  Future<void>? _loading;
  bool _loaded = false;

  /// Ids das peças de cada look favoritado, do mais recente pro mais antigo.
  List<List<String>> get favorites => List.unmodifiable(_favorites);

  bool isFavorite(Outfit outfit) =>
      _favorites.any((ids) => Outfit.keyFor(ids) == outfit.key);

  /// Looks rejeitados, como (ids das peças, chave da ocasião — nula =
  /// geral).
  List<(List<String>, String?)> get rejections =>
      List.unmodifiable(_rejections);

  /// Looks usados dentro de [wearWindow], com o último dia de uso.
  Iterable<(List<String>, DateTime)> get wornLooks => [
    for (final entry in _lastWorn.entries) (_wornIds[entry.key]!, entry.value),
  ];

  /// Último dia (dentro de [wearWindow]) em que o look foi marcado como
  /// usado, ou nulo.
  DateTime? lastWorn(Outfit outfit) => _lastWorn[outfit.key];

  /// Recarrega do Supabase. Várias telas abrem juntas e chamam isso ao
  /// mesmo tempo; elas compartilham o mesmo pedido.
  Future<void> load({DateTime? now}) {
    return _loading ??= _load(now ?? DateTime.now())
        .whenComplete(() => _loading = null);
  }

  /// Carrega só se ainda não carregou nenhuma vez.
  Future<void> ensureLoaded() => _loaded ? Future.value() : load();

  Future<void> _load(DateTime now) async {
    final (favorites, wears, rejections) = await (
      _repository.fetchFavorites(),
      _repository.fetchWears(since: now.subtract(wearWindow)),
      // Tabela mais nova: se ainda não foi criada no projeto Supabase, os
      // favoritos e usos continuam funcionando, só sem rejeições.
      _repository.fetchRejections().catchError(
        (_) => <(List<String>, String?)>[],
      ),
    ).wait;
    _favorites = favorites;
    _rejections = rejections;
    _lastWorn = {};
    _wornIds = {};
    for (final (ids, day) in wears) {
      // Vem do mais recente pro mais antigo: o primeiro de cada look vale.
      final key = Outfit.keyFor(ids);
      _lastWorn.putIfAbsent(key, () => day);
      _wornIds[key] = Outfit.sortedIds(ids);
    }
    _loaded = true;
    notifyListeners();
  }

  /// Favorita ou desfavorita. Devolve false (e desfaz) se não conseguiu
  /// salvar.
  Future<bool> toggleFavorite(Outfit outfit) async {
    final ids = outfit.itemIds;
    final adding = !isFavorite(outfit);
    _setFavorite(ids, adding);
    try {
      if (adding) {
        await _repository.addFavorite(ids);
      } else {
        await _repository.removeFavorite(ids);
      }
      return true;
    } catch (_) {
      // Desfaz só esse look: restaurar a lista inteira apagaria toques em
      // outros looks feitos enquanto esse salvava.
      _setFavorite(ids, !adding);
      return false;
    }
  }

  void _setFavorite(List<String> ids, bool favorite) {
    final key = Outfit.keyFor(ids);
    _favorites = [
      if (favorite) ids,
      for (final f in _favorites)
        if (Outfit.keyFor(f) != key) f,
    ];
    notifyListeners();
  }

  /// Marca o look como usado hoje. Devolve false (e desfaz) se não
  /// conseguiu salvar.
  Future<bool> markWorn(Outfit outfit, {DateTime? now}) async {
    final moment = now ?? DateTime.now();
    final today = DateTime(moment.year, moment.month, moment.day);
    final before = _lastWorn[outfit.key];
    _lastWorn[outfit.key] = today;
    _wornIds[outfit.key] = outfit.itemIds;
    notifyListeners();
    try {
      await _repository.addWear(outfit.itemIds, today);
      return true;
    } catch (_) {
      if (before == null) {
        _lastWorn.remove(outfit.key);
        _wornIds.remove(outfit.key);
      } else {
        _lastWorn[outfit.key] = before;
      }
      notifyListeners();
      return false;
    }
  }

  bool isRejected(Outfit outfit, {String? occasion}) => _rejections.any(
    (r) => Outfit.keyFor(r.$1) == outfit.key && r.$2 == occasion,
  );

  /// "Não curti": o look não volta nessa ocasião ([occasion] é a chave,
  /// ex.: 'trabalho'). Devolve false (e desfaz) se não conseguiu salvar.
  Future<bool> reject(Outfit outfit, {String? occasion}) async {
    if (isRejected(outfit, occasion: occasion)) return true;
    _setRejected(outfit.itemIds, occasion, true);
    try {
      await _repository.addRejection(outfit.itemIds, occasion);
      return true;
    } catch (_) {
      _setRejected(outfit.itemIds, occasion, false);
      return false;
    }
  }

  /// Desfaz um [reject]. Devolve false (e desfaz) se não conseguiu salvar.
  Future<bool> undoReject(Outfit outfit, {String? occasion}) async {
    _setRejected(outfit.itemIds, occasion, false);
    try {
      await _repository.removeRejection(outfit.itemIds, occasion);
      return true;
    } catch (_) {
      _setRejected(outfit.itemIds, occasion, true);
      return false;
    }
  }

  void _setRejected(List<String> ids, String? occasion, bool rejected) {
    final key = Outfit.keyFor(ids);
    _rejections = [
      if (rejected) (ids, occasion),
      for (final r in _rejections)
        if (!(Outfit.keyFor(r.$1) == key && r.$2 == occasion)) r,
    ];
    notifyListeners();
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
