import { AuthApiError } from '@supabase/supabase-js';
import { fireEvent, screen } from '@testing-library/react-native';

import { EXPIRED_LINK, RESET_SENT, type PasswordRecoveryApi } from '../services/passwordRecovery';
import { renderScreen } from '../test/render';
import { AuthScreen } from './AuthScreen';

let recovery: jest.Mocked<PasswordRecoveryApi>;

beforeEach(() => {
  recovery = {
    requestReset: jest.fn(async (_email: string) => {}),
    startRecovery: jest.fn(async (_link: { accessToken: string; refreshToken: string }) => {}),
    updatePassword: jest.fn(async (_password: string) => {}),
    cancel: jest.fn(async () => {}),
  };
});

test('"Esqueci minha senha" aparece no login e leva o e-mail já digitado', async () => {
  await renderScreen(<AuthScreen initialMode="login" recovery={recovery} />);
  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana@exemplo.com');

  await fireEvent.press(screen.getByText('Esqueci minha senha'));

  expect(screen.getByText('Enviar link')).toBeTruthy();
  expect(screen.getByLabelText('E-mail').props.value).toBe('ana@exemplo.com');
});

test('cadastro não mostra "Esqueci minha senha"', async () => {
  await renderScreen(<AuthScreen initialMode="signUp" recovery={recovery} />);
  expect(screen.queryByText('Esqueci minha senha')).toBeNull();
});

test('envia o link e mostra a mesma mensagem exista ou não a conta', async () => {
  await renderScreen(<AuthScreen initialMode="forgot" recovery={recovery} />);
  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana@exemplo.com');

  await fireEvent.press(screen.getByText('Enviar link'));

  expect(await screen.findByText(RESET_SENT)).toBeTruthy();
  expect(recovery.requestReset).toHaveBeenCalledWith('ana@exemplo.com');
  expect(screen.getByText('Enviar de novo')).toBeTruthy();
});

test('e-mail inválido não chama o Supabase', async () => {
  await renderScreen(<AuthScreen initialMode="forgot" recovery={recovery} />);
  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana');

  await fireEvent.press(screen.getByText('Enviar link'));

  expect(screen.getByText('Digite um e-mail válido')).toBeTruthy();
  expect(recovery.requestReset).not.toHaveBeenCalled();
});

test('limite de envios mostra o aviso em português', async () => {
  recovery.requestReset.mockRejectedValue(new AuthApiError('rate limit', 429, 'over_email_send_rate_limit'));
  await renderScreen(<AuthScreen initialMode="forgot" recovery={recovery} />);
  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana@exemplo.com');

  await fireEvent.press(screen.getByText('Enviar link'));

  expect(await screen.findByText(/Espere alguns minutos/)).toBeTruthy();
  expect(screen.queryByText(RESET_SENT)).toBeNull();
});

test('link expirado abre o pedido de um novo com o aviso', async () => {
  await renderScreen(<AuthScreen initialMode="forgot" initialError={EXPIRED_LINK} recovery={recovery} />);
  expect(screen.getByText(EXPIRED_LINK)).toBeTruthy();
  expect(screen.getByText('Enviar link')).toBeTruthy();
});

test('voltar do pedido de link leva ao login', async () => {
  await renderScreen(<AuthScreen initialMode="forgot" recovery={recovery} />);
  await fireEvent.press(screen.getByText('← Voltar'));
  expect(screen.getByText('Esqueci minha senha')).toBeTruthy();
});
