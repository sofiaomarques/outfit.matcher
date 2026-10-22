import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { StarShape } from '../components/StarShape';
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
      {showDecorations && (
        <View style={styles.sticker} pointerEvents="none">
          <StarShape size={84} color={colors.wine} rotation={-0.15} />
        </View>
      )}
      <View style={styles.topBar}>
        <StarShape size={24} color={colors.wine} />
        <Text style={[text.headlineMedium, styles.brand]}>Wable</Text>
        <View style={{ flex: 1 }} />
        <Button label="Entrar" variant="text" onPress={onLogin} />
        <Button label="Cadastrar" onPress={onSignUp} />
      </View>
      <ScrollView contentContainerStyle={styles.hero}>
        <Text style={text.displayLarge}>{'Seu guarda-roupa,\nmais inteligente.'}</Text>
        <Text style={styles.subtitle}>
          Combine suas peças, descubra novos looks e aproveite o que você já tem.
        </Text>
        <View style={styles.cta}>
          <Button label="Começar →" onPress={onSignUp} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: 28, paddingVertical: 20 },
  sticker: { position: 'absolute', top: 84, right: 28 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { fontSize: 20, lineHeight: 22 },
  hero: { flexGrow: 1, justifyContent: 'center', maxWidth: 480 },
  subtitle: {
    marginTop: 20,
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 19,
    lineHeight: 27,
    color: 'rgba(61, 18, 32, 0.72)',
  },
  cta: { marginTop: 32, alignSelf: 'flex-start' },
});
