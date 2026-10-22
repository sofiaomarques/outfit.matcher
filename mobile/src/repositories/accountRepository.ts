import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '../services/supabase';
import { isTableMissing, unwrap } from './supabaseHelpers';

const TABLES = [
  'clothing_items',
  'wishlist_items',
  'outfit_favorites',
  'outfit_wears',
  'outfit_rejections',
];
const BUCKETS = ['clothing-images', 'wishlist-images'];

/**
 * Conta da usuária logada: e-mail, sair e apagar tudo o que ela enviou.
 *
 * "Apagar meus dados" usa a anon key + a sessão dela, então só alcança o que
 * o RLS deixa (as próprias linhas e a pasta `{user_id}/` de cada bucket) — ver
 * `supabase/schema.sql`. A conta em si (`auth.users`) fica: apagar exigiria
 * uma função `security definer` no banco.
 */
export class AccountRepository {
  constructor(private readonly client: SupabaseClient = supabase) {}

  async email(): Promise<string | null> {
    const { data } = await this.client.auth.getSession();
    return data.session?.user.email ?? null;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  /**
   * Apaga as peças, a wishlist, os favoritos, os usos e as rejeições, e depois
   * as fotos dos dois buckets. As linhas vão primeiro: se as fotos falharem no
   * meio, tentar de novo termina o serviço, porque as fotos são listadas
   * direto do Storage (pega até foto sem linha).
   */
  async eraseMyData(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) throw new Error('Usuário não autenticado.');

    for (const table of TABLES) {
      const { error } = await this.client.from(table).delete().eq('user_id', userId);
      // Tabela que ainda não foi criada no projeto (ex.: a de rejeições, mais
      // nova): não tem o que apagar nela.
      if (error && !isTableMissing(error)) throw error;
    }
    for (const bucket of BUCKETS) {
      const storage = this.client.storage.from(bucket);
      await removeAllFiles({
        list: async () =>
          unwrap(await storage.list(userId))
            // Sem id = pasta, não arquivo.
            .filter((file) => file.id != null)
            .map((file) => `${userId}/${file.name}`),
        remove: async (paths) => unwrap(await storage.remove(paths)).length,
      });
    }
  }
}

/**
 * Lista e apaga em lotes (o Storage devolve no máximo 100 por vez) até a
 * pasta ficar vazia. [remove] devolve quantos apagou: o Storage não dá erro
 * quando o RLS recusa, só não apaga nada, e aí lança em vez de repetir pra
 * sempre.
 */
export async function removeAllFiles(params: {
  list: () => Promise<string[]>;
  remove: (paths: string[]) => Promise<number>;
}): Promise<void> {
  for (;;) {
    const paths = await params.list();
    if (paths.length === 0) return;
    if ((await params.remove(paths)) === 0) {
      throw new Error(`O Storage não apagou ${paths.length} foto(s).`);
    }
  }
}
