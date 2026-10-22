import type { Session } from '@supabase/supabase-js';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShell, appDestinations } from './src/components/AppShell';
import { ToastProvider } from './src/components/Toast';
import { AuthScreen } from './src/screens/AuthScreen';
import { PlaceholderScreen } from './src/screens/PlaceholderScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { WardrobeScreen } from './src/screens/WardrobeScreen';
import { isSupabaseConfigured } from './src/services/apiConfig';
import { apiStatus } from './src/services/apiStatus';
import { outfitHistory } from './src/services/outfitHistory';
import { supabase } from './src/services/supabase';
import { colors } from './src/theme/colors';
import { fontAssets, text } from './src/theme/fonts';

export default function App() {
  const [fontsLoaded] = useFonts(fontAssets);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!fontsLoaded ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.wine} />
        </View>
      ) : isSupabaseConfigured ? (
        <ToastProvider>
          <RootNavigator />
        </ToastProvider>
      ) : (
        <MissingConfigScreen />
      )}
    </SafeAreaProvider>
  );
}

/** Mostrada quando o app roda sem as variáveis `EXPO_PUBLIC_SUPABASE_*`. */
function MissingConfigScreen() {
  return (
    <View style={styles.center}>
      <Text style={[text.bodyLarge, { textAlign: 'center', paddingHorizontal: 32 }]}>
        {'Configuração do Supabase ausente.\n\nRode o app com:\n' +
          'EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... npx expo start'}
      </Text>
    </View>
  );
}

/**
 * Controla a navegação de acordo com o estado de autenticação (Supabase
 * Auth): boas-vindas/login enquanto deslogado, navegação entre as seções
 * depois de logado.
 */
function RootNavigator() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Muda depois de "Apagar meus dados": a key nova recria as outras telas,
  // que carregam de novo (agora vazias).
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      // Sem isso, uma falha ao ler a sessão salva deixaria o spinner pra sempre.
      .catch(() => setSession(null));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') {
        // A próxima conta não herda o histórico de looks nem a aba aberta.
        outfitHistory.reset();
        setSelectedIndex(0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    // Começa a acordar a API já no login, enquanto a pessoa ainda olha o guarda-roupa.
    if (userId) apiStatus.ensureReady().catch(() => {});
  }, [userId]);

  if (session === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.wine} />
      </View>
    );
  }
  if (session === null) return <AuthScreen />;

  function onDataErased() {
    setDataVersion((v) => v + 1);
    outfitHistory.reset();
    outfitHistory.load().catch(() => {});
  }

  return (
    <AppShell selectedIndex={selectedIndex} onDestinationSelected={setSelectedIndex}>
      {/* Todas ficam montadas (como o IndexedStack do Flutter): trocar de aba não recarrega. */}
      {appDestinations.map((destination, index) => (
        <View
          key={`${destination.label}-${dataVersion}`}
          style={[styles.pane, index !== selectedIndex && styles.hidden]}
        >
          {index === 0 ? (
            <WardrobeScreen />
          ) : index === appDestinations.length - 1 ? (
            <SettingsScreen onDataErased={onDataErased} />
          ) : (
            <PlaceholderScreen title={destination.label} />
          )}
        </View>
      ))}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  hidden: { display: 'none' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
});
