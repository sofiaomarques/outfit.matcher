import { isAuthApiError, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/** Endereço do app no celular (o `scheme` do app.json). */
export const NATIVE_RESET_URL = 'wable://redefinir-senha';

export const NETWORK_ERROR = 'Não foi possível conectar. Tente de novo.';
export const EXPIRED_LINK = 'Esse link expirou ou já foi usado. Peça um novo.';
const RATE_LIMITED = 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.';
export const RESET_SENT =
  'Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.';

/**
 * Para onde o link do e-mail leva. No site é a própria página (o Supabase
 * acrescenta os tokens depois do `#`); no celular, o deep link do app.
 * Os dois precisam estar em *Redirect URLs* no painel do Supabase.
 */
export function passwordResetRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin + window.location.pathname;
  }
  return NATIVE_RESET_URL;
}

export type RecoveryLink =
  | { kind: 'recovery'; accessToken: string; refreshToken: string }
  | { kind: 'error'; code: string };

/**
 * Lê o endereço com que o app foi aberto. Só interessa o link de
 * redefinição de senha (`type=recovery`) ou o erro que o Supabase devolve
 * no lugar dele (ex.: `error_code=otp_expired`); qualquer outro vira null.
 */
export function parseRecoveryLink(url: string | null | undefined): RecoveryLink | null {
  if (!url) return null;
  const hash = url.indexOf('#');
  const query = url.indexOf('?');
  const raw = hash >= 0 ? url.slice(hash + 1) : query >= 0 ? url.slice(query + 1) : '';
  const params = new URLSearchParams(raw);

  const error = params.get('error_code') ?? params.get('error');
  if (error) return { kind: 'error', code: error };

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (params.get('type') === 'recovery' && accessToken && refreshToken) {
    return { kind: 'recovery', accessToken, refreshToken };
  }
  return null;
}

/** Tira os tokens da barra de endereço, pra não ficarem no histórico nem serem reusados. */
export function clearRecoveryLinkFromAddressBar() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history) {
    window.history.replaceState(null, '', window.location.pathname);
  }
}

/** Mensagem da nova senha e da confirmação, ou vazio se estiverem válidas. */
export function validateNewPassword(
  password: string,
  confirmation: string,
): Partial<Record<'password' | 'confirmation', string>> {
  const errors: Partial<Record<'password' | 'confirmation', string>> = {};
  if (password.length < 6) errors.password = 'A senha precisa de pelo menos 6 caracteres';
  else if (confirmation !== password) errors.confirmation = 'As senhas não são iguais';
  return errors;
}

/** Erro do Supabase em português; falha de rede vira o aviso genérico. */
export function recoveryErrorMessage(e: unknown): string {
  if (!isAuthApiError(e)) return NETWORK_ERROR;
  switch (e.code) {
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return RATE_LIMITED;
    case 'same_password':
      return 'A nova senha precisa ser diferente da antiga.';
    case 'weak_password':
      return 'Essa senha é fraca demais. Tente uma mais longa.';
    case 'otp_expired':
    case 'session_not_found':
    case 'session_expired':
    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
      return EXPIRED_LINK;
    default:
      return e.status === 429 ? RATE_LIMITED : e.message;
  }
}

/** As chamadas ao Supabase Auth do fluxo; os testes passam uma de mentira. */
export interface PasswordRecoveryApi {
  requestReset(email: string): Promise<void>;
  startRecovery(link: { accessToken: string; refreshToken: string }): Promise<void>;
  updatePassword(password: string): Promise<void>;
  cancel(): Promise<void>;
}

export function supabasePasswordRecovery(client: SupabaseClient = supabase): PasswordRecoveryApi {
  return {
    async requestReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: passwordResetRedirectUrl(),
      });
      if (error) throw error;
    },
    async startRecovery({ accessToken, refreshToken }) {
      const { error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
    },
    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },
    async cancel() {
      await client.auth.signOut();
    },
  };
}
