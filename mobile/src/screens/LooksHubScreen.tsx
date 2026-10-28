import { useContext, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip } from '../components/Chip';
import { VisibleContext } from '../services/backNavigation';
import { colors } from '../theme/colors';
import { FavoritesScreen } from './FavoritesScreen';
import { LooksScreen } from './LooksScreen';

const SECTIONS = ['Sugeridos', 'Favoritos'] as const;

/**
 * Aba "Looks": os looks sugeridos e os favoritos na mesma aba, pra barra de
 * navegação ter menos destinos. As duas ficam montadas (trocar não perde filtro
 * nem looks gerados); a escondida não toma o "voltar" de quem está à vista.
 */
export function LooksHubScreen() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Sugeridos');
  const tabVisible = useContext(VisibleContext);

  return (
    <View style={styles.screen}>
      <View style={styles.switcher}>
        {SECTIONS.map((option) => (
          <Chip key={option} label={option} selected={section === option} onPress={() => setSection(option)} />
        ))}
      </View>
      <View style={[styles.pane, section !== 'Sugeridos' && styles.hidden]}>
        <VisibleContext.Provider value={tabVisible && section === 'Sugeridos'}>
          <LooksScreen />
        </VisibleContext.Provider>
      </View>
      <View style={[styles.pane, section !== 'Favoritos' && styles.hidden]}>
        <VisibleContext.Provider value={tabVisible && section === 'Favoritos'}>
          <FavoritesScreen />
        </VisibleContext.Provider>
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
