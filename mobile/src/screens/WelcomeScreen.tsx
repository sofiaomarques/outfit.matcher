import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Backdrop } from '../components/Backdrop';
import { Button } from '../components/Button';
import { CheckerStrip } from '../components/CheckerStrip';
import { PaintedHeart } from '../components/PaintedHeart';
import { StarShape } from '../components/StarShape';
import { WavyFrame } from '../components/WavyFrame';
import { colors } from '../theme/colors';
import { text } from '../theme/fonts';

interface WelcomeScreenProps {
  onLogin: () => void;
  onSignUp: () => void;
}

/** Primeira tela do app: apresentação + call-to-action pra entrar ou criar conta. */
export function WelcomeScreen({ onLogin, onSignUp }: WelcomeScreenProps) {
  const { width } = useWindowDimensions();
  // Nas larguras estreitas (celular) a estrela decorativa colidiria com o texto.
  const showDecorations = width >= 700;

  return (
    <SafeAreaView style={styles.screen}>
      <Backdrop />
      {showDecorations && (
        <View style={styles.sticker} pointerEvents="none">
          <PaintedHeart size={96} color={colors.cherry} rotation={0.2} />
        </View>
      )}
      <View style={styles.topBar}>
        <StarShape size={24} color={colors.cherry} />
        <Text style={[text.headlineMedium, styles.brand]}>Wable</Text>
        <View style={{ flex: 1 }} />
        <Button label="Entrar" variant="text" onPress={onLogin} />
        <Button label="Cadastrar" onPress={onSignUp} />
      </View>
      <ScrollView contentContainerStyle={styles.hero}>
        <WavyFrame style={styles.card}>
          <PaintedHeart size={34} color={colors.cherry} rotation={-0.2} />
          <Text style={text.displayLarge}>{'Seu guarda-roupa,\nmais inteligente.'}</Text>
          <Text style={styles.subtitle}>
            Combine suas peças, descubra novos looks e aproveite o que você já tem.
          </Text>
          <View style={styles.cta}>
            <Button label="Começar →" onPress={onSignUp} />
          </View>
        </WavyFrame>
      </ScrollView>
      <View style={styles.checker}>
        <CheckerStrip height={12} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 20, paddingVertical: 20 },
  sticker: { position: 'absolute', top: 120, right: 36 },
  checker: { marginHorizontal: -20, marginBottom: -20 },
  card: { maxWidth: 480, width: '100%' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { fontSize: 20, lineHeight: 28 },
  hero: { flexGrow: 1, justifyContent: 'center', paddingVertical: 16 },
  subtitle: {
    marginTop: 20,
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 19,
    lineHeight: 27,
    color: 'rgba(61, 18, 32, 0.72)',
  },
  cta: { marginTop: 32, alignSelf: 'flex-start' },
});
