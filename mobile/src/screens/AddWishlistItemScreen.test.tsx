import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderScreen } from '../test/render';
import { pickPhoto } from '../utils/pickPhoto';
import { AddWishlistItemScreen } from './AddWishlistItemScreen';

jest.mock('../utils/pickPhoto', () => ({
  pickPhoto: jest.fn(),
  CAMERA_DENIED_MESSAGE: 'Sem permissão da câmera.',
}));

const mockPick = pickPhoto as jest.Mock;
const BYTES = new Uint8Array([1, 2, 3]);
const OK = { status: 'ok', photo: { uri: 'file:///f.jpg' }, bytes: BYTES };

let repo: { addItem: jest.Mock };
let onClose: jest.Mock;

beforeEach(() => {
  mockPick.mockReset();
  repo = { addItem: jest.fn(async () => ({})) };
  onClose = jest.fn();
});

async function choosePhoto(label = 'Escolher da galeria') {
  await fireEvent.press(screen.getByLabelText('Escolher foto'));
  await fireEvent.press(await screen.findByText(label));
}

test('sem foto, avisa; sem descrição, avisa', async () => {
  await renderScreen(<AddWishlistItemScreen repository={repo} onClose={onClose} />);

  await fireEvent.press(screen.getByText('Salvar'));
  expect(screen.getByText('Escolha uma foto primeiro.')).toBeTruthy();

  mockPick.mockResolvedValue(OK);
  await choosePhoto();
  await fireEvent.press(screen.getByText('Salvar'));
  expect(await screen.findByText('Escreva uma descrição pra peça.')).toBeTruthy();
  expect(repo.addItem).not.toHaveBeenCalled();
});

test('foto + descrição salvam e fecham avisando que adicionou', async () => {
  mockPick.mockResolvedValue(OK);
  await renderScreen(<AddWishlistItemScreen repository={repo} onClose={onClose} />);

  await choosePhoto();
  expect(mockPick).toHaveBeenCalledWith('gallery');
  await fireEvent.changeText(screen.getByLabelText('Descrição'), '  vestido floral, M  ');
  await fireEvent.press(screen.getByText('Salvar'));

  await waitFor(() =>
    expect(repo.addItem).toHaveBeenCalledWith({ description: 'vestido floral, M', imageBytes: BYTES }),
  );
  expect(onClose).toHaveBeenCalledWith(true);
});

test('se salvar falha, mostra o erro e continua na tela', async () => {
  mockPick.mockResolvedValue(OK);
  repo.addItem.mockRejectedValue(new Error('offline'));
  await renderScreen(<AddWishlistItemScreen repository={repo} onClose={onClose} />);

  await choosePhoto();
  await fireEvent.changeText(screen.getByLabelText('Descrição'), 'bota');
  await fireEvent.press(screen.getByText('Salvar'));

  expect(await screen.findByText('Não foi possível salvar. Tente de novo.')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});

test('câmera sem permissão avisa e não escolhe foto', async () => {
  mockPick.mockResolvedValue({ status: 'denied' });
  await renderScreen(<AddWishlistItemScreen repository={repo} onClose={onClose} />);

  await choosePhoto('Tirar foto');

  expect(await screen.findByText('Sem permissão da câmera.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Salvar'));
  expect(screen.getByText('Escolha uma foto primeiro.')).toBeTruthy();
});

test('cancelar o seletor não muda nada, e voltar fecha sem adicionar', async () => {
  mockPick.mockResolvedValue({ status: 'canceled' });
  await renderScreen(<AddWishlistItemScreen repository={repo} onClose={onClose} />);

  await choosePhoto();
  await fireEvent.press(screen.getByLabelText('Voltar'));

  expect(onClose).toHaveBeenCalledWith(false);
});
