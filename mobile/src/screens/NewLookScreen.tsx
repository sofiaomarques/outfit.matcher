import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '../components/Chip';
import { OutfitCard } from '../components/OutfitCard';
import { StatusMessage } from '../components/StatusMessage';
import { useToast } from '../components/Toast';
import { useApiStatus } from '../hooks/useApiStatus';
import { useOutfitActions, useOutfitHistory } from '../hooks/useOutfitHistory';
import type { ClothingItem } from '../models/clothingItem';
import { outfitKey, type Outfit } from '../models/outfit';
import { ApiStatus } from '../services/apiStatus';
import { outfitHistory, type OutfitHistory } from '../services/outfitHistory';
import {
  RecommendationService,
  describeRecommendError,
  occasionKeys,
} from '../services/recommendation';
import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import { OutfitDetailScreen } from './OutfitDetailScreen';
import { useBackNavigation } from '../services/backNavigation';

const SUGGESTION_COUNT = 5;
const LOADING_WARDROBE = 'Carregando seu guarda-roupa...';

interface NewLookScreenProps {
  /** Nome escolhido no cadastro, pra saudação. */
  displayName?: string;
  recommender?: Pick<RecommendationService, 'loadWardrobe' | 'recommend'>;
  history?: OutfitHistory;
}

/**
 * Tela "Novo look": saudação personalizada, seguida de uma sugestão de look
 * pra ocasião selecionada, montada com as peças reais do guarda-roupa pelo
 * recomendador da API (`model/recomendar.py`). "Ver outra" percorre as
 * próximas sugestões.
 */
