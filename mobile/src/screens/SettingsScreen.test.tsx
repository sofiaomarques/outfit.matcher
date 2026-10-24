import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { renderScreen } from '../test/render';
import { SettingsScreen } from './SettingsScreen';

/** Conta em memória no lugar do Supabase. */
class FakeAccount {
  emailValue: string | null = 'ana@exemplo.com';
  fail = false;
  signOuts = 0;
  erases = 0;
  // Se definido, o apagar só termina quando ele resolver.
  gate: Promise<void> | null = null;

  email = async () => this.emailValue;
  signOut = async () => {
    if (this.fail) throw new Error('offline');
    this.signOuts++;
  };
  eraseMyData = async () => {
    await this.gate;
    if (this.fail) throw new Error('offline');
    this.erases++;
  };
}

let account: FakeAccount;
let erased: jest.Mock;

beforeEach(() => {
  account = new FakeAccount();
  erased = jest.fn();
});

async function pumpSettings(feedbackLink = '') {
  await renderScreen(
    <SettingsScreen repository={account} feedbackLink={feedbackLink} onDataErased={erased} />,
  );
  await screen.findByText('ana@exemplo.com');
}

async function tapErase() {
  await fireEvent.press(screen.getByText('Apagar meus dados'));
  await screen.findByText('Apagar meus dados?');
}

test('mostra a conta logada e a versão, sem feedback sem link', async () => {
  await pumpSettings();
  expect(screen.getByText('Versão dev')).toBeTruthy();
  expect(screen.queryByText('Mandar feedback')).toBeNull();
});

test('com link de feedback, mostra a opção e abre o link', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await pumpSettings('https://exemplo.com/form');

  await fireEvent.press(screen.getByText('Mandar feedback'));

  await waitFor(() => expect(open).toHaveBeenCalledWith('https://exemplo.com/form'));
  open.mockRestore();
});

test('link de feedback sem esquema avisa em vez de quebrar', async () => {
  const open = jest.spyOn(Linking, 'openURL');
  await pumpSettings('forms.exemplo.com/x');

  await fireEvent.press(screen.getByText('Mandar feedback'));

  expect(await screen.findByText('Não foi possível abrir o link.')).toBeTruthy();
  expect(open).not.toHaveBeenCalled();
  open.mockRestore();
});

test('"Sair" desloga; se falhar, avisa', async () => {
  await pumpSettings();

  await fireEvent.press(screen.getByText('Sair'));
  await waitFor(() => expect(account.signOuts).toBe(1));

  account.fail = true;
  await fireEvent.press(screen.getByText('Sair'));
  expect(await screen.findByText('Não foi possível sair. Tente de novo.')).toBeTruthy();
});

test('cancelar a confirmação não apaga nada', async () => {
  await pumpSettings();

  await tapErase();
  await fireEvent.press(screen.getByText('Cancelar'));

  await waitFor(() => expect(screen.queryByText('Apagar meus dados?')).toBeNull());
  expect(account.erases).toBe(0);
  expect(erased).not.toHaveBeenCalled();
});

test('confirmar apaga e avisa as outras telas', async () => {
  await pumpSettings();

  await tapErase();
  await fireEvent.press(screen.getByText('Apagar tudo'));

  expect(await screen.findByText('Pronto: seus dados e fotos foram apagados.')).toBeTruthy();
  expect(account.erases).toBe(1);
  expect(erased).toHaveBeenCalledTimes(1);
});

test('enquanto apaga, um diálogo tampa o app e o botão fica travado', async () => {
  let release!: () => void;
  account.gate = new Promise<void>((resolve) => (release = resolve));
  await pumpSettings();

  await tapErase();
  // Sem await: o handler só termina quando o gate abrir.
  void fireEvent.press(screen.getByText('Apagar tudo'));
  expect(await screen.findByText('Apagando seus dados...')).toBeTruthy();
  expect(screen.getByText('Apagando...')).toBeTruthy();

  // Tocar de novo na linha não dispara outro apagar.
  void fireEvent.press(screen.getByText('Apagando...'));
  expect(screen.queryByText('Apagar meus dados?')).toBeNull();

  await act(async () => {
    release();
  });
  await waitFor(() => expect(screen.queryByText('Apagando seus dados...')).toBeNull());
  expect(erased).toHaveBeenCalledTimes(1);
});

test('se apagar falhar, avisa, registra a causa e recarrega as telas', async () => {
  account.fail = true;
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await pumpSettings();

  await tapErase();
  await fireEvent.press(screen.getByText('Apagar tudo'));

  expect(await screen.findByText(/Não foi possível apagar tudo\./)).toBeTruthy();
  // Parte pode ter sido apagada antes da falha.
  expect(erased).toHaveBeenCalledTimes(1);
  // O botão volta a funcionar pra tentar de novo.
  expect(screen.getByText('Apagar meus dados')).toBeTruthy();
  // A causa fica no console, pra investigar no teste com o Supabase real.
  expect(warn).toHaveBeenCalledWith('Apagar meus dados falhou:', expect.any(Error));
  warn.mockRestore();
});
