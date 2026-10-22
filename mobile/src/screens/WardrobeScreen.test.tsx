import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { ClothingItem } from '../models/clothingItem';
import { renderScreen } from '../test/render';
import { WardrobeScreen } from './WardrobeScreen';

const item = (id: string, name: string, category: ClothingItem['category']): ClothingItem => ({
  id,
  name,
  category,
  swatch: 0xff7a1836,
  isFavorite: false,
  features: null,
});

function makeRepo(items: ClothingItem[]) {
  return {
    fetchItems: jest.fn(async () => items),
    setFavorite: jest.fn(async () => {}),
    addItem: jest.fn(),
  };
}

const ITEMS = [item('1', 'Blusa rosa', 'top'), item('2', 'Calça jeans', 'bottom')];

test('mostra as peças e filtra por categoria', async () => {
  await renderScreen(<WardrobeScreen repository={makeRepo(ITEMS)} />);

  expect(await screen.findByText('Blusa rosa')).toBeTruthy();
  expect(screen.getByText('Calça jeans')).toBeTruthy();

  await fireEvent.press(screen.getByText('Calças'));
  expect(screen.queryByText('Blusa rosa')).toBeNull();
  expect(screen.getByText('Calça jeans')).toBeTruthy();

  await fireEvent.press(screen.getByText('Saias'));
  expect(screen.getByText('Nenhuma peça nessa categoria ainda.')).toBeTruthy();

  await fireEvent.press(screen.getByText('Todos'));
  expect(screen.getByText('Blusa rosa')).toBeTruthy();
});

test('erro ao carregar mostra "Tentar de novo", que busca outra vez', async () => {
  const repo = makeRepo(ITEMS);
  repo.fetchItems.mockRejectedValueOnce(new Error('offline'));
  await renderScreen(<WardrobeScreen repository={repo} />);

  expect(await screen.findByText('Não foi possível carregar seu guarda-roupa.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Tentar de novo'));

  expect(await screen.findByText('Blusa rosa')).toBeTruthy();
  expect(repo.fetchItems).toHaveBeenCalledTimes(2);
});

test('favoritar muda na hora e salva no repositório', async () => {
  const repo = makeRepo([item('1', 'Blusa rosa', 'top')]);
  await renderScreen(<WardrobeScreen repository={repo} />);
  await screen.findByText('Blusa rosa');

  await fireEvent.press(screen.getByLabelText('Favoritar peça'));

  expect(screen.getByLabelText('Desfavoritar peça')).toBeTruthy();
  expect(repo.setFavorite).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), true);
});

test('se salvar o favorito falha, recarrega do servidor', async () => {
  const repo = makeRepo([item('1', 'Blusa rosa', 'top')]);
  repo.setFavorite.mockRejectedValueOnce(new Error('offline'));
  await renderScreen(<WardrobeScreen repository={repo} />);
  await screen.findByText('Blusa rosa');

  await fireEvent.press(screen.getByLabelText('Favoritar peça'));

  await waitFor(() => expect(repo.fetchItems).toHaveBeenCalledTimes(2));
  expect(await screen.findByLabelText('Favoritar peça')).toBeTruthy();
});

test('o botão + abre o cadastro e voltar não recarrega', async () => {
  const repo = makeRepo(ITEMS);
  await renderScreen(<WardrobeScreen repository={repo} />);
  await screen.findByText('Blusa rosa');

  await fireEvent.press(screen.getByLabelText('Adicionar peça'));
  expect(await screen.findByText('Nova peça')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Voltar'));
  expect(await screen.findByText('Meu guarda-roupa')).toBeTruthy();
  expect(repo.fetchItems).toHaveBeenCalledTimes(1);
});
