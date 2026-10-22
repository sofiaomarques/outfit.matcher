import { AuthApiError, AuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';

import {
  EXPIRED_LINK,
  NATIVE_RESET_URL,
  NETWORK_ERROR,
  parseRecoveryLink,
  recoveryErrorMessage,
  supabasePasswordRecovery,
  validateNewPassword,
} from './passwordRecovery';

const apiError = (code: string, status = 400) => new AuthApiError('mensagem do servidor', status, code);

describe('parseRecoveryLink', () => {
  test('lê os tokens do link de redefinição', () => {
    expect(
      parseRecoveryLink('https://wable.app/#access_token=abc&refresh_token=def&type=recovery&expires_in=3600'),
    ).toEqual({ kind: 'recovery', accessToken: 'abc', refreshToken: 'def' });
    expect(parseRecoveryLink(`${NATIVE_RESET_URL}#access_token=a&refresh_token=b&type=recovery`)).toEqual({
      kind: 'recovery',
      accessToken: 'a',
      refreshToken: 'b',
    });
  });

  test('lê o erro que o Supabase devolve no lugar do link', () => {
    expect(
      parseRecoveryLink('https://wable.app/#error=access_denied&error_code=otp_expired&error_description=x'),
    ).toEqual({ kind: 'error', code: 'otp_expired' });
  });

  test('ignora endereços que não são do link de redefinição', () => {
    expect(parseRecoveryLink(null)).toBeNull();
    expect(parseRecoveryLink('https://wable.app/')).toBeNull();
    expect(parseRecoveryLink('https://wable.app/#access_token=a&refresh_token=b&type=signup')).toBeNull();
    expect(parseRecoveryLink('https://wable.app/#type=recovery&access_token=a')).toBeNull();
  });
});

describe('validateNewPassword', () => {
  test('pede pelo menos 6 caracteres', () => {
    expect(validateNewPassword('12345', '12345')).toEqual({
      password: 'A senha precisa de pelo menos 6 caracteres',
    });
  });

  test('pede a confirmação igual', () => {
    expect(validateNewPassword('123456', '123457')).toEqual({ confirmation: 'As senhas não são iguais' });
  });

  test('aceita senhas válidas e iguais', () => {
    expect(validateNewPassword('123456', '123456')).toEqual({});
  });
});

describe('recoveryErrorMessage', () => {
  test('traduz os erros conhecidos', () => {
    expect(recoveryErrorMessage(apiError('over_email_send_rate_limit', 429))).toMatch(/Espere alguns minutos/);
    expect(recoveryErrorMessage(apiError('same_password', 422))).toMatch(/diferente da antiga/);
    expect(recoveryErrorMessage(apiError('otp_expired', 403))).toBe(EXPIRED_LINK);
    expect(recoveryErrorMessage(apiError('session_not_found', 403))).toBe(EXPIRED_LINK);
  });

  test('falha de rede vira o aviso genérico', () => {
    expect(recoveryErrorMessage(new AuthRetryableFetchError('offline', 0))).toBe(NETWORK_ERROR);
    expect(recoveryErrorMessage(new Error('qualquer'))).toBe(NETWORK_ERROR);
  });
});

describe('supabasePasswordRecovery', () => {
  function fakeAuth(error: unknown = null) {
    const auth = {
      resetPasswordForEmail: jest.fn(async () => ({ data: {}, error })),
      setSession: jest.fn(async () => ({ data: {}, error })),
      updateUser: jest.fn(async () => ({ data: {}, error })),
      signOut: jest.fn(async () => ({ error: null })),
    };
    return { auth, api: supabasePasswordRecovery({ auth } as unknown as SupabaseClient) };
  }

  test('pede o e-mail de redefinição com o link de volta pro app', async () => {
    const { auth, api } = fakeAuth();
    await api.requestReset('  ana@exemplo.com ');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@exemplo.com', {
      redirectTo: NATIVE_RESET_URL,
    });
  });

  test('abre a sessão do link e salva a senha nova', async () => {
    const { auth, api } = fakeAuth();
    await api.startRecovery({ accessToken: 'a', refreshToken: 'r' });
    await api.updatePassword('nova-senha');
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'nova-senha' });
  });

  test('repassa o erro do Supabase', async () => {
    const { api } = fakeAuth(apiError('over_email_send_rate_limit', 429));
    await expect(api.requestReset('ana@exemplo.com')).rejects.toBeInstanceOf(AuthApiError);
  });
});
