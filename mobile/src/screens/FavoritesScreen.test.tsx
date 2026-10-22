import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { ClothingCategory } from '../models/clothingCategory';
import type { ClothingItem } from '../models/clothingItem';
import { makeOutfit } from '../models/outfit';
import { OutfitHistory } from '../services/outfitHistory';
import { FakeHistoryStore } from '../test/fakeHistoryStore';
import { renderScreen } from '../test/render';
import { FavoritesScreen } from './FavoritesScreen';

const item = (id: string, category: ClothingCategory): ClothingItem => ({
  id,
  name: id,
  category,
  swatch: 0xff000000,
  isFavorite: false,
  features: null,
});

const calca = item('a-calca', 'bottom');
const blusa = item('b-blusa', 'top');
const saia = item('c-saia', 'skirt');

function setup(favorites: string[][], wardrobe: ClothingItem[]) {
  const store = new FakeHistoryStore(favorites);
  const history = new OutfitHistory(store);
  const repository = { fetchItems: jest.fn(async () => wardrobe) };
  return { store, history, repository };
}

test('mostra os looks favoritos montados com as peças do guarda-roupa', async () => {
  const { history, repository } = setup([['a-calca', 'b-blusa']], [calca, blusa]);
  await renderScreen(<FavoritesScreen repository={repository} history={history} />);

  expect(await screen.findByLabelText('Desfavoritar look')).toBeTruthy();
});

test('sem favoritos, mostra a dica', async () => {
  const { history, repository } = setup([], [calca, blusa]);
  await renderScreen(<FavoritesScreen repository={repository} history={history} />);

  expect(await screen.findByText(/Nenhum look salvo ainda/)).toBeTruthy();
});

test('look com peça apagada não aparece', async () => {
  const { history, repository } = setup([['a-calca', 'zzz-apagada']], [calca, blusa]);
  await renderScreen(<FavoritesScreen repository={repository} history={history} />);

  expect(await screen.findByText(/Nenhum look salvo ainda/)).toBeTruthy();
  expect(screen.queryByLabelText('Desfavoritar look')).toBeNull();
  // Peça apagada já conhecida não dispara outra busca.
  expect(repository.fetchItems).toHaveBeenCalledTimes(1);
});

test('desfavoritar tira o look da tela e salva', async () => {
  const { store, history, repository } = setup([['a-calca', 'b-blusa']], [calca, blusa]);
  await renderScreen(<FavoritesScreen repository={repository} history={history} />);

  await fireEvent.press(await screen.findByLabelText('Desfavoritar look'));

  await waitFor(() => expect(screen.queryByLabelText('Desfavoritar look')).toBeNull());
  expect(store.favorites).toEqual([]);
});

test('se desfavoritar falha, o look volta e avisa', async () => {
  const { store, history, repository } = setup([['a-calca', 'b-blusa']], [calca, blusa]);
  store.fail = true;
  await renderScreen(<FavoritesScreen repository={repository} history={history} />);

  await fireEvent.press(await screen.findByLabelText('Desfavoritar look'));

  expect(await screen.findByText('Não foi possível salvar o favorito.')).toBeTruthy();
  expect(screen.getByLabelText('Desfavoritar look')).toBeTruthy();
});

test('look favoritado em outra aba com peça nova recarrega o guarda-roupa', async () => {
  const { history, repository } = setup([], [calca, blusa]);
  await renderScreen(<FavoritesScreen repository={repository} history={history} />);
  await screen.findByText(/Nenhum look salvo ainda/);

  // Uma peça cadastrada depois que a tela carregou entra num look favoritado.
  repository.fetchItems.mockResolvedValue([calca, blusa, saia]);
  await act(async () => {
    await history.toggleFavorite(makeOutfit({ id: 'x', items: [blusa, saia], tags: [] }));
  });

  expect(await screen.findByLabelText('Desfavoritar look')).toBeTruthy();
  expect(repository.fetchItems).toHaveBeenCalledTimes(2);
});

test('erro ao carregar mostra "Tentar de novo"', async () => {
  const { history, repository } = setup([['a-calca', 'b-blusa']], [calca, blusa]);
  repository.fetchItems.mockRejectedValueOnce(new Error('offline'));
  await renderScreen(<FavoritesScreen repository={repository} history={history} />);

  expect(await screen.findByText('Não foi possível carregar seus favoritos.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Tentar de novo'));
  expect(await screen.findByLabelText('Desfavoritar look')).toBeTruthy();
});

test('tocar no look abre o detalhe "Look salvo" e voltar retorna à lista', async () => {
  const { history, repository } = setup([['a-calca', 'b-blusa']], [calca, blusa]);
  await renderScreen(<FavoritesScreen repository={repository} history={history} />);
  await screen.findByLabelText('Desfavoritar look');

  await fireEvent.press(screen.getByLabelText('Abrir look'));
  expect(await screen.findByText('Look salvo')).toBeTruthy();
  expect(screen.getByText('Paleta de cores')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Voltar'));
  expect(await screen.findByText('Favoritos')).toBeTruthy();
});
