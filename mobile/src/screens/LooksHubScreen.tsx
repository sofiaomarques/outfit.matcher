import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip } from '../components/Chip';
import { colors } from '../theme/colors';
import { FavoritesScreen } from './FavoritesScreen';
import { LooksScreen } from './LooksScreen';

const SECTIONS = ['Sugeridos', 'Favoritos'] as const;

/**
 * Aba "Looks": os looks sugeridos e os favoritos na mesma aba, pra barra de
 * navegação ter menos destinos. As duas seções ficam montadas.
 */
export function LooksHubScreen() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Sugeridos');

  return (
    <View style={styles.screen}>
      <View style={styles.switcher}>
        {SECTIONS.map((option) => (
          <Chip key={option} label={option} selected={section === option} onPress={() => setSection(option)} />
        ))}
      </View>
      <View style={[styles.pane, section !== 'Sugeridos' && styles.hidden]}>
        <LooksScreen />
      </View>
      <View style={[styles.pane, section !== 'Favoritos' && styles.hidden]}>
        <FavoritesScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  switcher: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingTop: 16 },
  pane: { flex: 1 },
  hidden: { display: 'none' },
});
