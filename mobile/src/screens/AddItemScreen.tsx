import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { PhotoSourceSheet } from '../components/PhotoSourceSheet';
import { useToast } from '../components/Toast';
import { useApiStatus } from '../hooks/useApiStatus';
import { CLOTHING_CATEGORIES, categoryInfo, type ClothingCategory } from '../models/clothingCategory';
import type { WardrobeRepository } from '../repositories/wardrobeRepository';
import { apiStatus } from '../services/apiStatus';
import {
  featuresOrSkip,
  garmentAnalysis,
  swatchFromFeatures,
  type Features,
  type GarmentAnalysisService,
} from '../services/garmentAnalysis';
import { colors, pinkBorder } from '../theme/colors';
import { text } from '../theme/fonts';
import { bytesToDataUri } from '../utils/bytes';
import { CAMERA_DENIED_MESSAGE, pickPhoto, type PhotoSource } from '../utils/pickPhoto';

interface AddItemScreenProps {
  repository: Pick<WardrobeRepository, 'addItem'>;
  analysisService?: Pick<GarmentAnalysisService, 'analisarPeca' | 'recortarPeca'>;
  /** Chamado ao fechar a tela; `added` é true se a peça foi salva. */
  onClose: (added: boolean) => void;
}

/**
 * Tela de cadastro de uma peça nova: escolhe a foto (câmera ou galeria),
 * preenche nome e categoria, e salva no guarda-roupa. Assim que a foto é
 * escolhida, a API Python recorta a peça e, em paralelo, extrai as features
 * (cor real, formalidade, embedding) que o recomendador usa. A categoria
 * continua sendo a que o usuário escolhe. Com a API acordando (cold start),
 * dá pra salvar sem esperar: a peça vai sem recorte e sem features, e é
 * analisada depois.
 */
export function AddItemScreen({ repository, analysisService = garmentAnalysis, onClose }: AddItemScreenProps) {
  const toast = useToast();
  const waking = useApiStatus() === 'waking';
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ClothingCategory>('top');
  const [imageBytes, setImageBytes] = useState<Uint8Array | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Análise da foto original (não da recortada: o pipeline tem a própria
  // segmentação). Resolve null se a API falhar — a peça é salva mesmo assim.
  const analysis = useRef<Promise<Features | null> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function pick(source: PhotoSource) {
    setSheetOpen(false);
    const picked = await pickPhoto(source);
    if (picked.status === 'denied') return toast(CAMERA_DENIED_MESSAGE);
    if (picked.status === 'canceled') return;

    const { photo, bytes: original } = picked;
    setImageBytes(original);
    setPreview(photo.uri);
    setCropping(true);
    analysis.current = analysisService.analisarPeca(original).catch(() => null);

    try {
      const cropped = await analysisService.recortarPeca(original);
      if (mounted.current) {
        setImageBytes(cropped);
        setPreview(bytesToDataUri(cropped));
      }
    } catch {
      // Serviço de recorte fora do ar ou falhou: mantém a foto original em
      // vez de travar o cadastro da peça.
    } finally {
      if (mounted.current) setCropping(false);
    }
  }

  async function save() {
    if (!imageBytes) return setError('Escolha uma foto primeiro.');
    if (name.trim() === '') return setError('Dê um nome pra peça.');

    setSaving(true);
    setError(null);
    try {
      setAnalyzing(true);
      const { features, skipped } = await featuresOrSkip(
        apiStatus,
        analysis.current ?? Promise.resolve(null),
      );
      if (mounted.current) setAnalyzing(false);

      await repository.addItem({
        name: name.trim(),
        category,
        imageBytes,
        swatch: swatchFromFeatures(features) ?? PINK_SWATCH,
        features,
      });
      if (skipped) {
        toast('Peça salva! O servidor ainda está acordando, então ela é analisada depois.');
      }
      onClose(true);
    } catch {
      if (mounted.current) setError('Não foi possível salvar. Tente de novo.');
    } finally {
      if (mounted.current) {
        setSaving(false);
        setAnalyzing(false);
      }
    }
  }

  // Acordando, o recorte pode levar minutos: não trava o "Salvar".
  const saveDisabled = saving || (cropping && !waking);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.appBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => onClose(false)}>
          <Ionicons name="arrow-back" size={24} color={colors.wine} />
        </Pressable>
        <Text style={text.headlineMedium}>Nova peça</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Escolher foto"
          onPress={() => setSheetOpen(true)}
          style={styles.photo}
        >
          {preview ? (
            <>
              <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              {cropping && (
                <View style={styles.cropping}>
                  <ActivityIndicator color={colors.white} />
                  <Text style={{ color: colors.white, marginTop: 12 }}>
                    {waking ? 'Acordando o servidor...' : 'Recortando a peça...'}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <Ionicons name="camera-outline" size={40} color={colors.wine} />
          )}
        </Pressable>

        {waking && preview && (
          <Text style={[text.bodyMedium, { marginTop: 12 }]}>
            O servidor está acordando (pode levar até 2 minutos). Se não quiser esperar, pode
            salvar: a peça fica sem recorte e é analisada depois.
          </Text>
        )}

        <Text style={[text.bodyMedium, styles.label]}>Nome da peça</Text>
        <TextInput
          accessibilityLabel="Nome da peça"
          value={name}
          onChangeText={setName}
          style={styles.input}
        />

        <View style={styles.chips}>
          {CLOTHING_CATEGORIES.map((c) => {
            const selected = category === c;
            return (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setCategory(c)}
                style={[styles.chip, selected && { backgroundColor: colors.pink }]}
              >
                <Text style={[text.titleMedium, { fontSize: 14 }]}>{categoryInfo[c].label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={{ marginTop: 24 }}>
          <Button
            label={analyzing ? 'Analisando a peça...' : 'Salvar'}
            onPress={save}
            loading={saving && !analyzing}
            disabled={saveDisabled}
          />
        </View>
      </ScrollView>

      <PhotoSourceSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onSelect={pick} />
    </SafeAreaView>
  );
}

/** Rosa da paleta como swatch de peça sem análise (0xFFE8A0BF). */
const PINK_SWATCH = 0xffe8a0bf;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  appBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingVertical: 12 },
  content: { padding: 24, paddingTop: 12, maxWidth: 560, width: '100%', alignSelf: 'center' },
  photo: {
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: colors.pinkLight,
    borderWidth: 1.5,
    borderColor: 'rgba(232, 160, 191, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cropping: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { marginTop: 20, marginBottom: 6 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: pinkBorder,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontFamily: 'Quicksand_400Regular',
    fontSize: 16,
    color: colors.textDark,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(232, 160, 191, 0.5)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  error: { color: colors.error, marginTop: 12 },
});
