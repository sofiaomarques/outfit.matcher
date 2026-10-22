import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderScreen } from '../test/render';
import { pickPhoto } from '../utils/pickPhoto';
import { AddItemScreen } from './AddItemScreen';

jest.mock('../utils/pickPhoto', () => ({
  pickPhoto: jest.fn(),
  CAMERA_DENIED_MESSAGE: 'Sem permissão da câmera.',
}));

const mockPick = pickPhoto as jest.Mock;
const ORIGINAL = new Uint8Array([0xff, 0xd8, 1]);
const CROPPED = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9]);
const OK = { status: 'ok', photo: { uri: 'file:///f.jpg' }, bytes: ORIGINAL };

let repo: { addItem: jest.Mock };
let analysis: { analisarPeca: jest.Mock; recortarPeca: jest.Mock };
let onClose: jest.Mock;

beforeEach(() => {
  mockPick.mockReset().mockResolvedValue(OK);
  repo = { addItem: jest.fn(async () => ({})) };
  analysis = {
    analisarPeca: jest.fn(async () => ({ cor_principal: [1, 2, 3] })),
    recortarPeca: jest.fn(async () => CROPPED),
  };
  onClose = jest.fn();
});

async function pumpAndPick() {
  await renderScreen(<AddItemScreen repository={repo} analysisService={analysis} onClose={onClose} />);
  await fireEvent.press(screen.getByLabelText('Escolher foto'));
  await fireEvent.press(await screen.findByText('Escolher da galeria'));
}

test('valida foto e nome antes de salvar', async () => {
  await renderScreen(<AddItemScreen repository={repo} analysisService={analysis} onClose={onClose} />);
  await fireEvent.press(screen.getByText('Salvar'));
  expect(screen.getByText('Escolha uma foto primeiro.')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Escolher foto'));
  await fireEvent.press(await screen.findByText('Escolher da galeria'));
  await waitFor(() => expect(analysis.recortarPeca).toHaveBeenCalled());
  await fireEvent.press(screen.getByText('Salvar'));
  expect(await screen.findByText('Dê um nome pra peça.')).toBeTruthy();
  expect(repo.addItem).not.toHaveBeenCalled();
});

test('analisa e recorta a foto; salva a peça recortada com a cor real e as features', async () => {
  await pumpAndPick();
  await waitFor(() => expect(analysis.recortarPeca).toHaveBeenCalledWith(ORIGINAL));
  expect(analysis.analisarPeca).toHaveBeenCalledWith(ORIGINAL);

  await fireEvent.changeText(screen.getByLabelText('Nome da peça'), '  Blusa  ');
  await fireEvent.press(screen.getByText('Vestidos'));
  await fireEvent.press(screen.getByText('Salvar'));

  await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
  expect(repo.addItem).toHaveBeenCalledWith({
    name: 'Blusa',
    category: 'dress',
    imageBytes: CROPPED,
    swatch: 0xff010203,
    features: { cor_principal: [1, 2, 3] },
  });
});

test('recorte fora do ar: mantém a foto original e salva mesmo assim', async () => {
  analysis.recortarPeca.mockRejectedValue(new Error('fora do ar'));
  await pumpAndPick();
  await waitFor(() => expect(analysis.recortarPeca).toHaveBeenCalled());

  await fireEvent.changeText(screen.getByLabelText('Nome da peça'), 'Blusa');
  await fireEvent.press(screen.getByText('Salvar'));

  await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
  expect(repo.addItem.mock.calls[0][0].imageBytes).toBe(ORIGINAL);
});

test('análise falha: salva sem features e com a cor rosa padrão', async () => {
  analysis.analisarPeca.mockRejectedValue(new Error('api caiu'));
  await pumpAndPick();
  await waitFor(() => expect(analysis.recortarPeca).toHaveBeenCalled());

  await fireEvent.changeText(screen.getByLabelText('Nome da peça'), 'Blusa');
  await fireEvent.press(screen.getByText('Salvar'));

  await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
  expect(repo.addItem.mock.calls[0][0]).toMatchObject({ swatch: 0xffe8a0bf, features: null });
});

test('se salvar falha, mostra o erro e não fecha', async () => {
  repo.addItem.mockRejectedValue(new Error('offline'));
  await pumpAndPick();
  await waitFor(() => expect(analysis.recortarPeca).toHaveBeenCalled());

  await fireEvent.changeText(screen.getByLabelText('Nome da peça'), 'Blusa');
  await fireEvent.press(screen.getByText('Salvar'));

  expect(await screen.findByText('Não foi possível salvar. Tente de novo.')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});

test('trocar a foto durante o recorte: o recorte da antiga não sobrescreve a nova', async () => {
  const SECOND = new Uint8Array([0xff, 0xd8, 2]);
  const SECOND_CROPPED = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 7]);
  let resolveFirst!: (bytes: Uint8Array) => void;
  analysis.recortarPeca
    .mockImplementationOnce(() => new Promise<Uint8Array>((resolve) => (resolveFirst = resolve)))
    .mockResolvedValueOnce(SECOND_CROPPED);
  mockPick.mockResolvedValueOnce(OK).mockResolvedValueOnce({ ...OK, bytes: SECOND });

  // O onPress de "Escolher da galeria" só termina com o recorte; o fireEvent o
  // esperaria, então as escolhas não são aguardadas.
  await renderScreen(<AddItemScreen repository={repo} analysisService={analysis} onClose={onClose} />);
  await fireEvent.press(screen.getByLabelText('Escolher foto'));
  void fireEvent.press(await screen.findByText('Escolher da galeria'));
  await waitFor(() => expect(analysis.recortarPeca).toHaveBeenCalledWith(ORIGINAL));
  await fireEvent.press(screen.getByLabelText('Escolher foto'));
  void fireEvent.press(await screen.findByText('Escolher da galeria'));
  await waitFor(() => expect(analysis.recortarPeca).toHaveBeenCalledWith(SECOND));

  // O recorte da primeira foto termina por último.
  await act(async () => resolveFirst(CROPPED));

  await fireEvent.changeText(screen.getByLabelText('Nome da peça'), 'Blusa');
  await fireEvent.press(screen.getByText('Salvar'));
  await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
  expect(repo.addItem.mock.calls[0][0].imageBytes).toBe(SECOND_CROPPED);
});
