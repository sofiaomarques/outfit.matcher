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

  String? get email => _client.auth.currentUser?.email;

  Future<void> signOut() => _client.auth.signOut();

  /// Apaga as peças, a wishlist, os favoritos, os usos e as rejeições, e
  /// depois as fotos dos dois buckets (ver [eraseUserData]). Lança
  /// [EraseFailure] se não terminar.
  Future<void> eraseMyData() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw StateError('Usuário não autenticado.');

    await eraseUserData(
      userId: userId,
      deleteRows: (table) => _client.from(table).delete().eq('user_id', userId),
      hasRows: (table) async =>
          (await _client
                  .from(table)
                  .select('user_id')
                  .eq('user_id', userId)
                  .limit(1))
              .isNotEmpty,
      listFiles: (bucket) async => folderFilePaths(userId, [
        for (final file
            in await _client.storage.from(bucket).list(path: userId))
          (id: file.id, name: file.name),
      ]),
      removeFiles: (bucket, paths) async =>
          (await _client.storage.from(bucket).remove(paths)).length,
    );
  }
}

const _tables = [
  'clothing_items',
  'wishlist_items',
  'outfit_favorites',
  'outfit_wears',
  'outfit_rejections',
];

/// Tabelas mais novas, que podem não existir num projeto antigo: não ter a
/// tabela é não ter o que apagar. Nas outras, a falta é erro de verdade.
const _optionalTables = {'outfit_rejections'};

const _buckets = ['clothing-images', 'wishlist-images'];

/// Tabela que não existe: PostgREST 12+ e o código do Postgres, que as
/// versões antigas repassavam.
const _tableNotFound = {'PGRST205', '42P01'};

/// "Apagar meus dados" não terminou. [partial] diz se algum pedido de apagar
/// já foi concluído antes da falha (mesmo que a pasta ou a tabela estivesse
/// vazia), pra as telas só recarregarem quando pode ter mudado alguma coisa.
class EraseFailure implements Exception {
  EraseFailure(this.cause, {required this.partial});

  final Object cause;
  final bool partial;

  @override
  String toString() => 'EraseFailure(partial: $partial): $cause';
}

/// Caminhos dos arquivos de [entries] (o que o Storage listou em `{userId}/`).
/// Sem id é pasta, não arquivo: as fotos do app ficam direto em `{userId}/`,
/// sem subpastas, então só os arquivos são apagados.
List<String> folderFilePaths(
  String userId,
  Iterable<({String? id, String name})> entries,
) => [
  for (final entry in entries)
    if (entry.id != null) '$userId/${entry.name}',
];

/// As linhas vão primeiro, todas ao mesmo tempo, e depois as fotos dos dois
/// buckets: se as fotos falharem no meio, tentar de novo termina o serviço,
/// porque as fotos são listadas direto do Storage (pega até foto sem linha).
/// Não é atômico: tornar isso atômico exigiria uma função `security definer`
/// no banco.
///
/// O PostgREST não dá erro quando o RLS recusa um delete, só não apaga nada:
/// por isso [hasRows] confere se sobrou alguma linha depois de cada delete.
/// Pelo mesmo motivo, [listFiles] só pode devolver caminhos de `{userId}/`.
Future<void> eraseUserData({
  required String userId,
  required Future<void> Function(String table) deleteRows,
  required Future<bool> Function(String table) hasRows,
  required Future<List<String>> Function(String bucket) listFiles,
  required Future<int> Function(String bucket, List<String> paths) removeFiles,
}) async {
  var progressed = false;
  try {
    await Future.wait([
      for (final table in _tables)
        () async {
          try {
            await deleteRows(table);
            progressed = true;
            if (await hasRows(table)) {
              throw StateError('O banco não apagou tudo de $table (RLS?).');
            }
          } on PostgrestException catch (e) {
            if (!_optionalTables.contains(table) ||
                !_tableNotFound.contains(e.code)) {
              rethrow;
            }
          }
        }(),
    ]);
    await Future.wait([
      for (final bucket in _buckets)
        removeAllFiles(
          list: () async {
            final paths = await listFiles(bucket);
            if (paths.any((path) => !path.startsWith('$userId/'))) {
              throw StateError('Arquivo fora da pasta de $bucket/$userId.');
            }
            return paths;
          },
          remove: (paths) async {
            final removed = await removeFiles(bucket, paths);
            if (removed > 0) progressed = true;
            return removed;
          },
        ),
    ]);
  } catch (e) {
    throw EraseFailure(e, partial: progressed);
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
