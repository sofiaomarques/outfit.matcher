import type { Session } from '@supabase/supabase-js';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShell, appDestinations } from './src/components/AppShell';
import { ToastProvider, useToast } from './src/components/Toast';
import { AuthScreen } from './src/screens/AuthScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { LooksScreen } from './src/screens/LooksScreen';
import { NewLookScreen } from './src/screens/NewLookScreen';
import { ResetPasswordScreen } from './src/screens/ResetPasswordScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { WardrobeScreen } from './src/screens/WardrobeScreen';
import { WishlistScreen } from './src/screens/WishlistScreen';
import { isSupabaseConfigured } from './src/services/apiConfig';
import { apiStatus } from './src/services/apiStatus';
import { displayNameOf, isAccountSwitch } from './src/services/currentUser';
import { outfitHistory } from './src/services/outfitHistory';
import {
  EXPIRED_LINK,
  clearRecoveryLinkFromAddressBar,
  parseRecoveryLink,
  recoveryErrorMessage,
  supabasePasswordRecovery,
} from './src/services/passwordRecovery';
import { RecommendationService } from './src/services/recommendation';
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
 * Onde está o fluxo do link de "Esqueci minha senha": abrindo a sessão do
 * link, pedindo a senha nova, ou o link não valeu (expirado, já usado).
 */
type Recovery =
  | { step: 'none' }
  | { step: 'starting' }
  | { step: 'ready' }
  | { step: 'failed'; message: string };

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
  const [recovery, setRecovery] = useState<Recovery>({ step: 'none' });
  const showToast = useToast();
  // De quem é o estado em memória (histórico de looks, guarda-roupa em análise).
  const userIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // A próxima conta não herda o histórico de looks nem a aba aberta.
    function forgetAccount() {
      outfitHistory.reset();
      RecommendationService.reset();
      setSelectedIndex(0);
      setDataVersion((v) => v + 1);
    }

    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      // Sem isso, uma falha ao ler a sessão salva deixaria o spinner pra sempre.
      .catch(() => setSession(null));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      const nextUserId = next?.user.id ?? null;
      // Link de redefinição de outra conta aberto com alguém logado: entra
      // por cima, sem SIGNED_OUT (isAccountSwitch).
      if (isAccountSwitch(userIdRef.current, nextUserId)) forgetAccount();
      userIdRef.current = nextUserId;
      setSession(next);
      // Se o Supabase abrir sozinho a sessão do link, a senha nova ainda é pedida.
      if (event === 'PASSWORD_RECOVERY') setRecovery({ step: 'ready' });
      // Entrou depois de ver o aviso do link que não valeu: o aviso já foi.
      if (event === 'SIGNED_IN') setRecovery((r) => (r.step === 'failed' ? { step: 'none' } : r));
      if (event === 'SIGNED_OUT') {
        setRecovery({ step: 'none' });
        forgetAccount();
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // O link do e-mail de redefinição abre o app (ou o site) com os tokens no endereço.
    const passwordRecovery = supabasePasswordRecovery();
    async function openLink(url: string | null | undefined) {
      const link = parseRecoveryLink(url);
      if (!link) return;
      clearRecoveryLinkFromAddressBar();
      if (link.kind === 'error') {
        setRecovery({ step: 'failed', message: EXPIRED_LINK });
        return;
      }
      setRecovery({ step: 'starting' });
      try {
        await passwordRecovery.startRecovery(link);
        setRecovery({ step: 'ready' });
      } catch (e) {
        setRecovery({ step: 'failed', message: recoveryErrorMessage(e) });
      }
    }
    Linking.getInitialURL().then(openLink).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => openLink(url));
    return () => subscription.remove();
  }, []);

  const loggedIn = session != null;
  useEffect(() => {
    // Link inválido com alguém já logado: só avisa, sem tirar a pessoa do app.
    if (recovery.step === 'failed' && loggedIn) {
      showToast(recovery.message);
      setRecovery({ step: 'none' });
    }
  }, [recovery, loggedIn, showToast]);

  const userId = session?.user.id;
  useEffect(() => {
    // Começa a acordar a API já no login, enquanto a pessoa ainda olha o guarda-roupa.
    if (userId) apiStatus.ensureReady().catch(() => {});
  }, [userId]);

  if (session === undefined || recovery.step === 'starting') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.wine} />
      </View>
    );
  }
  if (session === null) {
    // Link que não valeu já abre o pedido de um link novo, com o aviso.
    return recovery.step === 'failed' ? (
      <AuthScreen key="recovery-failed" initialMode="forgot" initialError={recovery.message} />
    ) : (
      <AuthScreen />
    );
  }
  if (recovery.step === 'ready') {
    return (
      <ResetPasswordScreen
        onDone={() => {
          setRecovery({ step: 'none' });
          showToast('Senha alterada!');
        }}
        onCancel={() => setRecovery({ step: 'none' })}
      />
    );
  }

  function onDataErased() {
    setDataVersion((v) => v + 1);
    outfitHistory.reset();
    RecommendationService.reset();
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
          ) : index === 1 ? (
            <NewLookScreen displayName={displayNameOf(session.user)} />
          ) : index === 2 ? (
            <LooksScreen />
          ) : index === 3 ? (
            <WishlistScreen />
          ) : index === 4 ? (
            <FavoritesScreen />
          ) : index === appDestinations.length - 1 ? (
            <SettingsScreen onDataErased={onDataErased} />
          ) : null}
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
