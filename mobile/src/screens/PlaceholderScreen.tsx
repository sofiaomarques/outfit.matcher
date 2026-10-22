import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import { text } from '../theme/fonts';

/** Tela ainda não migrada do Flutter; some conforme cada uma for portada. */
export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <View style={styles.center}>
      <Text style={text.headlineLarge}>{title}</Text>
      <Text style={text.bodyMedium}>Em migração do Flutter.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
});
