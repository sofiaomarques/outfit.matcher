import { isAuthApiError } from '@supabase/supabase-js';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import {
  RESET_SENT,
  recoveryErrorMessage,
  supabasePasswordRecovery,
  type PasswordRecoveryApi,
} from '../services/passwordRecovery';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import { WelcomeScreen } from './WelcomeScreen';

export type AuthMode = 'welcome' | 'login' | 'signUp' | 'forgot';

interface AuthScreenProps {
  initialMode?: AuthMode;
  /** Aviso que já abre na tela (ex.: o link de redefinição expirou). */
  initialError?: string | null;
  recovery?: PasswordRecoveryApi;
}

/**
 * Tela raiz enquanto o usuário não está autenticado: mostra a apresentação
 * e, ao tocar em Entrar/Cadastrar/Começar, o formulário de login ou cadastro.
 */
export function AuthScreen({ initialMode = 'welcome', initialError = null, recovery }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  // O e-mail digitado no login já vem preenchido em "Esqueci minha senha".
  const [email, setEmail] = useState('');

  if (mode === 'welcome') {
    return <WelcomeScreen onLogin={() => setMode('login')} onSignUp={() => setMode('signUp')} />;
  }
  if (mode === 'forgot') {
    return (
      <ForgotPasswordForm
        initialEmail={email}
        initialError={initialError}
        recovery={recovery ?? supabasePasswordRecovery()}
        onBack={() => setMode('login')}
      />
    );
  }
  return (
    <AuthForm
      isSignUp={mode === 'signUp'}
      email={email}
      onEmailChange={setEmail}
      onBack={() => setMode('welcome')}
      onSwitchMode={() => setMode(mode === 'signUp' ? 'login' : 'signUp')}
      onForgotPassword={() => setMode('forgot')}
    />
  );
}

/** Mensagem de erro do e-mail, ou undefined se estiver válido. */
export function validateEmail(email: string): string | undefined {
  return email.includes('@') ? undefined : 'Digite um e-mail válido';
}

/** Traduz as mensagens mais comuns do Supabase Auth, que chegam em inglês. */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('already registered')) return 'Esse e-mail já tem cadastro. Tente entrar.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  return message;
}

/** Mensagem de erro de cada campo, ou null se estiver válido. */
export function validateAuth(
  fields: { name: string; email: string; password: string },
  isSignUp: boolean,
): Partial<Record<'name' | 'email' | 'password', string>> {
  const errors: Partial<Record<'name' | 'email' | 'password', string>> = {};
  if (isSignUp && fields.name.trim() === '') errors.name = 'Diz como podemos te chamar';
  const email = validateEmail(fields.email);
  if (email) errors.email = email;
  if (fields.password.length < 6) errors.password = 'A senha precisa de pelo menos 6 caracteres';
  return errors;
}

interface AuthFormProps {
  isSignUp: boolean;
  email: string;
  onEmailChange: (email: string) => void;
  onBack: () => void;
  onSwitchMode: () => void;
  onForgotPassword: () => void;
}

function AuthForm({
  isSignUp,
  email,
  onEmailChange: setEmail,
  onBack,
  onSwitchMode,
  onForgotPassword,
}: AuthFormProps) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof validateAuth>>({});
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string | null>(null);

  async function submit() {
    const found = validateAuth({ name, email, password }, isSignUp);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    setErrorText(null);
    setInfoText(null);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (error) throw error;
        // Com confirmação de e-mail ativada (padrão do Supabase) não há sessão imediata.
        if (!data.session) setInfoText('Cadastro feito! Confirme seu e-mail pra entrar.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (e) {
      // Só erro que o servidor devolveu (senha errada...) mostra a mensagem
      // dele; falha de rede (AuthRetryableFetchError) vira o aviso genérico.
      setErrorText(
        isAuthApiError(e) ? authErrorMessage(e.message) : 'Não foi possível conectar. Tente de novo.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout onBack={onBack}>
      <Text style={[text.headlineLarge, { marginVertical: 20 }]}>{isSignUp ? 'Criar conta' : 'Entrar'}</Text>

      {isSignUp && (
        <Field
          label="Como você quer ser chamada?"
          helper="Apelido ou nome — é assim que vamos te chamar no app."
          value={name}
          onChangeText={setName}
          error={errors.name}
          autoCapitalize="words"
        />
      )}
      <Field
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Field
        label="Senha"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={isSignUp ? 'new-password' : 'current-password'}
      />
      {!isSignUp && (
        <View style={styles.forgot}>
          <Button variant="text" label="Esqueci minha senha" onPress={onForgotPassword} />
        </View>
      )}

      {errorText && <Text style={styles.error}>{errorText}</Text>}
      {infoText && <Text style={styles.info}>{infoText}</Text>}

      <View style={{ marginTop: 24 }}>
        <Button label={isSignUp ? 'Cadastrar' : 'Entrar'} onPress={submit} loading={loading} />
      </View>
      <View style={{ marginTop: 12 }}>
        <Button
          variant="text"
          label={isSignUp ? 'Já tem conta? Entrar' : 'Não tem conta? Cadastre-se'}
          onPress={onSwitchMode}
        />
      </View>
    </AuthLayout>
  );
}

interface ForgotPasswordFormProps {
  initialEmail: string;
  initialError: string | null;
  recovery: PasswordRecoveryApi;
  onBack: () => void;
}

/** Pede ao Supabase o e-mail com o link pra criar uma senha nova. */
function ForgotPasswordForm({ initialEmail, initialError, recovery, onBack }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(initialError);
  const [sent, setSent] = useState(false);

  async function submit() {
    const found = validateEmail(email);
    setEmailError(found);
    if (found) return;

    setLoading(true);
    setErrorText(null);
    try {
      await recovery.requestReset(email);
      // Mesma resposta exista ou não a conta: não revela quem está cadastrado.
      setSent(true);
    } catch (e) {
      setErrorText(recoveryErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout onBack={onBack}>
      <Text style={[text.headlineLarge, { marginTop: 20, marginBottom: 8 }]}>Esqueci minha senha</Text>
      <Text style={[text.bodyMedium, { marginBottom: 20 }]}>
        Digite o e-mail da sua conta e enviamos um link para você criar uma senha nova.
      </Text>

      <Field
        label="E-mail"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setSent(false);
        }}
        error={emailError}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />

      {errorText && <Text style={styles.error}>{errorText}</Text>}
      {sent && <Text style={styles.info}>{RESET_SENT}</Text>}

      <View style={{ marginTop: 24 }}>
        <Button label={sent ? 'Enviar de novo' : 'Enviar link'} onPress={submit} loading={loading} />
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.error, marginTop: 12 },
  info: { color: colors.wine, marginTop: 12 },
  forgot: { alignSelf: 'flex-end', marginTop: -8 },
});
