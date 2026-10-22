import type { ClothingCategory } from '../models/clothingCategory';
import type { ClothingItem } from '../models/clothingItem';
import { makeOutfit, type Outfit } from '../models/outfit';

export const garment = (id: string, category: ClothingCategory, swatch = 0xff7a1836): ClothingItem => ({
  id,
  name: id,
  category,
  swatch,
  isFavorite: false,
  features: { versao_features: 2 },
});

export const calca = garment('a-calca', 'bottom', 0xff6e87a8);
export const blusa = garment('b-blusa', 'top', 0xffe8a0bf);
export const saia = garment('c-saia', 'skirt');

export const lookOf = (...items: ClothingItem[]): Outfit =>
  makeOutfit({ id: items.map((i) => i.id).join('+'), items, tags: ['Trabalho'] });
