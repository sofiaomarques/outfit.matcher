import type { ClothingCategory } from './clothingCategory';

/**
 * Uma peça do guarda-roupa. Peças vindas do Supabase (ver WardrobeRepository)
 * trazem `imageUrl` preenchida; sem ela, a peça é representada por um
 * placeholder colorido no estilo catálogo.
 */
export interface ClothingItem {
  id: string;
  name: string;
  category: ClothingCategory;
  /** Cor dominante da peça (ARGB de 32 bits sem sinal, como na coluna `swatch_color`). */
  swatch: number;
  /** URL (assinada) da foto no Supabase Storage. */
  imageUrl?: string;
  /** Caminho da foto dentro do bucket `clothing-images`. */
  storagePath?: string;
  isFavorite: boolean;
  /**
   * Saída de `/items/analyze` (cor, categoria detectada, formalidade,
   * embedding...). Nula enquanto a peça não foi analisada — o recomendador
   * ignora peças sem features.
   */
  features: Record<string, unknown> | null;
}

/** `#rrggbb` a partir do ARGB, pra usar como cor de estilo. */
export function swatchToHex(argb: number): string {
  return `#${(argb & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** ARGB opaco a partir de `#rrggbb`. */
export function hexToSwatch(hex: string): number {
  return (0xff000000 | parseInt(hex.replace('#', ''), 16)) >>> 0;
}
