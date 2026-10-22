/**
 * Endereço da API Python (`api/main.py`). Valor padrão pra dev local; pra
 * apontar pra API hospedada:
 * ```
 * EXPO_PUBLIC_API_BASE_URL=https://sua-api.exemplo.com npx expo start
 * ```
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

/** Credenciais do Supabase (a anon key é pública por design, protegida por RLS). */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

/** Versão do build (ex.: o hash do commit). Sem ela, "dev". */
export const APP_VERSION = process.env.EXPO_PUBLIC_APP_VERSION || 'dev';

/** Link pra mandar feedback (ex.: um formulário). Sem ele, a opção não aparece. */
export const FEEDBACK_URL = process.env.EXPO_PUBLIC_FEEDBACK_URL ?? '';
