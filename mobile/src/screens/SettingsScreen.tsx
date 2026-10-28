import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BusyDialog, ConfirmDialog } from '../components/Dialogs';
import { Card } from '../components/Card';
import { useToast } from '../components/Toast';
import { AccountRepository } from '../repositories/accountRepository';
import { APP_VERSION, FEEDBACK_URL } from '../services/apiConfig';
import { colors } from '../theme/colors';
import { text } from '../theme/fonts';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface SettingsScreenProps {
  /** Chamado depois de apagar tudo, pra as outras telas recarregarem vazias. */
  onDataErased: () => void;
  repository?: Pick<AccountRepository, 'email' | 'signOut' | 'eraseMyData'>;
  feedbackLink?: string;
}

/**
 * Tela "Configurações": conta logada, sair, apagar tudo o que a usuária
 * enviou (peças, wishlist, looks e fotos) e sobre o app.
 */
export function SettingsScreen({
  onDataErased,
  repository,
  feedbackLink = FEEDBACK_URL,
}: SettingsScreenProps) {
  // Criado só no primeiro uso: o Supabase real não existe nos testes.
  const repo = useMemo(() => repository ?? new AccountRepository(), [repository]);
  const toast = useToast();
  const [email, setEmail] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [erasing, setErasing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    repo
      .email()
      .then((value) => mounted.current && setEmail(value))
      // Só mostra "Conta sem e-mail"; a pessoa não pediu nada que tenha falhado.
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, [repo]);

  async function signOut() {
    try {
      await repo.signOut();
    } catch {
      toast('Não foi possível sair. Tente de novo.');
    }
  }

  async function erase() {
    setConfirming(false);
    // O diálogo tampa o app inteiro (inclusive a navegação) enquanto apaga:
    // uma peça adicionada no meio ficaria com a linha, mas sem a foto.
    setErasing(true);
    let message: string;
    try {
      await repo.eraseMyData();
      message = 'Pronto: seus dados e fotos foram apagados.';
    } catch (e) {
      // A causa (policy de RLS faltando, rede) só aparece no console.
      console.warn('Apagar meus dados falhou:', e);
      message = 'Não foi possível apagar tudo. Tente de novo: o que já foi apagado não volta.';
    }
    if (mounted.current) setErasing(false);
    // Mesmo se falhou no meio, parte já pode ter sido apagada: as outras
    // telas recarregam pra não mostrar o que não existe mais.
    onDataErased();
    toast(message);
  }

  async function openFeedback() {
    let opened = false;
    // Sem esquema (https:, mailto:...) o link não abre em lugar nenhum.
    if (/^[a-z][a-z0-9+.-]*:/i.test(feedbackLink)) {
      try {
        await Linking.openURL(feedbackLink);
        opened = true;
      } catch {
        // Nenhum app pra abrir o link.
      }
    }
    if (!opened) toast('Não foi possível abrir o link.');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Ionicons name="settings-outline" size={24} color={colors.wine} />
          <Text style={text.headlineLarge}>Configurações</Text>
        </View>

        <SectionTitle>Conta</SectionTitle>
        <Card>
          <Row icon="person-outline" title={email ?? 'Conta sem e-mail'} subtitle="Conta logada" />
          <Divider />
          <Row icon="log-out-outline" title="Sair" onPress={erasing ? undefined : signOut} />
        </Card>

        <SectionTitle>Seus dados</SectionTitle>
        <Card>
          <Row
            icon="trash-outline"
            iconColor={colors.error}
            title={erasing ? 'Apagando...' : 'Apagar meus dados'}
            titleColor={colors.error}
            subtitle="Peças, wishlist, looks e todas as fotos enviadas"
            leading={erasing ? <ActivityIndicator color={colors.wine} /> : undefined}
            onPress={erasing ? undefined : () => setConfirming(true)}
          />
        </Card>

        <SectionTitle>Sobre</SectionTitle>
        <Card>
          <Row icon="information-circle-outline" title="Wable" subtitle={`Versão ${APP_VERSION}`} />
          {feedbackLink !== '' && (
            <>
              <Divider />
              <Row
                icon="chatbubble-outline"
                title="Mandar feedback"
                trailing={<Ionicons name="open-outline" size={18} color={colors.textMuted} />}
                onPress={openFeedback}
              />
            </>
          )}
        </Card>
      </ScrollView>

      <ConfirmDialog
        visible={confirming}
        title="Apagar meus dados?"
        message={
          'Isso apaga todas as suas peças, a wishlist, os looks favoritos, usados e ' +
          'rejeitados, e todas as fotos que você enviou. Não dá pra desfazer. Sua conta ' +
          'continua existindo.'
        }
        cancelLabel="Cancelar"
        confirmLabel="Apagar tudo"
        onCancel={() => setConfirming(false)}
        onConfirm={erase}
      />
      <BusyDialog visible={erasing} message="Apagando seus dados..." />
    </SafeAreaView>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={[text.titleMedium, styles.sectionTitle]}>{children}</Text>;
}

function Divider() {
  return <View style={styles.divider} />;
}

interface RowProps {
  icon: IconName;
  iconColor?: string;
  title: string;
  titleColor?: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
}

function Row({ icon, iconColor = colors.wine, title, titleColor, subtitle, leading, trailing, onPress }: RowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.leading}>{leading ?? <Ionicons name={icon} size={24} color={iconColor} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={[text.bodyLarge, titleColor ? { color: titleColor } : null]}>{title}</Text>
        {subtitle && <Text style={text.bodyMedium}>{subtitle}</Text>}
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 24, gap: 8, maxWidth: 720, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionTitle: { color: colors.textMuted, marginTop: 16, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 14 },
  leading: { width: 24, alignItems: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.pink },
});
