import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { StarShape } from '../components/StarShape';
import {
  recoveryErrorMessage,
  supabasePasswordRecovery,
  validateNewPassword,
  type PasswordRecoveryApi,
} from '../services/passwordRecovery';
import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import { Field } from './AuthScreen';

interface ResetPasswordScreenProps {
  /** Senha salva: a pessoa segue pro app já logada. */
  onDone: () => void;
  /** Desistiu: sai da sessão aberta pelo link e volta pro login. */
  onCancel: () => void;
  recovery?: PasswordRecoveryApi;
}

/** Aberta pelo link do e-mail de redefinição: pede a senha nova duas vezes. */
export function ResetPasswordScreen({ onDone, onCancel, recovery = supabasePasswordRecovery() }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof validateNewPassword>>({});
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function submit() {
    const found = validateNewPassword(password, confirmation);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    setErrorText(null);
    try {
      await recovery.updatePassword(password);
      onDone();
    } catch (e) {
      setErrorText(recoveryErrorMessage(e));
      setLoading(false);
    }
  }

  async function cancel() {
    await recovery.cancel().catch(() => {});
    onCancel();
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={{ alignSelf: 'flex-start' }}>
        <Button label="← Cancelar" variant="text" onPress={cancel} />
      </View>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <StarShape size={22} color={colors.wine} />
          <Text style={[text.headlineMedium, styles.brand]}>Wable</Text>
        </View>
        <Text style={[text.headlineLarge, { marginVertical: 20 }]}>Criar nova senha</Text>

        <Field
          label="Nova senha"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
        />
        <Field
          label="Confirmar senha"
          value={confirmation}
          onChangeText={setConfirmation}
          error={errors.confirmation}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
        />

        {errorText && <Text style={styles.error}>{errorText}</Text>}

        <View style={{ marginTop: 24 }}>
          <Button label="Salvar senha" onPress={submit} loading={loading} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: 28 },
  form: { maxWidth: 380, width: '100%', alignSelf: 'center', paddingVertical: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { fontSize: 20, lineHeight: 22 },
  error: { color: colors.error, marginTop: 12 },
});
