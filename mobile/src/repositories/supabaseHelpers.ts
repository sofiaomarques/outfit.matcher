import type { SupabaseClient } from '@supabase/supabase-js';

export const SIGNED_URL_TTL_SECONDS = 3600;

/** Renova a URL um pouco antes de vencer, pra imagem não quebrar no meio do uso. */
const SIGNED_URL_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Tabela que não existe: PostgREST 12+ e o código do Postgres, que as versões antigas repassavam. */
const TABLE_NOT_FOUND = new Set(['PGRST205', '42P01']);

export function isTableMissing(error: unknown): boolean {
  return TABLE_NOT_FOUND.has((error as { code?: string } | null)?.code ?? '');
}

/** URL assinada e quando ela vence (ms desde a época). */
export interface SignedImage {
  url: string;
  expiresAt: number;
}

/** A URL já venceu ou vence logo? Sem data (peça sem foto) não há o que renovar. */
export function needsUrlRefresh(expiresAt: number | undefined, now: number = Date.now()): boolean {
  return expiresAt !== undefined && expiresAt - SIGNED_URL_REFRESH_MARGIN_MS <= now;
}

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

/**
 * Assina várias fotos de uma vez. Foto que não pôde ser assinada (arquivo
 * sumiu, erro do Storage) fica de fora do mapa: a peça aparece sem foto em vez
 * de derrubar a lista inteira.
 */
export async function signImages(
  client: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<Map<string, SignedImage>> {
  const signed = new Map<string, SignedImage>();
  if (paths.length === 0) return signed;
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.warn('Não foi possível assinar as fotos:', error);
    return signed;
  }
  const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
  for (const entry of data) {
    if (entry.signedUrl && entry.path && !entry.error) {
      signed.set(entry.path, { url: entry.signedUrl, expiresAt });
    }
  }
  return signed;
}

/**
 * Sobe a foto e roda [save]. Se [save] falhar (linha recusada, rede), a foto
 * recém-enviada é apagada pra não ficar órfã no Storage, e o erro original sobe.
 */
export async function uploadThenSave<T>(params: {
  client: SupabaseClient;
  bucket: string;
  userId: string;
  id: string;
  imageBytes: Uint8Array;
  save: (path: string) => Promise<T>;
}): Promise<T> {
  const contentType = detectImageContentType(params.imageBytes);
  const extension = contentType === 'image/png' ? 'png' : 'jpg';
  const path = `${params.userId}/${params.id}.${extension}`;
  const storage = params.client.storage.from(params.bucket);

  check(await storage.upload(path, params.imageBytes, { contentType }));
  try {
    return await params.save(path);
  } catch (error) {
    await removeImageQuietly(params.client, params.bucket, path);
    throw error;
  }
}

/**
 * Apaga a foto sem lançar: usado depois que a linha já foi apagada (ou na
 * limpeza de um upload que falhou), quando um erro aqui só faria a tela achar
 * que a operação inteira falhou. Fotos que sobram são varridas por "Apagar
 * meus dados".
 */
export async function removeImageQuietly(
  client: SupabaseClient,
  bucket: string,
  path: string,
): Promise<void> {
  try {
    const { data, error } = await client.storage.from(bucket).remove([path]);
    // O Storage não dá erro quando o RLS recusa: só devolve lista vazia.
    if (error || !data || data.length === 0) {
      console.warn(`Foto ${path} não foi apagada do Storage:`, error ?? 'nada removido');
    }
  } catch (error) {
    console.warn(`Foto ${path} não foi apagada do Storage:`, error);
  }
}
