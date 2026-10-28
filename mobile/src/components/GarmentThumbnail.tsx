import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { categoryInfo } from '../models/clothingCategory';
import { swatchToHex, type ClothingItem } from '../models/clothingItem';
import { colors } from '../theme/colors';

/** Lado (px) da miniatura pedida ao Storage quando o tamanho não é fixo: célula máxima do grid (220) em 2x. */
const GRID_THUMB_PX = 440;

/**
 * Troca a URL assinada de `/object/sign/` pela de `/render/image/sign/`, que
 * serve a foto redimensionada (image transformations do Supabase) com o mesmo
 * token. URLs de outro formato voltam como vieram.
 */
export function thumbnailUrl(url: string, px: number): string {
  if (!url.includes('/storage/v1/object/sign/')) return url;
  const resized = url.replace('/storage/v1/object/sign/', '/storage/v1/render/image/sign/');
  return `${resized}${resized.includes('?') ? '&' : '?'}width=${px}&height=${px}&resize=cover`;
}

/**
 * Miniatura de uma peça no estilo "foto de catálogo". Sem foto (ou se ela
 * não carregar), usa um placeholder colorido com o ícone da categoria.
 * Pede ao Storage uma miniatura; se ele não a servir (transformações
 * indisponíveis), cai na foto original antes de desistir.
 */
export const GarmentThumbnail = memo(function GarmentThumbnail({
  item,
  size,
}: {
  item: ClothingItem;
  size?: number;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = size ? { width: size, height: size } : styles.fill;

  if (item.imageUrl && !failed) {
    const uri = thumbFailed ? item.imageUrl : thumbnailUrl(item.imageUrl, size ? size * 2 : GRID_THUMB_PX);
    return (
      <Image
        accessibilityLabel={item.name}
        source={{ uri }}
        cachePolicy="disk"
        contentFit="cover"
        transition={150}
        recyclingKey={item.id}
        onError={() => (thumbFailed || uri === item.imageUrl ? setFailed(true) : setThumbFailed(true))}
        style={[box, styles.image]}
      />
    );
  }
  const hex = swatchToHex(item.swatch);
  return (
    <View
      style={[box, styles.placeholder, { backgroundColor: `${hex}2e`, borderColor: `${hex}80` }]}
    >
      <Ionicons name={categoryInfo[item.category].icon} size={36} color={colors.wine} />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1, alignSelf: 'stretch' },
  image: { borderRadius: 16 },
  placeholder: { borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
