import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { GridList } from '../components/GridList';
import { StatusMessage } from '../components/StatusMessage';
import { useToast } from '../components/Toast';
import type { WishlistItem } from '../models/wishlistItem';
import { WishlistRepository } from '../repositories/wishlistRepository';
import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import { AddWishlistItemScreen } from './AddWishlistItemScreen';
import { useBackNavigation } from '../services/backNavigation';

type WishlistStore = Pick<WishlistRepository, 'fetchItems' | 'addItem' | 'deleteItem'>;

/**
 * Tela "Wishlist": grade de peças que a usuária ainda não tem mas quer
 * comprar (foto + descrição livre), carregadas do Supabase.
 */
export function WishlistScreen({ repository }: { repository?: WishlistStore }) {
  const repo = useMemo(() => repository ?? new WishlistRepository(), [repository]);
  const toast = useToast();
  const [items, setItems] = useState<WishlistItem[]>([]);
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
      setError('Não foi possível carregar sua wishlist.');
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

  async function deleteItem(item: WishlistItem) {
    const index = items.findIndex((i) => i.id === item.id);
    setItems((current) => current.filter((i) => i.id !== item.id));
    try {
      await repo.deleteItem(item);
    } catch {
      if (!mounted.current) return;
      // Devolve só este item (na posição de antes), sem desfazer outras remoções.
      setItems((current) => {
        const next = [...current];
        next.splice(Math.min(index, next.length), 0, item);
        return next;
      });
      toast('Não foi possível remover. Tente de novo.');
    }
  }

  useBackNavigation(adding, () => setAdding(false));

  if (adding) {
    return (
      <AddWishlistItemScreen
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
        <Ionicons name="cart-outline" size={24} color={colors.wine} />
        <Text style={[text.headlineLarge, { flex: 1 }]}>Wishlist</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Adicionar à wishlist"
          onPress={() => setAdding(true)}
          style={styles.addButton}
        >
          <Ionicons name="add" size={24} color={colors.white} />
        </Pressable>
      </View>

      <View style={{ flex: 1, marginTop: 20 }}>
        {loading ? (
          <StatusMessage message="Carregando..." loading />
        ) : error ? (
          <StatusMessage message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <View style={{ opacity: 0.5 }}>
              <Ionicons name="cart-outline" size={40} color={colors.pink} />
            </View>
            <Text style={[text.bodyLarge, { color: colors.textMuted }]}>
              Nenhuma peça na wishlist ainda.
            </Text>
          </View>
        ) : (
          <GridList
            data={items}
            maxItemWidth={220}
            aspectRatio={0.78}
            keyExtractor={(item) => item.id}
            renderItem={(item) => <WishlistCard item={item} onDelete={() => deleteItem(item)} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function WishlistCard({ item, onDelete }: { item: WishlistItem; onDelete: () => void }) {
  return (
    <Card style={{ flex: 1 }}>
      <View style={styles.cardBody}>
        <View style={{ flex: 1 }}>
          {item.imageUrl ? (
            <Image
              accessibilityLabel={item.description}
              source={{ uri: item.imageUrl }}
              resizeMode="cover"
              style={styles.image}
            />
          ) : (
            <View style={[styles.image, styles.placeholder]}>
              <Ionicons name="cart-outline" size={36} color={colors.wine} />
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remover da wishlist"
            onPress={onDelete}
            hitSlop={8}
            style={styles.remove}
          >
            <Ionicons name="close" size={20} color={colors.wine} />
          </Pressable>
        </View>
        <Text numberOfLines={2} style={[text.bodyMedium, { color: colors.textDark, marginTop: 8 }]}>
          {item.description}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  cardBody: { flex: 1, padding: 10 },
  image: { flex: 1, borderRadius: 16 },
  placeholder: { backgroundColor: colors.pinkLight, alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: 0, right: 0, padding: 4 },
});