export function NewLookScreen({ displayName = '', recommender, history = outfitHistory }: NewLookScreenProps) {
  const service = useMemo(() => recommender ?? new RecommendationService(), [recommender]);
  const toast = useToast();
  useOutfitHistory(history);
  const actions = useOutfitActions(history);
  const waking = useApiStatus() === 'waking';

  const [items, setItems] = useState<ClothingItem[] | null>(null);
  const [occasion, setOccasion] = useState<string | null>(null);
  const [looks, setLooks] = useState<Outfit[]>([]);
  const [lookIndex, setLookIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState(LOADING_WARDROBE);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Outfit | null>(null);

  // Trocar de ocasião rápido dispara pedidos em paralelo; só o último vale.
  const requestId = useRef(0);
  const mounted = useRef(true);
  // Espelhos do estado pra callbacks assíncronos (desfazer, "não curti") lerem o valor atual.
  const latest = useRef({ looks, lookIndex, occasion, loading });
  latest.current = { looks, lookIndex, occasion, loading };

  const recommend = useCallback(
    async (wardrobe: ClothingItem[], forOccasion: string | null) => {
      const id = ++requestId.current;
      setLoading(true);
      setLoadingText('Montando seu look...');
      setError(null);
      setLooks([]);
      setLookIndex(0);
      try {
        const result = await service.recommend(wardrobe, {
          occasion: forOccasion,
          topK: SUGGESTION_COUNT,
        });
        if (!mounted.current || id !== requestId.current) return;
        setLooks(result);
      } catch (e) {
        if (!mounted.current || id !== requestId.current) return;
        setError(describeRecommendError(e, 'Não foi possível gerar o look. Tente de novo.'));
      }
      setLoading(false);
    },
    [service],
  );

  const loadWardrobe = useCallback(async () => {
    setLoading(true);
    setLoadingText(LOADING_WARDROBE);
    setError(null);
    try {
      const loaded = await service.loadWardrobe((done, total) => {
        if (mounted.current) setLoadingText(`Analisando suas peças (${done}/${total})...`);
      });
      if (!mounted.current) return;
      setItems(loaded);
      setLoading(false);
      if (latest.current.occasion) recommend(loaded, latest.current.occasion);
    } catch (e) {
      if (!mounted.current) return;
      setError(describeRecommendError(e, 'Não foi possível carregar seu guarda-roupa.'));
      setLoading(false);
    }
  }, [service, recommend]);

  useEffect(() => {
    mounted.current = true;
    loadWardrobe();
    // Sem o histórico, o coração só começa vazio; não trava a sugestão.
    history.load().catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, [loadWardrobe, history]);

  function selectOccasion(next: string) {
    setOccasion(next);
    if (items) recommend(items, next);
  }

  /** Devolve o look pra lista (desfazer / erro ao salvar), se a ocasião ainda é a mesma e ele não voltou. */
  function restoreLook(outfit: Outfit, label: string) {
    const now = latest.current;
    if (now.occasion !== label || now.loading) return;
    if (now.looks.some((look) => outfitKey(look) === outfitKey(outfit))) return;
    setLooks((current) => {
      const next = [...current];
      next.splice(now.lookIndex, 0, outfit);
      return next;
    });
  }

  /**
   * "Não curti": tira o look da lista na hora e salva a rejeição pra essa
   * ocasião (o recomendador não sugere mais esse look nela, e penaliza os
   * mesmos pares de peças). Sem sugestões sobrando, pede novas.
   */
  async function rejectCurrent() {
    const outfit = looks[lookIndex];
    const label = occasion!;
    const key = occasionKeys[label];
    const remaining = looks.filter((look) => outfitKey(look) !== outfitKey(outfit));
    setLooks(remaining);
    if (lookIndex >= remaining.length) setLookIndex(0);

    const saved = await history.reject(outfit, key);
    if (!mounted.current) return;
    if (!saved) {
      restoreLook(outfit, label);
      toast('Não foi possível salvar. Tente de novo.');
      return;
    }
    toast(`Não vamos mais sugerir esse look pra ${label.toLowerCase()}.`, {
      label: 'Desfazer',
      onPress: async () => {
        if (!(await history.undoReject(outfit, key)) || !mounted.current) return;
        const now = latest.current;
        // Pedindo novos looks (era a última sugestão): refaz o pedido, agora sem a rejeição.
        if (now.loading && now.occasion === label && items) recommend(items, label);
        else restoreLook(outfit, label);
      },
    });
    if (remaining.length === 0 && !latest.current.loading && items) recommend(items, label);
  }

  useBackNavigation(detail !== null, () => setDetail(null));

  if (detail) {
    return <OutfitDetailScreen outfit={detail} history={history} onBack={() => setDetail(null)} />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={text.headlineLarge}>{displayName ? `Olá, ${displayName}!!` : 'Olá!!'}</Text>
      <Text style={[text.titleMedium, { color: colors.textMuted, marginTop: 4 }]}>
        Qual a ocasião do dia?
      </Text>
      <View style={styles.chips}>
        {Object.keys(occasionKeys).map((label) => (
          <Chip
            key={label}
            label={label}
            selected={occasion === label}
            disabled={items === null}
            onPress={() => selectOccasion(label)}
          />
        ))}
      </View>

      <View style={{ flex: 1, marginTop: 28 }}>
        {loading ? (
          <StatusMessage message={waking ? ApiStatus.wakingMessage : loadingText} loading />
        ) : error ? (
          <StatusMessage
            message={error}
            onRetry={items === null ? loadWardrobe : () => recommend(items, occasion)}
          />
        ) : occasion === null ? (
          <StatusMessage message="Escolha uma ocasião pra ver a sugestão de look de hoje." />
        ) : looks.length === 0 ? (
          <StatusMessage
            message={
              'Ainda não dá pra montar um look: cadastre pelo menos uma peça de cima e uma de ' +
              'baixo, ou um vestido.'
            }
          />
        ) : (
          <Suggestion
            outfit={looks[lookIndex]}
            count={looks.length}
            index={lookIndex}
            isFavorite={history.isFavorite(looks[lookIndex])}
            onFavoriteToggle={() => actions.toggleFavorite(looks[lookIndex])}
            onOpen={() => setDetail(looks[lookIndex])}
            onReject={rejectCurrent}
            onNext={() => setLookIndex((lookIndex + 1) % looks.length)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

interface SuggestionProps {
  outfit: Outfit;
  count: number;
  index: number;
  isFavorite: boolean;
  onFavoriteToggle: () => void;
  onOpen: () => void;
  onReject: () => void;
  onNext: () => void;
}

function Suggestion({ outfit, count, index, isFavorite, onFavoriteToggle, onOpen, onReject, onNext }: SuggestionProps) {
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.cardArea}>
        <View style={styles.card}>
          <OutfitCard outfit={outfit} isFavorite={isFavorite} onFavoriteToggle={onFavoriteToggle} onPress={onOpen} />
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onReject} style={styles.action}>
          <Ionicons name="thumbs-down-outline" size={18} color={colors.wine} />
          <Text style={[text.label, { color: colors.wine }]}>Não curti</Text>
        </Pressable>
        {count > 1 && (
          <Pressable accessibilityRole="button" onPress={onNext} style={styles.action}>
            <Ionicons name="refresh" size={18} color={colors.wine} />
            <Text style={[text.label, { color: colors.wine }]}>{`Ver outra (${index + 1}/${count})`}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 320, aspectRatio: 0.85 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
});
