import { fakeSupabase, ok, type FakeOptions } from '../test/fakeSupabase';
import { WishlistRepository } from './wishlistRepository';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const row = { id: 'w1', description: 'vestido floral', image_path: 'user-1/w1.png' };

function setup(tables: FakeOptions['tables'] = {}) {
  const upload = ok({});
  const remove = ok([{ name: 'x' }]);
  const createSignedUrls = ok([{ path: 'user-1/w1.png', signedUrl: 'https://signed/w', error: null }]);
  const fake = fakeSupabase({
    tables,
    storage: { 'wishlist-images': { upload, remove, createSignedUrls } },
  });
  return { ...fake, repo: new WishlistRepository(fake.client, () => 'new-id'), upload, remove };
}

test('fetchItems devolve descrição, caminho e URL assinada', async () => {
  const { repo } = setup({ wishlist_items: { data: [row] } });
  expect(await repo.fetchItems()).toEqual([
    {
      id: 'w1',
      description: 'vestido floral',
      imagePath: 'user-1/w1.png',
      imageUrl: 'https://signed/w',
      imageUrlExpiresAt: expect.any(Number),
    },
  ]);
});

test('addItem sobe a foto no bucket wishlist-images e insere a linha', async () => {
  const { repo, calls, upload } = setup({ wishlist_items: { data: row } });

  await repo.addItem({ description: 'vestido floral', imageBytes: PNG });

  expect(upload).toHaveBeenCalledWith('user-1/new-id.png', PNG, { contentType: 'image/png' });
  expect(calls[0].steps[0]).toEqual([
    'insert',
    {
      id: 'new-id',
      user_id: 'user-1',
      description: 'vestido floral',
      image_path: 'user-1/new-id.png',
    },
  ]);
});

test('deleteItem apaga a linha e a foto', async () => {
  const { repo, calls, remove } = setup();
  await repo.deleteItem({ id: 'w1', description: '', imagePath: 'user-1/w1.png' });
  expect(calls[0].steps).toEqual([['delete'], ['eq', 'id', 'w1']]);
  expect(remove).toHaveBeenCalledWith(['user-1/w1.png']);
});

test('se o upload falha, a linha não é criada', async () => {
  const upload = jest.fn(async () => ({ data: null, error: new Error('sem espaço') }));
  const fake = fakeSupabase({ storage: { 'wishlist-images': { upload } } });
  const repo = new WishlistRepository(fake.client, () => 'x');
  await expect(repo.addItem({ description: 'x', imageBytes: PNG })).rejects.toThrow('sem espaço');
  expect(fake.calls).toHaveLength(0);
});

test('se o insert falha, a foto recém-enviada é apagada', async () => {
  const { repo, remove } = setup({ wishlist_items: { error: { code: '42501' } } });
  await expect(repo.addItem({ description: 'x', imageBytes: PNG })).rejects.toMatchObject({
    code: '42501',
  });
  expect(remove).toHaveBeenCalledWith(['user-1/new-id.png']);
});
