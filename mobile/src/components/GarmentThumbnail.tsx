import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { categoryInfo } from '../models/clothingCategory';
import { swatchToHex, type ClothingItem } from '../models/clothingItem';
import { colors } from '../theme/colors';

/**
 * Miniatura de uma peça no estilo "foto de catálogo". Sem foto (ou se ela
 * não carregar), usa um placeholder colorido com o ícone da categoria.
 */
export function GarmentThumbnail({ item, size }: { item: ClothingItem; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = size ? { width: size, height: size } : styles.fill;

  if (item.imageUrl && !failed) {
    return (
      <Image
        accessibilityLabel={item.name}
        source={{ uri: item.imageUrl }}
        resizeMode="cover"
        onError={() => setFailed(true)}
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
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignSelf: 'stretch' },
  image: { borderRadius: 16 },
  placeholder: { borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
