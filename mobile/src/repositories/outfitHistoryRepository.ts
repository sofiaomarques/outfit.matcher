import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '../services/supabase';
import { check, requireUserId, unwrap } from './supabaseHelpers';

const FAVORITES = 'outfit_favorites';
const WEARS = 'outfit_wears';
const REJECTIONS = 'outfit_rejections';

/** Look rejeitado: ids das peças e a chave da ocasião em que foi rejeitado (nula = geral). */
export interface Rejection {
  itemIds: string[];
  occasion: string | null;
}

/** Look usado num dia (local, meia-noite). */
export interface Wear {
  itemIds: string[];
  day: Date;
}

/** "YYYY-MM-DD" do dia local. */
export function dateOnly(day: Date): string {
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${pad(day.getFullYear(), 4)}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** Lê "YYYY-MM-DD" como dia local (`new Date(string)` leria como UTC e poderia voltar um dia). */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Favoritos, rejeições e histórico de uso dos looks do usuário logado, nas
 * tabelas `outfit_favorites`, `outfit_rejections` e `outfit_wears` (isoladas
 * por usuário via Row Level Security — ver `supabase/schema.sql`). Um look é a
 * lista dos ids das peças em ordem crescente (`outfitItemIds`).
 */
export class OutfitHistoryRepository {
  constructor(private readonly client: SupabaseClient = supabase) {}

  /** Looks favoritados, do mais recente pro mais antigo. */
  async fetchFavorites(): Promise<string[][]> {
    const rows = unwrap(
      await this.client.from(FAVORITES).select('item_ids').order('created_at', { ascending: false }),
    );
    return rows.map((row) => row.item_ids as string[]);
  }

  async addFavorite(itemIds: string[]): Promise<void> {
    const userId = await requireUserId(this.client);
    check(
      await this.client
        .from(FAVORITES)
        .upsert(
          { user_id: userId, item_ids: itemIds },
          { onConflict: 'user_id,item_ids', ignoreDuplicates: true },
        ),
    );
  }

  /** `contains` + `containedBy` = mesmo conjunto de peças. */
  async removeFavorite(itemIds: string[]): Promise<void> {
    check(
      await this.client
        .from(FAVORITES)
        .delete()
        .contains('item_ids', itemIds)
        .containedBy('item_ids', itemIds),
    );
  }

  async fetchRejections(): Promise<Rejection[]> {
    const rows = unwrap(await this.client.from(REJECTIONS).select('item_ids, ocasiao'));
    return rows.map((row) => ({
      itemIds: row.item_ids as string[],
      occasion: (row.ocasiao as string | null) ?? null,
    }));
  }

  async addRejection(itemIds: string[], occasion: string | null): Promise<void> {
    const userId = await requireUserId(this.client);
    check(
      await this.client
        .from(REJECTIONS)
        .upsert(
          { user_id: userId, item_ids: itemIds, ocasiao: occasion },
          { onConflict: 'user_id,item_ids,ocasiao', ignoreDuplicates: true },
        ),
    );
  }

  async removeRejection(itemIds: string[], occasion: string | null): Promise<void> {
    const query = this.client
      .from(REJECTIONS)
      .delete()
      .contains('item_ids', itemIds)
      .containedBy('item_ids', itemIds);
    check(await (occasion === null ? query.is('ocasiao', null) : query.eq('ocasiao', occasion)));
  }

  /** Usos desde [since], do mais recente pro mais antigo. */
  async fetchWears(since: Date): Promise<Wear[]> {
    const rows = unwrap(
      await this.client
        .from(WEARS)
        .select('item_ids, worn_on')
        .gte('worn_on', dateOnly(since))
        .order('worn_on', { ascending: false }),
    );
    return rows.map((row) => ({
      itemIds: row.item_ids as string[],
      day: parseDateOnly(row.worn_on as string),
    }));
  }

  /** Marca o look como usado no dia [day] (local). Marcar de novo no mesmo dia não duplica. */
  async addWear(itemIds: string[], day: Date): Promise<void> {
    const userId = await requireUserId(this.client);
    check(
      await this.client
        .from(WEARS)
        .upsert(
          { user_id: userId, item_ids: itemIds, worn_on: dateOnly(day) },
          { onConflict: 'user_id,item_ids,worn_on', ignoreDuplicates: true },
        ),
    );
  }
}
