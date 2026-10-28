import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import { Button } from './Button';
import { StarShape } from './StarShape';

interface AuthLayoutProps {
  backLabel?: string;
  onBack: () => void;
  children: ReactNode;
}

/** Moldura das telas de login, cadastro e redefinição: botão de voltar, marca e formulário. */
export function AuthLayout({ backLabel = '← Voltar', onBack, children }: AuthLayoutProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={{ alignSelf: 'flex-start' }}>
        <Button label={backLabel} variant="text" onPress={onBack} />
      </View>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <StarShape size={22} color={colors.wine} />
          <Text style={[text.headlineMedium, styles.brand]}>Wable</Text>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: 28 },
  form: {
    maxWidth: 380,
    width: '100%',
    alignSelf: 'center',
    paddingVertical: 20,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { fontSize: 20, lineHeight: 22 },
});
