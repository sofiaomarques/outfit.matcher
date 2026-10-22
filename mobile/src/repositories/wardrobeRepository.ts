import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';

import { categoryFromName, type ClothingCategory } from '../models/clothingCategory';
import type { ClothingItem } from '../models/clothingItem';
import { supabase } from '../services/supabase';
import {
  SIGNED_URL_TTL_SECONDS,
  check,
  detectImageContentType,
  requireUserId,
  unwrap,
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
    return Promise.all(rows.map((row) => this.toClothingItem(row)));
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
    const contentType = detectImageContentType(params.imageBytes);
    const extension = contentType === 'image/png' ? 'png' : 'jpg';
    const storagePath = `${userId}/${id}.${extension}`;

    check(
      await this.client.storage.from(BUCKET).upload(storagePath, params.imageBytes, { contentType }),
    );

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
    return this.toClothingItem(row);
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

  async deleteItem(item: ClothingItem): Promise<void> {
    check(await this.client.from(TABLE).delete().eq('id', item.id));
    if (item.storagePath) {
      check(await this.client.storage.from(BUCKET).remove([item.storagePath]));
    }
  }

  private async toClothingItem(row: Record<string, any>): Promise<ClothingItem> {
    const imagePath = row.image_path as string;
    const { signedUrl } = unwrap(
      await this.client.storage.from(BUCKET).createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS),
    );
    return {
      id: row.id,
      name: row.name,
      category: categoryFromName(row.category),
      swatch: row.swatch_color,
      imageUrl: signedUrl,
      storagePath: imagePath,
      isFavorite: row.is_favorite,
      features: row.features ?? null,
    };
  }
}
