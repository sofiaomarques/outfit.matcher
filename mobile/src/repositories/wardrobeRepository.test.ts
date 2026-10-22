import { fakeSupabase, ok, type FakeOptions } from '../test/fakeSupabase';
import { WardrobeRepository } from './wardrobeRepository';
import { detectImageContentType } from './supabaseHelpers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

const row = {
  id: 'i1',
  name: 'Blusa',
  category: 'top',
  image_path: 'user-1/i1.jpg',
  swatch_color: 0xff7a1836,
  is_favorite: true,
  features: { cor: 'vinho' },
};

function setup(tables: FakeOptions['tables'] = {}) {
  const upload = ok({});
  const remove = ok([]);
  const createSignedUrl = ok({ signedUrl: 'https://signed/x' });
  const fake = fakeSupabase({
    tables,
    storage: { 'clothing-images': { upload, remove, createSignedUrl } },
  });
  const repo = new WardrobeRepository(fake.client, () => 'new-id');
  return { ...fake, repo, upload, remove, createSignedUrl };
}

test('detecta PNG vs JPEG pelos bytes', () => {
  expect(detectImageContentType(PNG)).toBe('image/png');
  expect(detectImageContentType(JPEG)).toBe('image/jpeg');
  expect(detectImageContentType(new Uint8Array([0x89]))).toBe('image/jpeg');
});

test('fetchItems converte as linhas e assina a URL da foto', async () => {
  const { repo, calls, createSignedUrl } = setup({ clothing_items: { data: [row] } });

  const [item] = await repo.fetchItems();

  expect(item).toEqual({
    id: 'i1',
    name: 'Blusa',
    category: 'top',
    swatch: 0xff7a1836,
    imageUrl: 'https://signed/x',
    storagePath: 'user-1/i1.jpg',
    isFavorite: true,
    features: { cor: 'vinho' },
  });
  expect(createSignedUrl).toHaveBeenCalledWith('user-1/i1.jpg', 3600);
  expect(calls[0].steps).toEqual([['select'], ['order', 'created_at', { ascending: false }]]);
});

test('categoria desconhecida no banco lança, como o byName do Dart', async () => {
  const { repo } = setup({ clothing_items: { data: [{ ...row, category: 'sapato' }] } });
  await expect(repo.fetchItems()).rejects.toThrow('sapato');
});

test('addItem sobe a foto em {user}/{id}.png e insere a linha', async () => {
  const { repo, calls, upload } = setup({ clothing_items: { data: row } });

  await repo.addItem({
    name: 'Blusa',
    category: 'top',
    imageBytes: PNG,
    swatch: 0xff7a1836,
    features: { a: 1 },
  });

  expect(upload).toHaveBeenCalledWith('user-1/new-id.png', PNG, { contentType: 'image/png' });
  expect(calls[0].steps[0]).toEqual([
    'insert',
    {
      id: 'new-id',
      user_id: 'user-1',
      name: 'Blusa',
      category: 'top',
      image_path: 'user-1/new-id.png',
      swatch_color: 0xff7a1836,
      features: { a: 1 },
    },
  ]);
});

test('addItem com JPEG usa .jpg e features nulas', async () => {
  const { repo, calls, upload } = setup({ clothing_items: { data: row } });
  await repo.addItem({ name: 'x', category: 'dress', imageBytes: JPEG, swatch: 1 });
  expect(upload.mock.calls[0][0]).toBe('user-1/new-id.jpg');
  expect((calls[0].steps[0][1] as any).features).toBeNull();
});

test('addItem sem usuário logado não sobe nada', async () => {
  const upload = ok({});
  const { client } = fakeSupabase({ userId: null, storage: { 'clothing-images': { upload } } });
  const repo = new WardrobeRepository(client, () => 'x');
  await expect(
    repo.addItem({ name: 'x', category: 'top', imageBytes: PNG, swatch: 1 }),
  ).rejects.toThrow('Usuário não autenticado.');
  expect(upload).not.toHaveBeenCalled();
});

test('erro do Supabase vira exceção', async () => {
  const { repo } = setup({ clothing_items: { error: { code: '42501', message: 'rls' } } });
  await expect(repo.fetchItems()).rejects.toMatchObject({ code: '42501' });
});

test('updateFeatures só troca a cor quando ela é informada', async () => {
  const { repo, calls } = setup();
  const item = { id: 'i1' } as any;

  await repo.updateFeatures(item, { f: 1 });
  await repo.updateFeatures(item, { f: 2 }, 99);

  expect(calls[0].steps).toEqual([['update', { features: { f: 1 } }], ['eq', 'id', 'i1']]);
  expect(calls[1].steps[0]).toEqual(['update', { features: { f: 2 }, swatch_color: 99 }]);
});

test('setFavorite atualiza a coluna is_favorite', async () => {
  const { repo, calls } = setup();
  await repo.setFavorite({ id: 'i1' } as any, true);
  expect(calls[0].steps).toEqual([['update', { is_favorite: true }], ['eq', 'id', 'i1']]);
});

test('deleteItem apaga a linha e depois a foto', async () => {
  const { repo, calls, remove } = setup();
  await repo.deleteItem({ id: 'i1', storagePath: 'user-1/i1.jpg' } as any);
  expect(calls[0].steps).toEqual([['delete'], ['eq', 'id', 'i1']]);
  expect(remove).toHaveBeenCalledWith(['user-1/i1.jpg']);
});

test('deleteItem sem foto não mexe no Storage', async () => {
  const { repo, remove } = setup();
  await repo.deleteItem({ id: 'i1' } as any);
  expect(remove).not.toHaveBeenCalled();
});
