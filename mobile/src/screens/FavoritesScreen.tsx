import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GridList } from '../components/GridList';
import { OutfitCard } from '../components/OutfitCard';
import { StatusMessage } from '../components/StatusMessage';
import { useOutfitActions, useOutfitHistory } from '../hooks/useOutfitHistory';
import { CLOTHING_CATEGORIES } from '../models/clothingCategory';
import type { ClothingItem } from '../models/clothingItem';
import { keyFor, makeOutfit, type Outfit } from '../models/outfit';
import { WardrobeRepository } from '../repositories/wardrobeRepository';
import { outfitHistory, type OutfitHistory } from '../services/outfitHistory';
import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import { OutfitDetailScreen } from './OutfitDetailScreen';

interface FavoritesScreenProps {
  repository?: Pick<WardrobeRepository, 'fetchItems'>;
  history?: OutfitHistory;
}

/**
 * Tela "Favoritos": os looks salvos com o coração em qualquer tela, do mais
 * recente pro mais antigo, montados com as peças do guarda-roupa. Looks com
 * alguma peça que já foi apagada não aparecem.
 */
export function FavoritesScreen({ repository, history = outfitHistory }: FavoritesScreenProps) {
  const repo = useMemo(() => repository ?? new WardrobeRepository(), [repository]);
  useOutfitHistory(history);
  const actions = useOutfitActions(history);
  const [itemsById, setItemsById] = useState<Map<string, ClothingItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Outfit | null>(null);
  // Ids já procurados no guarda-roupa sem sucesso (peças apagadas): não
  // recarrega de novo por causa deles.
  const knownMissing = useRef(new Set<string>());
  const mounted = useRef(true);

  const unknownIds = useCallback(
    (byId: Map<string, ClothingItem>) =>
      history.favorites.flat().filter((id) => !byId.has(id)),
    [history],
  );

  const applyItems = useCallback(
    (items: ClothingItem[]) => {
      const byId = new Map(items.map((item) => [item.id, item]));
      knownMissing.current = new Set(unknownIds(byId));
      setItemsById(byId);
    },
    [unknownIds],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items] = await Promise.all([repo.fetchItems(), history.load()]);
      if (!mounted.current) return;
      applyItems(items);
    } catch {
      if (!mounted.current) return;
      setError('Não foi possível carregar seus favoritos.');
    }
    setLoading(false);
  }, [repo, history, applyItems]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  // Favoritado em outra aba um look com peça cadastrada depois que essa tela
  // carregou: busca o guarda-roupa de novo.
  const missing = unknownIds(itemsById);
  const hasNewMissing = missing.some((id) => !knownMissing.current.has(id));
  useEffect(() => {
    if (loading || !hasNewMissing) return;
    repo
      .fetchItems()
      .then((items) => mounted.current && applyItems(items))
      // Fica com o que já tinha; o look aparece na próxima abertura.
      .catch(() => {});
  }, [loading, hasNewMissing, repo, applyItems]);

  const outfits: Outfit[] = history.favorites
    .filter((ids) => ids.every((id) => itemsById.has(id)))
    .map((ids) =>
      makeOutfit({
        id: keyFor(ids),
        // Os ids ficam salvos em ordem de id; mostra de cima pra baixo.
        items: ids
          .map((id) => itemsById.get(id)!)
          .sort(
            (a, b) => CLOTHING_CATEGORIES.indexOf(a.category) - CLOTHING_CATEGORIES.indexOf(b.category),
          ),
        tags: [],
      }),
    );

  if (detail) {
    return (
      <OutfitDetailScreen outfit={detail} title="Look salvo" history={history} onBack={() => setDetail(null)} />
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={text.headlineLarge}>Favoritos</Text>
      <View style={{ flex: 1, marginTop: 20 }}>
        {loading ? (
          <StatusMessage message="Carregando seus favoritos..." loading />
        ) : error ? (
          <StatusMessage message={error} onRetry={load} />
        ) : outfits.length === 0 ? (
          <StatusMessage
            message={
              'Nenhum look salvo ainda. Toque no coração de um look em "Novo look" ou ' +
              '"Looks" pra guardar aqui.'
            }
          />
        ) : (
          <GridList
            data={outfits}
            maxItemWidth={260}
            aspectRatio={1.15}
            keyExtractor={(outfit) => outfit.id}
            renderItem={(outfit) => (
              <OutfitCard
                outfit={outfit}
                isFavorite
                onFavoriteToggle={() => actions.toggleFavorite(outfit)}
                onPress={() => setDetail(outfit)}
              />
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: 24 },
});
