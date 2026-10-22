import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { GarmentThumbnail } from '../components/GarmentThumbnail';
import { StarShape } from '../components/StarShape';
import { useOutfitActions, useOutfitHistory } from '../hooks/useOutfitHistory';
import { swatchToHex } from '../models/clothingItem';
import type { Outfit } from '../models/outfit';
import { describeLastWorn, outfitHistory, type OutfitHistory } from '../services/outfitHistory';
import { colors } from '../theme/colors';
import { text } from '../theme/fonts';

const WIDE_BREAKPOINT = 640;

interface OutfitDetailScreenProps {
  outfit: Outfit;
  title?: string;
  onBack: () => void;
  history?: OutfitHistory;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Detalhe de um look ("Look do dia" no mockup): colagem maior das peças, tags
 * e paleta de cores, com salvar nos favoritos e marcar como usado hoje.
 */
export function OutfitDetailScreen({
  outfit,
  title = 'Look do dia',
  onBack,
  history = outfitHistory,
}: OutfitDetailScreenProps) {
  useOutfitHistory(history);
  const actions = useOutfitActions(history);
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const saved = history.isFavorite(outfit);
  const lastWorn = history.lastWorn(outfit);
  const wornToday = lastWorn !== undefined && isSameDay(lastWorn, new Date());

  const collage = (
    <View style={styles.collage}>
      {outfit.items.map((item) => (
        <GarmentThumbnail key={item.id} item={item} size={140} />
      ))}
    </View>
  );

  const info = (
    <View>
      <View style={styles.titleRow}>
        <StarShape size={22} color={colors.wine} />
        <Text style={text.headlineMedium}>{title}</Text>
      </View>

      <View style={styles.tags}>
        {outfit.tags.map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={[text.bodyMedium, { color: colors.wine }]}>{tag}</Text>
          </View>
        ))}
      </View>

      <Text style={[text.titleMedium, { marginTop: 24 }]}>Paleta de cores</Text>
      <View style={styles.palette}>
        {outfit.items.map((item) => (
          <View
            key={item.id}
            accessibilityLabel={`Cor de ${item.name}`}
            style={[styles.swatch, { backgroundColor: swatchToHex(item.swatch) }]}
          />
        ))}
      </View>

      <View style={styles.buttons}>
        <Button
          label={saved ? '♥ Look salvo' : '♡ Salvar look'}
          onPress={() => actions.toggleFavorite(outfit)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: wornToday }}
          disabled={wornToday}
          onPress={() => actions.markWorn(outfit)}
          style={[styles.outlined, wornToday && { opacity: 0.5 }]}
        >
          <Text style={[text.label, { color: colors.wine }]}>
            {wornToday ? '✓ Usado hoje' : 'Usei hoje'}
          </Text>
        </Pressable>
      </View>

      {lastWorn !== undefined && !wornToday && (
        <Text style={[text.bodyMedium, { marginTop: 12 }]}>{describeLastWorn(lastWorn)}</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} style={styles.back}>
        <Ionicons name="arrow-back" size={24} color={colors.wine} />
        <Text style={[text.titleMedium, { color: colors.wine }]}>Voltar</Text>
      </Pressable>
      {isWide ? (
        <View style={styles.wideRow}>
          <View style={{ flex: 5 }}>{collage}</View>
          <View style={{ flex: 4 }}>{info}</View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ gap: 24 }}>
          {collage}
          {info}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: 24 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, alignSelf: 'flex-start' },
  wideRow: { flex: 1, flexDirection: 'row', gap: 32, alignItems: 'flex-start' },
  collage: {
    backgroundColor: colors.pinkPale,
    borderRadius: 24,
    padding: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  tag: { backgroundColor: colors.pinkLight, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  palette: { flexDirection: 'row', gap: 10, marginTop: 12 },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 32, alignItems: 'center' },
  outlined: {
    borderWidth: 1,
    borderColor: colors.wine,
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
});
