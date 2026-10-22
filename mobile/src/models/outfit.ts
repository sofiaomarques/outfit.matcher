import type { ClothingItem } from './clothingItem';

/**
 * Um look sugerido, equivalente ao dicionário `{"pecas": [...], "score": ...}`
 * de `/looks/recommend` (`model/recomendar.py`), com metadados pra UI.
 */
export interface Outfit {
  id: string;
  items: ClothingItem[];
  tags: string[];
  score: number;
}

export function makeOutfit(
  fields: Pick<Outfit, 'id' | 'items' | 'tags'> & { score?: number },
): Outfit {
  return { score: 1, ...fields };
}

export function sortedIds(ids: Iterable<string>): string[] {
  return [...ids].sort();
}

/** Identidade do look (favoritos, histórico de uso): ids ordenados e juntados. */
export function keyFor(ids: Iterable<string>): string {
  return sortedIds(ids).join('+');
}

/**
 * Ids das peças em ordem crescente: o mesmo look vira sempre a mesma lista,
 * não importa a ordem em que o recomendador devolveu as peças. É assim que
 * ele fica salvo em `outfit_favorites` / `outfit_wears`.
 */
export function outfitItemIds(outfit: Outfit): string[] {
  return sortedIds(outfit.items.map((item) => item.id));
}

export function outfitKey(outfit: Outfit): string {
  return keyFor(outfitItemIds(outfit));
}
