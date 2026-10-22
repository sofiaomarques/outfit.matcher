import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';

import type { WishlistItem } from '../models/wishlistItem';
import { supabase } from '../services/supabase';
import {
  SIGNED_URL_TTL_SECONDS,
  check,
  detectImageContentType,
  requireUserId,
  unwrap,
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
    return Promise.all(rows.map((row) => this.toWishlistItem(row)));
  }

  async addItem(params: { description: string; imageBytes: Uint8Array }): Promise<WishlistItem> {
    const userId = await requireUserId(this.client);
    const id = this.newId();
    const contentType = detectImageContentType(params.imageBytes);
    const extension = contentType === 'image/png' ? 'png' : 'jpg';
    const imagePath = `${userId}/${id}.${extension}`;

    check(
      await this.client.storage.from(BUCKET).upload(imagePath, params.imageBytes, { contentType }),
    );

    const row = unwrap(
      await this.client
        .from(TABLE)
        .insert({ id, user_id: userId, description: params.description, image_path: imagePath })
        .select()
        .single(),
    );
    return this.toWishlistItem(row);
  }

  async deleteItem(item: WishlistItem): Promise<void> {
    check(await this.client.from(TABLE).delete().eq('id', item.id));
    if (item.imagePath) {
      check(await this.client.storage.from(BUCKET).remove([item.imagePath]));
    }
  }

  private async toWishlistItem(row: Record<string, any>): Promise<WishlistItem> {
    const imagePath = row.image_path as string;
    const { signedUrl } = unwrap(
      await this.client.storage.from(BUCKET).createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS),
    );
    return { id: row.id, description: row.description, imagePath, imageUrl: signedUrl };
  }
}
