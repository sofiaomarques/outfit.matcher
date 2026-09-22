/// Credenciais do Supabase, injetadas em build/run time via `--dart-define`
/// pra não ficarem hardcoded (nem commitadas) no código-fonte.
///
/// Rode o app assim:
/// ```
/// flutter run --dart-define=SUPABASE_URL=https://xxxx.supabase.co \
///              --dart-define=SUPABASE_ANON_KEY=xxxx
/// ```
///
/// A anon key é uma chave pública por design (protegida pelas policies de
/// Row Level Security em `supabase/schema.sql`), mas ainda assim evitamos
/// deixá-la fixa no repositório.
class SupabaseConfig {
  SupabaseConfig._();

  static const url = String.fromEnvironment('SUPABASE_URL');
  static const anonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  static bool get isConfigured => url.isNotEmpty && anonKey.isNotEmpty;
}
