import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';

import { categoryInfo } from '../models/clothingCategory';
import { swatchToHex, type ClothingItem } from '../models/clothingItem';
import { colors } from '../theme/colors';

/** Lado (px) da miniatura pedida ao Storage quando o tamanho não é fixo: célula máxima do grid (220) em 2x. */
const GRID_THUMB_PX = 440;

/**
 * Vira true na primeira miniatura que o Storage não serve (plano sem image
 * transformations): dali em diante pedimos a original direto, sem gastar uma
 * requisição que falha por peça a cada montagem do grid.
 */
let transformsUnavailable = false;

/** Só para os testes: volta ao estado inicial do módulo. */
export function resetTransformsUnavailable() {
  transformsUnavailable = false;
}

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
  // Guardam a URL que falhou, não um booleano: quando a assinatura renova, a nova URL tenta de novo.
  const [thumbFailedFor, setThumbFailedFor] = useState<string>();
  const [failedFor, setFailedFor] = useState<string>();
  const box = size ? { width: size, height: size } : styles.fill;

  if (item.imageUrl && failedFor !== item.imageUrl) {
    const original = item.imageUrl;
    const px = size ? Math.ceil(size * PixelRatio.get()) : GRID_THUMB_PX;
    const useOriginal = transformsUnavailable || thumbFailedFor === original;
    const uri = useOriginal ? original : thumbnailUrl(original, px);
    // A URL assinada muda a cada hora; sem chave própria o cache de disco jogaria as fotos fora a cada renovação.
    const base = item.storagePath ?? item.id;
    const cacheKey = uri === original ? `${base}:original` : `${base}:${px}`;
    return (
      <Image
        accessibilityLabel={item.name}
        source={{ uri, cacheKey }}
        cachePolicy="disk"
        contentFit="cover"
        transition={150}
        onError={() => {
          if (uri === original) return setFailedFor(original);
          transformsUnavailable = true;
          setThumbFailedFor(original);
        }}
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
