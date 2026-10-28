import { isAuthApiError, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/** Endereço do app no celular (o `scheme` do app.json). */
export const NATIVE_RESET_URL = 'wable://redefinir-senha';
/**
 * Caminho do link no site. Marca o retorno como sendo da redefinição: quando
 * o link não vale, o Supabase devolve só o erro (sem `type`), e sem a marca
 * um link de confirmação de cadastro expirado viraria "Esqueci minha senha".
 * Qualquer caminho abre o app (fallback de SPA do nginx e do `expo start`).
 */
const RESET_PATH_SEGMENT = 'redefinir-senha';

export const NETWORK_ERROR = 'Não foi possível conectar. Tente de novo.';
const GENERIC_ERROR = 'Algo deu errado. Tente de novo.';
export const EXPIRED_LINK = 'Esse link expirou ou já foi usado. Peça um novo.';
const RATE_LIMITED = 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.';
export const RESET_SENT =
  'Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.';

/** Caminho do site sem o `/redefinir-senha` do fim (o site pode não estar na raiz). */
function siteBasePath(pathname: string): string {
  return pathname.replace(new RegExp(`/?${RESET_PATH_SEGMENT}/?$`), '').replace(/\/$/, '');
}

/**
 * Para onde o link do e-mail leva. No site, `/redefinir-senha` (o Supabase
 * acrescenta os tokens depois do `#`); no celular, o deep link do app.
 * Os dois precisam estar em *Redirect URLs* no painel do Supabase
 * (`<site>/**` cobre o do site).
 */
export function passwordResetRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return webResetUrl(window.location.origin, window.location.pathname);
  }
  return NATIVE_RESET_URL;
}

/** O endereço de volta no site, a partir de onde a pessoa está agora. */
export function webResetUrl(origin: string, pathname: string): string {
  return `${origin}${siteBasePath(pathname)}/${RESET_PATH_SEGMENT}`;
}

/** O endereço (sem `?` nem `#`) é o de volta do link de redefinição. */
function isResetUrl(url: string): boolean {
  return url.split(/[?#]/)[0].replace(/\/$/, '').endsWith(RESET_PATH_SEGMENT);
}

export type RecoveryLink =
  | { kind: 'recovery'; accessToken: string; refreshToken: string }
  | { kind: 'error'; code: string };

/**
 * Lê o endereço com que o app foi aberto. Só interessa o link de
 * redefinição de senha (`type=recovery`) ou o erro que o Supabase devolve
 * no lugar dele (ex.: `error_code=otp_expired`), este só quando volta pro
 * endereço da redefinição; qualquer outro vira null.
 */
export function parseRecoveryLink(url: string | null | undefined): RecoveryLink | null {
  if (!url) return null;
  const hash = url.indexOf('#');
  const query = url.indexOf('?');
  const raw = hash >= 0 ? url.slice(hash + 1) : query >= 0 ? url.slice(query + 1) : '';
  const params = new URLSearchParams(raw);

  const error = params.get('error_code') ?? params.get('error');
  if (error) return isResetUrl(url) ? { kind: 'error', code: error } : null;

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
    // Sai também do /redefinir-senha: um recarregar depois não é mais o link.
    window.history.replaceState(null, '', siteBasePath(window.location.pathname) || '/');
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
      return e.status === 429 ? RATE_LIMITED : GENERIC_ERROR;
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
