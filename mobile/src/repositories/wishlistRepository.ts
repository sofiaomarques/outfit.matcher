import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';

import type { WishlistItem } from '../models/wishlistItem';
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

const TABLE = 'wishlist_items';
const BUCKET = 'wishlist-images';

/**
 * Acesso à wishlist do usuário logado: peças que ela ainda não tem mas quer
 * comprar, com foto + descrição livre.
 *
 * Metadados ficam na tabela `wishlist_items` e a foto no bucket
 * `wishlist-images`, isolados por usuário via Row Level Security — ver
 * `supabase/schema.sql`.
 */
export class WishlistRepository {
  constructor(
    private readonly client: SupabaseClient = supabase,
    private readonly newId: () => string = randomUUID,
  ) {}

  async fetchItems(): Promise<WishlistItem[]> {
    const rows = unwrap(
      await this.client.from(TABLE).select().order('created_at', { ascending: false }),
    );
    const signed = await signImages(this.client, BUCKET, rows.map((row) => row.image_path as string));
    return rows.map((row) => toWishlistItem(row, signed.get(row.image_path)));
  }

  /** Gera URLs novas pros itens cuja URL venceu (ou vence logo); ver `WardrobeRepository.refreshImageUrls`. */
  async refreshImageUrls(items: WishlistItem[]): Promise<WishlistItem[]> {
    const stale = items.filter((i) => i.imagePath && needsUrlRefresh(i.imageUrlExpiresAt));
    if (stale.length === 0) return items;
    const signed = await signImages(this.client, BUCKET, stale.map((i) => i.imagePath!));
    return items.map((item) => {
      const fresh = item.imagePath ? signed.get(item.imagePath) : undefined;
      return fresh && stale.includes(item)
        ? { ...item, imageUrl: fresh.url, imageUrlExpiresAt: fresh.expiresAt }
        : item;
    });
  }

  async addItem(params: { description: string; imageBytes: Uint8Array }): Promise<WishlistItem> {
    const userId = await requireUserId(this.client);
    const id = this.newId();

    return uploadThenSave({
      client: this.client,
      bucket: BUCKET,
      userId,
      id,
      imageBytes: params.imageBytes,
      save: async (imagePath) => {
        const row = unwrap(
          await this.client
            .from(TABLE)
            .insert({ id, user_id: userId, description: params.description, image_path: imagePath })
            .select()
            .single(),
        );
        const signed = await signImages(this.client, BUCKET, [imagePath]);
        return toWishlistItem(row, signed.get(imagePath));
      },
    });
  }

  /** Apaga a linha e depois a foto; falha na foto só é registrada (ver `WardrobeRepository.deleteItem`). */
  async deleteItem(item: WishlistItem): Promise<void> {
    check(await this.client.from(TABLE).delete().eq('id', item.id));
    if (item.imagePath) {
      await removeImageQuietly(this.client, BUCKET, item.imagePath);
    }
  }
}

function toWishlistItem(row: Record<string, any>, signed?: SignedImage): WishlistItem {
  return {
    id: row.id,
    description: row.description,
    imagePath: row.image_path as string,
    imageUrl: signed?.url,
    imageUrlExpiresAt: signed?.expiresAt,
  };
}
