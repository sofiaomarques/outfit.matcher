import { AuthApiError } from '@supabase/supabase-js';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { EXPIRED_LINK, type PasswordRecoveryApi } from '../services/passwordRecovery';
import { renderScreen } from '../test/render';
import { ResetPasswordScreen } from './ResetPasswordScreen';

let recovery: jest.Mocked<PasswordRecoveryApi>;
let done: jest.Mock;
let cancelled: jest.Mock;

beforeEach(() => {
  recovery = {
    requestReset: jest.fn(async (_email: string) => {}),
    startRecovery: jest.fn(async (_link: { accessToken: string; refreshToken: string }) => {}),
    updatePassword: jest.fn(async (_password: string) => {}),
    cancel: jest.fn(async () => {}),
  };
  done = jest.fn();
  cancelled = jest.fn();
});

async function fill(password: string, confirmation: string) {
  await renderScreen(<ResetPasswordScreen recovery={recovery} onDone={done} onCancel={cancelled} />);
  await fireEvent.changeText(screen.getByLabelText('Nova senha'), password);
  await fireEvent.changeText(screen.getByLabelText('Confirmar senha'), confirmation);
  await fireEvent.press(screen.getByText('Salvar senha'));
}

test('salva a senha nova e segue pro app', async () => {
  await fill('nova-senha', 'nova-senha');
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect(recovery.updatePassword).toHaveBeenCalledWith('nova-senha');
});

test('senha curta ou diferente da confirmação não chama o Supabase', async () => {
  await fill('12345', '12345');
  expect(screen.getByText('A senha precisa de pelo menos 6 caracteres')).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText('Nova senha'), '123456');
  await fireEvent.press(screen.getByText('Salvar senha'));
  expect(screen.getByText('As senhas não são iguais')).toBeTruthy();
  expect(recovery.updatePassword).not.toHaveBeenCalled();
});

test('sessão do link vencida avisa que o link expirou', async () => {
  recovery.updatePassword.mockRejectedValue(new AuthApiError('Auth session missing!', 403, 'session_not_found'));
  await fill('nova-senha', 'nova-senha');
  expect(await screen.findByText(EXPIRED_LINK)).toBeTruthy();
  expect(done).not.toHaveBeenCalled();
});

test('cancelar sai da sessão do link', async () => {
  await renderScreen(<ResetPasswordScreen recovery={recovery} onDone={done} onCancel={cancelled} />);
  await fireEvent.press(screen.getByText('← Cancelar'));
  await waitFor(() => expect(cancelled).toHaveBeenCalled());
  expect(recovery.cancel).toHaveBeenCalled();
});
