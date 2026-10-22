import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';

import { categoryFromName, type ClothingCategory } from '../models/clothingCategory';
import type { ClothingItem } from '../models/clothingItem';
import { supabase } from '../services/supabase';
import {
  check,
  needsUrlRefresh,
  removeImageQuietly,
  requireUserId,
  signImages,
  unwrap,
  uploadThenSave,
  type SignedImage,
} from './supabaseHelpers';

const TABLE = 'clothing_items';
const BUCKET = 'clothing-images';

/**
 * Acesso ao guarda-roupa do usuário logado.
 *
 * Metadados de cada peça ficam na tabela `clothing_items` e a foto no bucket
 * `clothing-images`, isolados por usuário via Row Level Security — ver
 * `supabase/schema.sql`. As features extraídas pela API Python
 * (`/items/analyze`) ficam na coluna jsonb `features`; peças salvas com a API
 * fora do ar entram com `features` nulo e podem ser analisadas depois via
 * [updateFeatures].
 */
export class WardrobeRepository {
  constructor(
    private readonly client: SupabaseClient = supabase,
    private readonly newId: () => string = randomUUID,
  ) {}

  async fetchItems(): Promise<ClothingItem[]> {
    const rows = unwrap(
      await this.client.from(TABLE).select().order('created_at', { ascending: false }),
    );
    const signed = await signImages(this.client, BUCKET, rows.map((row) => row.image_path as string));
    const items: ClothingItem[] = [];
    for (const row of rows) {
      // Uma linha com categoria que o app não conhece não pode esconder o resto.
      try {
        items.push(toClothingItem(row, signed.get(row.image_path)));
      } catch (error) {
        console.warn(`Peça ${row.id} ignorada:`, error);
      }
    }
    return items;
  }

  /**
   * Gera URLs novas pras peças cuja URL venceu (ou vence logo). Devolve a
   * mesma lista, com as peças renovadas trocadas; se nada vence, devolve a
   * própria lista recebida.
   */
  async refreshImageUrls(items: ClothingItem[]): Promise<ClothingItem[]> {
    const stale = items.filter((i) => i.storagePath && needsUrlRefresh(i.imageUrlExpiresAt));
    if (stale.length === 0) return items;
    const signed = await signImages(this.client, BUCKET, stale.map((i) => i.storagePath!));
    return items.map((item) => {
      const fresh = item.storagePath ? signed.get(item.storagePath) : undefined;
      return fresh && stale.includes(item)
        ? { ...item, imageUrl: fresh.url, imageUrlExpiresAt: fresh.expiresAt }
        : item;
    });
  }

  async addItem(params: {
    name: string;
    category: ClothingCategory;
    imageBytes: Uint8Array;
    swatch: number;
    features?: Record<string, unknown> | null;
  }): Promise<ClothingItem> {
    const userId = await requireUserId(this.client);
    const id = this.newId();

    return uploadThenSave({
      client: this.client,
      bucket: BUCKET,
      userId,
      id,
      imageBytes: params.imageBytes,
      save: async (storagePath) => {
        const row = unwrap(
          await this.client
            .from(TABLE)
            .insert({
              id,
              user_id: userId,
              name: params.name,
              category: params.category,
              image_path: storagePath,
              swatch_color: params.swatch,
              features: params.features ?? null,
            })
            .select()
            .single(),
        );
        const signed = await signImages(this.client, BUCKET, [storagePath]);
        return toClothingItem(row, signed.get(storagePath));
      },
    });
  }

  async setFavorite(item: ClothingItem, isFavorite: boolean): Promise<void> {
    check(await this.client.from(TABLE).update({ is_favorite: isFavorite }).eq('id', item.id));
  }

  async updateFeatures(
    item: ClothingItem,
    features: Record<string, unknown>,
    swatch?: number,
  ): Promise<void> {
    const values = { features, ...(swatch !== undefined && { swatch_color: swatch }) };
    check(await this.client.from(TABLE).update(values).eq('id', item.id));
  }

  /**
   * Baixa a foto já salva de uma peça — usado pra analisar peças antigas,
   * cadastradas antes da análise automática existir.
   */
  async downloadImage(item: ClothingItem): Promise<Uint8Array> {
    const blob = unwrap(await this.client.storage.from(BUCKET).download(item.storagePath!));
    return new Uint8Array(await blob.arrayBuffer());
  }

  /**
   * Apaga a linha e depois a foto. Se a foto não sair do Storage, a peça já
   * foi embora do ponto de vista da usuária: o erro só é registrado (ver
   * `removeImageQuietly`), em vez de fazer a tela achar que a exclusão falhou.
   */
  async deleteItem(item: ClothingItem): Promise<void> {
    check(await this.client.from(TABLE).delete().eq('id', item.id));
    if (item.storagePath) {
      await removeImageQuietly(this.client, BUCKET, item.storagePath);
    }
  }
}

function toClothingItem(row: Record<string, any>, signed?: SignedImage): ClothingItem {
  return {
    id: row.id,
    name: row.name,
    category: categoryFromName(row.category),
    swatch: row.swatch_color,
    imageUrl: signed?.url,
    imageUrlExpiresAt: signed?.expiresAt,
    storagePath: row.image_path as string,
    isFavorite: row.is_favorite,
    features: row.features ?? null,
  };
}
