import 'package:supabase_flutter/supabase_flutter.dart';

/// Conta da usuária logada: e-mail, sair e apagar tudo o que ela enviou.
///
/// "Apagar meus dados" usa a anon key + a sessão dela, então só alcança o
/// que o RLS deixa (as próprias linhas e a pasta `{user_id}/` de cada
/// bucket) — ver `supabase/schema.sql`. A conta em si (`auth.users`) fica:
/// apagar exigiria uma função `security definer` no banco.
class AccountRepository {
  AccountRepository({SupabaseClient? client})
    : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;

  static const _tables = [
    'clothing_items',
    'wishlist_items',
    'outfit_favorites',
    'outfit_wears',
    'outfit_rejections',
  ];
  static const _buckets = ['clothing-images', 'wishlist-images'];

  /// Tabela que não existe: PostgREST 12+ e o código do Postgres, que as
  /// versões antigas repassavam.
  static const _tableNotFound = {'PGRST205', '42P01'};

  String? get email => _client.auth.currentUser?.email;

  Future<void> signOut() => _client.auth.signOut();

  /// Apaga as peças, a wishlist, os favoritos, os usos e as rejeições, e
  /// depois as fotos dos dois buckets. As linhas vão primeiro: se as fotos
  /// falharem no meio, tentar de novo termina o serviço, porque as fotos
  /// são listadas direto do Storage (pega até foto sem linha).
  Future<void> eraseMyData() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw StateError('Usuário não autenticado.');

    for (final table in _tables) {
      try {
        await _client.from(table).delete().eq('user_id', userId);
      } on PostgrestException catch (e) {
        // Tabela que ainda não foi criada no projeto (ex.: a de rejeições,
        // mais nova): não tem o que apagar nela.
        if (!_tableNotFound.contains(e.code)) rethrow;
      }
    }
    for (final bucket in _buckets) {
      final storage = _client.storage.from(bucket);
      await removeAllFiles(
        list: () async => [
          for (final file in await storage.list(path: userId))
            // Sem id = pasta, não arquivo.
            if (file.id != null) '$userId/${file.name}',
        ],
        remove: (paths) async => (await storage.remove(paths)).length,
      );
    }
  }
}

/// Lista e apaga em lotes (o Storage devolve no máximo 100 por vez) até a
/// pasta ficar vazia. [remove] devolve quantos apagou: o Storage não dá
/// erro quando o RLS recusa, só não apaga nada, e aí lança em vez de
/// repetir pra sempre.
Future<void> removeAllFiles({
  required Future<List<String>> Function() list,
  required Future<int> Function(List<String> paths) remove,
}) async {
  while (true) {
    final paths = await list();
    if (paths.isEmpty) return;
    if (await remove(paths) == 0) {
      throw StateError('O Storage não apagou ${paths.length} foto(s).');
    }
  }
}
