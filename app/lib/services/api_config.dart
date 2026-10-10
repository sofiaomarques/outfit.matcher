import 'package:supabase_flutter/supabase_flutter.dart';

/// Endereço da API Python (`api/main.py`) que expõe o pipeline de
/// features/*.py — recorte de peça, cor, categoria etc. Tem um valor padrão
/// (`localhost:8000`) pra dev local.
///
/// Pra apontar pra outro lugar (ex: a API hospedada):
/// ```
/// flutter run --dart-define=API_BASE_URL=https://sua-api.exemplo.com
/// ```
class ApiConfig {
  ApiConfig._();

  static const baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8000',
  );

  /// `Authorization` com o access token da sessão do Supabase: a API
  /// recusa (401) chamadas sem usuário logado (`api/auth.py`). Renova o
  /// token se ele já venceu (ex.: aba aberta há mais de uma hora), em vez
  /// de deixar a chamada falhar.
  static Future<Map<String, String>> authHeaders() async {
    final auth = Supabase.instance.client.auth;
    var session = auth.currentSession;
    if (session != null && session.isExpired) {
      session = (await auth.refreshSession()).session;
    }
    final token = session?.accessToken;
    return {if (token != null) 'Authorization': 'Bearer $token'};
  }
}
