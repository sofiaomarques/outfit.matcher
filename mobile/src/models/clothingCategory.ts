import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Categorias de peça exibidas nas abas do guarda-roupa. Os valores são os mesmos `name` do enum Dart (coluna `category`). */
export const CLOTHING_CATEGORIES = ['top', 'bottom', 'skirt', 'dress', 'accessory'] as const;

export type ClothingCategory = (typeof CLOTHING_CATEGORIES)[number];

export const categoryInfo: Record<ClothingCategory, { label: string; icon: IconName }> = {
  top: { label: 'Tops', icon: 'shirt-outline' },
  bottom: { label: 'Calças', icon: 'walk-outline' },
  skirt: { label: 'Saias', icon: 'woman-outline' },
  dress: { label: 'Vestidos', icon: 'sparkles-outline' },
  accessory: { label: 'Acessórios', icon: 'bag-handle-outline' },
};

/** Equivale ao `ClothingCategory.values.byName` do Dart: lança se o nome não existir. */
export function categoryFromName(name: string): ClothingCategory {
  if ((CLOTHING_CATEGORIES as readonly string[]).includes(name)) return name as ClothingCategory;
  throw new Error(`Categoria desconhecida: ${name}`);
}
