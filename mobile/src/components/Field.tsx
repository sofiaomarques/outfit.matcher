import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, pinkBorder } from '../theme/colors';
import { text } from '../theme/fonts';

interface FieldProps extends React.ComponentProps<typeof TextInput> {
  label: string;
  helper?: string;
  error?: string;
}

export function Field({ label, helper, error, ...input }: FieldProps) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[text.bodyMedium, styles.label]}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        style={[styles.input, error ? { borderColor: colors.error } : null]}
      />
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : helper ? (
        <Text style={[text.bodyMedium, { fontSize: 12, marginTop: 4 }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6 },
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
  fieldError: { color: colors.error, fontSize: 12, marginTop: 4 },
});
