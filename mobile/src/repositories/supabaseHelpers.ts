import type { SupabaseClient } from '@supabase/supabase-js';

export const SIGNED_URL_TTL_SECONDS = 3600;

/** O supabase-js devolve `{ data, error }` em vez de lançar; aqui vira exceção, como no Dart. */
export function unwrap<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  if (result.data == null) throw new Error('Resposta vazia do Supabase.');
  return result.data;
}

/** Para escritas (update/delete/upsert), em que só importa se deu erro. */
export function check(result: { error: unknown }): void {
  if (result.error) throw result.error;
}

export function requireUserId(client: SupabaseClient): Promise<string> {
  // getSession lê a sessão guardada no aparelho, sem ir à rede.
  return client.auth.getSession().then(({ data }) => {
    if (!data.session) throw new Error('Usuário não autenticado.');
    return data.session.user.id;
  });
}

/**
 * Detecta PNG (assinatura `\x89PNG`) vs JPEG pelos bytes: a foto pode chegar
 * já recortada em PNG (com transparência, via `/items/crop`) ou ainda em JPEG
 * cru, se o serviço de recorte estiver fora do ar.
 */
export function detectImageContentType(bytes: Uint8Array): 'image/png' | 'image/jpeg' {
  const png = [0x89, 0x50, 0x4e, 0x47];
  const isPng = bytes.length >= png.length && png.every((b, i) => bytes[i] === b);
  return isPng ? 'image/png' : 'image/jpeg';
}
