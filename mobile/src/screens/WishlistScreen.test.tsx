import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { WishlistItem } from '../models/wishlistItem';
import { renderScreen } from '../test/render';
import { WishlistScreen } from './WishlistScreen';

const ITEMS: WishlistItem[] = [
  { id: 'w1', description: 'Vestido floral', imagePath: 'u/w1.png' },
  { id: 'w2', description: 'Bota preta', imagePath: 'u/w2.png' },
];

function makeRepo(items: WishlistItem[]) {
  return {
    fetchItems: jest.fn(async () => items),
    addItem: jest.fn(),
    deleteItem: jest.fn(async () => {}),
  };
}

test('mostra os itens da wishlist', async () => {
  await renderScreen(<WishlistScreen repository={makeRepo(ITEMS)} />);
  expect(await screen.findByText('Vestido floral')).toBeTruthy();
  expect(screen.getByText('Bota preta')).toBeTruthy();
});

test('wishlist vazia mostra o aviso', async () => {
  await renderScreen(<WishlistScreen repository={makeRepo([])} />);
  expect(await screen.findByText('Nenhuma peça na wishlist ainda.')).toBeTruthy();
});

test('erro ao carregar mostra "Tentar de novo", que busca outra vez', async () => {
  const repo = makeRepo(ITEMS);
  repo.fetchItems.mockRejectedValueOnce(new Error('offline'));
  await renderScreen(<WishlistScreen repository={repo} />);

  expect(await screen.findByText('Não foi possível carregar sua wishlist.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Tentar de novo'));

  expect(await screen.findByText('Vestido floral')).toBeTruthy();
});

test('remover tira o item na hora e apaga no repositório', async () => {
  const repo = makeRepo(ITEMS);
  await renderScreen(<WishlistScreen repository={repo} />);
  await screen.findByText('Vestido floral');

  await fireEvent.press(screen.getAllByLabelText('Remover da wishlist')[0]);

  expect(screen.queryByText('Vestido floral')).toBeNull();
  expect(screen.getByText('Bota preta')).toBeTruthy();
  expect(repo.deleteItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }));
});

test('se apagar falha, o item volta', async () => {
  const repo = makeRepo(ITEMS);
  repo.deleteItem.mockRejectedValueOnce(new Error('offline'));
  await renderScreen(<WishlistScreen repository={repo} />);
  await screen.findByText('Vestido floral');

  await fireEvent.press(screen.getAllByLabelText('Remover da wishlist')[0]);

  expect(await screen.findByText('Vestido floral')).toBeTruthy();
});

test('o botão + abre o cadastro e, ao salvar, recarrega a lista', async () => {
  const repo = makeRepo(ITEMS);
  await renderScreen(<WishlistScreen repository={repo} />);
  await screen.findByText('Vestido floral');

  await fireEvent.press(screen.getByLabelText('Adicionar à wishlist'));
  expect(await screen.findByText('Nova peça da wishlist')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Voltar'));
  await screen.findByText('Wishlist');
  expect(repo.fetchItems).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByText('Vestido floral')).toBeTruthy());
});
