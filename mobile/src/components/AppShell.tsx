import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import { StarShape } from './StarShape';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const appDestinations: { icon: IconName; label: string }[] = [
  { icon: 'shirt-outline', label: 'Meu guarda-roupa' },
  { icon: 'sparkles-outline', label: 'Novo look' },
  { icon: 'star-outline', label: 'Looks' },
  { icon: 'cart-outline', label: 'Wishlist' },
  { icon: 'heart-outline', label: 'Favoritos' },
  { icon: 'settings-outline', label: 'Configurações' },
];

const WIDE_BREAKPOINT = 840;

interface AppShellProps {
  selectedIndex: number;
  onDestinationSelected: (index: number) => void;
  children: ReactNode;
}

/**
 * Casca de navegação das telas internas: barra lateral em telas largas
 * (web/tablet), navegação inferior no celular.
 */
export function AppShell({ selectedIndex, onDestinationSelected, children }: AppShellProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  if (isWide) {
    return (
      <View style={styles.row}>
        <View style={styles.sideNav}>
          <View style={styles.brandRow}>
            <StarShape size={22} color={colors.wine} />
            <Text style={[text.headlineMedium, { fontSize: 22, lineHeight: 22 }]}>Wable</Text>
          </View>
          {appDestinations.map((d, i) => {
            const selected = i === selectedIndex;
            return (
              <Pressable
                key={d.label}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => onDestinationSelected(i)}
                style={[styles.tile, selected && { backgroundColor: colors.pinkLight }]}
              >
                <Ionicons
                  name={d.icon}
                  size={20}
                  color={selected ? colors.wine : colors.textMuted}
                />
                <Text
                  style={[
                    text.titleMedium,
                    { color: selected ? colors.wine : colors.textMuted },
                    selected && { fontFamily: 'Quicksand_700Bold' },
                  ]}
                >
                  {d.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.body}>{children}</View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.column}>
      <View style={styles.body}>{children}</View>
      <View style={styles.bottomNav}>
        {appDestinations.map((d, i) => {
          const selected = i === selectedIndex;
          return (
            <Pressable
              key={d.label}
              accessibilityRole="tab"
              accessibilityLabel={d.label}
              accessibilityState={{ selected }}
              onPress={() => onDestinationSelected(i)}
              style={[styles.bottomItem, selected && { backgroundColor: colors.pinkLight }]}
            >
              <Ionicons name={d.icon} size={22} color={selected ? colors.wine : colors.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', backgroundColor: colors.cream },
  column: { flex: 1, backgroundColor: colors.cream },
  body: { flex: 1 },
  sideNav: {
    width: 240,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.pink,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24, paddingHorizontal: 8 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14 },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.white,
    paddingVertical: 8,
  },
  bottomItem: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
});
