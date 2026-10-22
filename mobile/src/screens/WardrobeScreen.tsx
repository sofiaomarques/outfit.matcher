import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { GridList } from '../components/GridList';
import { GarmentThumbnail } from '../components/GarmentThumbnail';
import { PaintedHeart } from '../components/PaintedHeart';
import { StatusMessage } from '../components/StatusMessage';
import { CLOTHING_CATEGORIES, categoryInfo, type ClothingCategory } from '../models/clothingCategory';
import type { ClothingItem } from '../models/clothingItem';
import { WardrobeRepository } from '../repositories/wardrobeRepository';
import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import { AddItemScreen } from './AddItemScreen';

const PADDING = 24;

type WardrobeStore = Pick<WardrobeRepository, 'fetchItems' | 'setFavorite' | 'addItem'>;

/** Tela "Meu guarda-roupa": grid de peças filtrável por categoria, carregadas do Supabase. */
export function WardrobeScreen({ repository }: { repository?: WardrobeStore }) {
  const repo = useMemo(() => repository ?? new WardrobeRepository(), [repository]);
  const [selected, setSelected] = useState<ClothingCategory | null>(null);
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await repo.fetchItems();
      if (!mounted.current) return;
      setItems(loaded);
    } catch {
      if (!mounted.current) return;
      setError('Não foi possível carregar seu guarda-roupa.');
    }
    setLoading(false);
  }, [repo]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  async function toggleFavorite(item: ClothingItem) {
    const isFavorite = !item.isFavorite;
    setItems((current) => current.map((c) => (c.id === item.id ? { ...c, isFavorite } : c)));
    try {
      await repo.setFavorite(item, isFavorite);
    } catch {
      if (mounted.current) load();
    }
  }

  const visible = selected ? items.filter((item) => item.category === selected) : items;

  if (adding) {
    return (
      <AddItemScreen
        repository={repo}
        onClose={(added) => {
          setAdding(false);
          if (added) load();
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Ionicons name="shirt-outline" size={24} color={colors.wine} />
        <Text style={[text.headlineLarge, { flex: 1 }]}>Meu guarda-roupa</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Adicionar peça"
          onPress={() => setAdding(true)}
          style={styles.addButton}
        >
          <Ionicons name="add" size={24} color={colors.white} />
        </Pressable>
      </View>

      <CategoryTabs selected={selected} onSelected={setSelected} />

      <View style={{ flex: 1, marginTop: 20 }}>
        {loading ? (
          <StatusMessage message="Carregando..." loading />
        ) : error ? (
          <StatusMessage message={error} onRetry={load} />
        ) : visible.length === 0 ? (
          <View style={styles.empty}>
            <View style={{ opacity: 0.5 }}>
              <PaintedHeart size={40} color={colors.pink} rotation={-0.1} />
            </View>
            <Text style={[text.bodyLarge, { color: colors.textMuted }]}>
              Nenhuma peça nessa categoria ainda.
            </Text>
          </View>
        ) : (
          <GridList
            data={visible}
            maxItemWidth={220}
            aspectRatio={0.82}
            keyExtractor={(item) => item.id}
            renderItem={(item) => (
              <GarmentCard item={item} onFavoriteToggle={() => toggleFavorite(item)} />
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function CategoryTabs({
  selected,
  onSelected,
}: {
  selected: ClothingCategory | null;
  onSelected: (category: ClothingCategory | null) => void;
}) {
  const tabs: { key: string; label: string; value: ClothingCategory | null }[] = [
    { key: 'all', label: 'Todos', value: null },
    ...CLOTHING_CATEGORIES.map((c) => ({ key: c, label: categoryInfo[c].label, value: c })),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      {tabs.map((tab) => {
        const isSelected = selected === tab.value;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelected(tab.value)}
            style={styles.tab}
          >
            <Text
              style={[
                text.titleMedium,
                { color: isSelected ? colors.wine : colors.textMuted },
                isSelected && { fontFamily: 'Quicksand_700Bold' },
              ]}
            >
              {tab.label}
            </Text>
            <View
              style={[styles.underline, { backgroundColor: isSelected ? colors.wine : 'transparent' }]}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function GarmentCard({ item, onFavoriteToggle }: { item: ClothingItem; onFavoriteToggle: () => void }) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardBody}>
        <View style={{ flex: 1 }}>
          <GarmentThumbnail item={item} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.isFavorite ? 'Desfavoritar peça' : 'Favoritar peça'}
            onPress={onFavoriteToggle}
            hitSlop={8}
            style={styles.heart}
          >
            <Ionicons
              name={item.isFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={colors.wine}
            />
          </Pressable>
        </View>
        <View style={styles.cardFooter}>
          <Text numberOfLines={1} style={[text.bodyMedium, { color: colors.textDark, flex: 1 }]}>
            {item.name}
          </Text>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: PADDING },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tab: { marginRight: 20, alignItems: 'center' },
  underline: { height: 2, width: 28, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  card: { flex: 1 },
  cardBody: { flex: 1, padding: 10 },
  heart: { position: 'absolute', top: 0, right: 0, padding: 4 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 },
});
