import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import { Button } from './Button';

interface StatusMessageProps {
  message: string;
  loading?: boolean;
  onRetry?: () => void;
}

/** Mensagem centralizada: carregando (com spinner), erro (com "Tentar de novo") ou vazio. */
export function StatusMessage({ message, loading, onRetry }: StatusMessageProps) {
  return (
    <View style={styles.center}>
      {loading && <ActivityIndicator color={colors.wine} style={{ marginBottom: 16 }} />}
      <Text style={[text.bodyLarge, styles.message]}>{message}</Text>
      {onRetry && <Button variant="text" label="Tentar de novo" onPress={onRetry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { color: colors.textMuted, textAlign: 'center' },
});
