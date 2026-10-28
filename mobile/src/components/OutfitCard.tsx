import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { Outfit } from '../models/outfit';
import { colors } from '../theme/colors';
import { Card } from './Card';
import { GarmentThumbnail } from './GarmentThumbnail';

interface OutfitCardProps {
  outfit: Outfit;
  isFavorite: boolean;
  onFavoriteToggle: () => void;
  onPress?: () => void;
}

/**
 * Card de um look: colagem das peças que o compõem, com favoritar. As
 * miniaturas ficam numa única linha e se redimensionam pro espaço disponível.
 */
export function OutfitCard({ outfit, isFavorite, onFavoriteToggle, onPress }: OutfitCardProps) {
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea((prev) => (prev?.width === width && prev?.height === height ? prev : { width, height }));
  };
  // Cada miniatura é um quadrado que cabe tanto na largura (dividida pelas
  // peças) quanto na altura: um look de peça única não estoura o card.
  const size = area ? Math.max(0, Math.floor(Math.min(area.width / outfit.items.length - 6, area.height))) : 0;

  return (
    <Card style={{ flex: 1 }}>
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? 'Abrir look' : undefined}
        disabled={!onPress}
        onPress={onPress}
        style={styles.body}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? 'Desfavoritar look' : 'Favoritar look'}
          onPress={onFavoriteToggle}
          hitSlop={12}
          style={styles.heart}
        >
          <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={20} color={colors.wine} />
        </Pressable>
        <View style={styles.row} onLayout={onLayout}>
          {size > 0 &&
            outfit.items.map((item) => (
              <View key={item.id} style={styles.thumb}>
                <GarmentThumbnail item={item} size={size} />
              </View>
            ))}
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 12 },
  heart: { alignSelf: 'flex-end', marginBottom: 4 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  thumb: { paddingHorizontal: 3 },
});
