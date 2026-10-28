import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import { Backdrop } from './Backdrop';
import { CheckerStrip } from './CheckerStrip';
import { StarShape } from './StarShape';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** `shortLabel` é o rótulo da barra inferior, que tem pouco espaço por item. */
export const appDestinations: { icon: IconName; label: string; shortLabel: string }[] = [
  { icon: 'shirt-outline', label: 'Meu guarda-roupa', shortLabel: 'Guarda-roupa' },
  { icon: 'sparkles-outline', label: 'Novo look', shortLabel: 'Novo look' },
  { icon: 'star-outline', label: 'Looks', shortLabel: 'Looks' },
  { icon: 'cart-outline', label: 'Wishlist', shortLabel: 'Wishlist' },
  { icon: 'settings-outline', label: 'Configurações', shortLabel: 'Ajustes' },
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
        <Backdrop tone="soft" />
        <View style={styles.sideNav}>
          <View style={styles.brandRow}>
            <StarShape size={22} color={colors.cherry} />
            <Text style={[text.headlineMedium, { fontSize: 22, lineHeight: 30 }]}>Wable</Text>
          </View>
          {appDestinations.map((d, i) => {
            const selected = i === selectedIndex;
            return (
              <Pressable
                key={d.label}
                accessibilityRole="tab"
                accessibilityLabel={d.label}
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
      <Backdrop tone="soft" />
      <View style={styles.body}>{children}</View>
      <CheckerStrip height={8} />
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
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[
                  styles.bottomLabel,
                  { color: selected ? colors.wine : colors.textMuted },
                  selected && { fontFamily: 'Quicksand_700Bold' },
                ]}
              >
                {d.shortLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', backgroundColor: colors.paper },
  column: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1 },
  sideNav: {
    width: 240,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 8,
    borderRightWidth: 3,
    borderRightColor: colors.rose,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24, paddingHorizontal: 8 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 44, borderRadius: 24 },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 2,
  },
  bottomItem: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 16,
  },
  bottomLabel: { fontFamily: 'Quicksand_600SemiBold', fontSize: 11 },
});
