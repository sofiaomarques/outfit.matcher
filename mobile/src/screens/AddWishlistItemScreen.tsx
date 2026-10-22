import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { PhotoSourceSheet } from '../components/PhotoSourceSheet';
import { useToast } from '../components/Toast';
import type { WishlistRepository } from '../repositories/wishlistRepository';
import { colors, pinkBorder } from '../theme/colors';
import { text } from '../theme/fonts';
import { CAMERA_DENIED_MESSAGE, pickPhoto, type PhotoSource } from '../utils/pickPhoto';

interface AddWishlistItemScreenProps {
  repository: Pick<WishlistRepository, 'addItem'>;
  /** Chamado ao fechar a tela; `added` é true se o item foi salvo. */
  onClose: (added: boolean) => void;
}

/** Cadastro de um item da wishlist: escolhe a foto (câmera ou galeria), escreve uma descrição livre e salva. */
export function AddWishlistItemScreen({ repository, onClose }: AddWishlistItemScreenProps) {
  const toast = useToast();
  const [description, setDescription] = useState('');
  const [imageBytes, setImageBytes] = useState<Uint8Array | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
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
    setImageBytes(picked.bytes);
    setPreview(picked.photo.uri);
  }

  async function save() {
    if (!imageBytes) return setError('Escolha uma foto primeiro.');
    if (description.trim() === '') return setError('Escreva uma descrição pra peça.');

    setSaving(true);
    setError(null);
    try {
      await repository.addItem({ description: description.trim(), imageBytes });
      onClose(true);
    } catch {
      if (mounted.current) setError('Não foi possível salvar. Tente de novo.');
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.appBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => onClose(false)}>
          <Ionicons name="arrow-back" size={24} color={colors.wine} />
        </Pressable>
        <Text style={text.headlineMedium}>Nova peça da wishlist</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Escolher foto"
          onPress={() => setSheetOpen(true)}
          style={styles.photo}
        >
          {preview ? (
            <Image source={{ uri: preview }} style={styles.preview} resizeMode="cover" />
          ) : (
            <Ionicons name="camera-outline" size={40} color={colors.wine} />
          )}
        </Pressable>

        <Text style={[text.bodyMedium, styles.label]}>Descrição</Text>
        <TextInput
          accessibilityLabel="Descrição"
          placeholder="Ex: vestido floral, tamanho M, @loja"
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={2}
          style={[styles.input, { minHeight: 76, textAlignVertical: 'top' }]}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={{ marginTop: 24 }}>
          <Button label="Salvar" onPress={save} loading={saving} />
        </View>
      </ScrollView>

      <PhotoSourceSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onSelect={pick} />
    </SafeAreaView>
  );
}

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
  preview: { width: '100%', height: '100%' },
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
  error: { color: colors.error, marginTop: 12 },
});
