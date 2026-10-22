import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './apiConfig';

export const supabase = createClient(
  SUPABASE_URL || 'http://supabase.invalid',
  SUPABASE_ANON_KEY || 'missing',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

/**
 * `Authorization` com o access token da sessão: a API recusa (401)
 * chamadas sem usuário logado (`api/auth.py`). Renova o token se já
 * venceu, em vez de deixar a chamada falhar.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  const expired = session?.expires_at != null && session.expires_at * 1000 <= Date.now();
  if (session && expired) {
    session = (await supabase.auth.refreshSession()).data.session;
  }
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}
