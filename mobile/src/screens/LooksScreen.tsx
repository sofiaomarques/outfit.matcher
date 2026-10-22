import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '../components/Chip';
import { GridList } from '../components/GridList';
import { OutfitCard } from '../components/OutfitCard';
import { StatusMessage } from '../components/StatusMessage';
import { useApiStatus } from '../hooks/useApiStatus';
import { useOutfitActions, useOutfitHistory } from '../hooks/useOutfitHistory';
import type { ClothingItem } from '../models/clothingItem';
import type { Outfit } from '../models/outfit';
import { ApiStatus } from '../services/apiStatus';
import { outfitHistory, type OutfitHistory } from '../services/outfitHistory';
import { RecommendationService, describeRecommendError } from '../services/recommendation';
import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import { OutfitDetailScreen } from './OutfitDetailScreen';

const WEATHER_FILTERS = ['Qualquer clima', 'Calor', 'Frio', 'Chuva'];
const PER_PAGE = 6;
const LOOK_COUNT = 24;

interface LooksScreenProps {
  recommender?: Pick<RecommendationService, 'loadWardrobe' | 'recommend'>;
  history?: OutfitHistory;
}

/**
 * Tela "Seus looks": looks sugeridos pelo recomendador a partir do
 * guarda-roupa real, em páginas de 6, refeitos a cada troca do filtro de clima.
 */
export function LooksScreen({ recommender, history = outfitHistory }: LooksScreenProps) {
  const service = useMemo(() => recommender ?? new RecommendationService(), [recommender]);
  useOutfitHistory(history);
  const actions = useOutfitActions(history);
  const waking = useApiStatus() === 'waking';

  const [weather, setWeather] = useState(WEATHER_FILTERS[0]);
  const [items, setItems] = useState<ClothingItem[] | null>(null);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Carregando seu guarda-roupa...');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Outfit | null>(null);

  // Trocar de clima rápido dispara pedidos em paralelo; só o último vale.
  const requestId = useRef(0);
  const mounted = useRef(true);

  const recommend = useCallback(
    async (wardrobe: ClothingItem[], forWeather: string) => {
      const id = ++requestId.current;
      setLoading(true);
      setLoadingText('Montando seus looks...');
      setError(null);
      try {
        const result = await service.recommend(wardrobe, { weather: forWeather, topK: LOOK_COUNT });
        if (!mounted.current || id !== requestId.current) return;
        setOutfits(result);
        setPage(0);
      } catch (e) {
        if (!mounted.current || id !== requestId.current) return;
        setError(describeRecommendError(e, 'Não foi possível gerar os looks. Tente de novo.'));
      }
      setLoading(false);
    },
    [service],
  );

  const loadWardrobe = useCallback(async () => {
    setLoading(true);
    setLoadingText('Carregando seu guarda-roupa...');
    setError(null);
    try {
      const loaded = await service.loadWardrobe((done, total) => {
        if (mounted.current) setLoadingText(`Analisando suas peças (${done}/${total})...`);
      });
      if (!mounted.current) return;
      setItems(loaded);
      await recommend(loaded, WEATHER_FILTERS[0]);
    } catch (e) {
      if (!mounted.current) return;
      setError(describeRecommendError(e, 'Não foi possível carregar seu guarda-roupa.'));
      setLoading(false);
    }
  }, [service, recommend]);

  useEffect(() => {
    mounted.current = true;
    loadWardrobe();
    // Sem o histórico, os corações só começam vazios; não trava os looks.
    history.load().catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, [loadWardrobe, history]);

  function selectWeather(next: string) {
    setWeather(next);
    if (items) recommend(items, next);
  }

  if (detail) {
    return <OutfitDetailScreen outfit={detail} history={history} onBack={() => setDetail(null)} />;
  }

  const pageCount = Math.ceil(outfits.length / PER_PAGE);
  const visible = outfits.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={text.headlineLarge}>Seus looks</Text>
      <View style={styles.chips}>
        {WEATHER_FILTERS.map((option) => (
          <Chip
            key={option}
            label={option}
            selected={weather === option}
            disabled={items === null}
            onPress={() => selectWeather(option)}
          />
        ))}
      </View>

      <View style={{ flex: 1, marginTop: 20 }}>
        {loading ? (
          <StatusMessage message={waking ? ApiStatus.wakingMessage : loadingText} loading />
        ) : error ? (
          <StatusMessage
            message={error}
            onRetry={items === null ? loadWardrobe : () => recommend(items, weather)}
          />
        ) : outfits.length === 0 ? (
          <StatusMessage
            message={
              'Ainda não dá pra montar looks: cadastre pelo menos uma peça de cima e uma de ' +
              'baixo, ou um vestido.'
            }
          />
        ) : (
          <GridList
            data={visible}
            maxItemWidth={260}
            aspectRatio={1.15}
            keyExtractor={(outfit) => outfit.id}
            renderItem={(outfit) => (
              <OutfitCard
                outfit={outfit}
                isFavorite={history.isFavorite(outfit)}
                onFavoriteToggle={() => actions.toggleFavorite(outfit)}
                onPress={() => setDetail(outfit)}
              />
            )}
          />
        )}
      </View>

      {pageCount > 1 && !loading && !error && (
        <View style={styles.pager}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Página anterior"
            disabled={page === 0}
            onPress={() => setPage(page - 1)}
            style={page === 0 && { opacity: 0.3 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.wine} />
          </Pressable>
          {Array.from({ length: pageCount }, (_, i) => (
            <View
              key={i}
              style={[styles.dot, { backgroundColor: i === page ? colors.wine : 'rgba(232, 160, 191, 0.4)' }]}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Próxima página"
            disabled={page === pageCount - 1}
            onPress={() => setPage(page + 1)}
            style={page === pageCount - 1 && { opacity: 0.3 }}
          >
            <Ionicons name="chevron-forward" size={24} color={colors.wine} />
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
