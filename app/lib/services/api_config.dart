/// Endereço da API Python (`api/main.py`) que expõe o pipeline de
/// features/*.py — recorte de peça, cor, categoria etc. Diferente do
/// Supabase, tem um valor padrão (`localhost:8000`) porque é só um servidor
/// de dev local por enquanto, sem segredo nenhum envolvido.
///
/// Pra apontar pra outro lugar (ex: quando o serviço for hospedado):
/// ```
/// flutter run --dart-define=API_BASE_URL=https://sua-api.exemplo.com
/// ```
class ApiConfig {
  ApiConfig._();

  static const baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8000',
  );
}
