import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '../theme/colors';
import { text } from '../theme/fonts';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

/** Chip selecionável (o ChoiceChip do Flutter): rosa quando escolhido. */
export function Chip({ label, selected, onPress, disabled }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.pink }, disabled && { opacity: 0.5 }]}
    >
      <Text style={[text.titleMedium, { fontSize: 14 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(232, 160, 191, 0.5)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
