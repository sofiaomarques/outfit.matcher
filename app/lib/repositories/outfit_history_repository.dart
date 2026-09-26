import 'package:supabase_flutter/supabase_flutter.dart';

/// Favoritos e histórico de uso dos looks do usuário logado, nas tabelas
/// `outfit_favorites` e `outfit_wears` (isoladas por usuário via Row Level
/// Security — ver `supabase/schema.sql`). Um look é a lista dos ids das
/// peças em ordem crescente (`Outfit.itemIds`).
class OutfitHistoryRepository {
  OutfitHistoryRepository({SupabaseClient? client})
    : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;
  static const _favorites = 'outfit_favorites';
  static const _wears = 'outfit_wears';

  String get _userId {
    final user = _client.auth.currentUser;
    if (user == null) {
      throw StateError('Usuário não autenticado.');
    }
    return user.id;
  }

  /// Looks favoritados, do mais recente pro mais antigo.
  Future<List<List<String>>> fetchFavorites() async {
    final rows = await _client
        .from(_favorites)
        .select('item_ids')
        .order('created_at', ascending: false);
    return [for (final row in rows) (row['item_ids'] as List).cast<String>()];
  }

  Future<void> addFavorite(List<String> itemIds) {
    return _client
        .from(_favorites)
        .upsert(
          {'user_id': _userId, 'item_ids': itemIds},
          onConflict: 'user_id,item_ids',
          ignoreDuplicates: true,
        );
  }

  /// `contains` + `containedBy` = mesmo conjunto de peças.
  Future<void> removeFavorite(List<String> itemIds) {
    return _client
        .from(_favorites)
        .delete()
        .contains('item_ids', itemIds)
        .containedBy('item_ids', itemIds);
  }

  /// Usos desde [since], do mais recente pro mais antigo, como
  /// (ids das peças, dia).
  Future<List<(List<String>, DateTime)>> fetchWears({
    required DateTime since,
  }) async {
    final rows = await _client
        .from(_wears)
        .select('item_ids, worn_on')
        .gte('worn_on', _dateOnly(since))
        .order('worn_on', ascending: false);
    return [
      for (final row in rows)
        (
          (row['item_ids'] as List).cast<String>(),
          DateTime.parse(row['worn_on'] as String),
        ),
    ];
  }

  /// Marca o look como usado no dia [day] (local). Marcar de novo no mesmo
  /// dia não duplica.
  Future<void> addWear(List<String> itemIds, DateTime day) {
    return _client
        .from(_wears)
        .upsert(
          {'user_id': _userId, 'item_ids': itemIds, 'worn_on': _dateOnly(day)},
          onConflict: 'user_id,item_ids,worn_on',
          ignoreDuplicates: true,
        );
  }

  static String _dateOnly(DateTime day) =>
      '${day.year.toString().padLeft(4, '0')}-'
      '${day.month.toString().padLeft(2, '0')}-'
      '${day.day.toString().padLeft(2, '0')}';
}
