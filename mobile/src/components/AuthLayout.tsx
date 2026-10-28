import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import { Backdrop } from './Backdrop';
import { Button } from './Button';
import { PaintedHeart } from './PaintedHeart';
import { StarShape } from './StarShape';
import { WavyFrame } from './WavyFrame';

interface AuthLayoutProps {
  backLabel?: string;
  onBack: () => void;
  children: ReactNode;
}

/** Moldura das telas de login, cadastro e redefinição: botão de voltar, marca e formulário. */
export function AuthLayout({ backLabel = '← Voltar', onBack, children }: AuthLayoutProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <Backdrop />
      <View style={{ alignSelf: 'flex-start' }}>
        <Button label={backLabel} variant="text" onPress={onBack} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <WavyFrame style={styles.form}>
          <View style={styles.brandRow}>
            <StarShape size={22} color={colors.cherry} />
            <Text style={[text.headlineMedium, styles.brand]}>Wable</Text>
            <View style={{ flex: 1 }} />
            <PaintedHeart size={26} color={colors.cherry} rotation={0.2} />
          </View>
          {children}
        </WavyFrame>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 20 },
  scroll: { paddingVertical: 12 },
  form: { maxWidth: 400, width: '100%', alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { fontSize: 20, lineHeight: 28 },
});
