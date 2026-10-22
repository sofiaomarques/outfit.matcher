import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '../theme/colors';
import { text } from '../theme/fonts';

interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** `text` é o botão sem fundo (como o TextButton do Flutter). */
  variant?: 'filled' | 'text';
  /** `danger` pinta o botão de texto com a cor de erro. */
  tone?: 'default' | 'danger';
}

export function Button({ label, onPress, loading, disabled, variant = 'filled', tone = 'default' }: ButtonProps) {
  const isText = variant === 'text';
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        isText ? styles.textVariant : styles.filled,
        (pressed || inactive) && { opacity: 0.7 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isText ? colors.wine : colors.cream} />
      ) : (
        <Text style={[text.label, isText && styles.textLabel, tone === 'danger' && { color: colors.error }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: 28 },
  filled: { backgroundColor: colors.wine, paddingHorizontal: 28, paddingVertical: 16 },
  textVariant: { paddingHorizontal: 12, paddingVertical: 10 },
  textLabel: { color: colors.wine },
});
