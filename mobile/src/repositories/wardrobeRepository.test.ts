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
  const remove = ok([{ name: 'x' }]);
  const createSignedUrls = ok([{ path: 'user-1/i1.jpg', signedUrl: 'https://signed/x', error: null }]);
  const fake = fakeSupabase({
    tables,
    storage: { 'clothing-images': { upload, remove, createSignedUrls } },
  });
  const repo = new WardrobeRepository(fake.client, () => 'new-id');
  return { ...fake, repo, upload, remove, createSignedUrls };
}

test('detecta PNG vs JPEG pelos bytes', () => {
  expect(detectImageContentType(PNG)).toBe('image/png');
  expect(detectImageContentType(JPEG)).toBe('image/jpeg');
  expect(detectImageContentType(new Uint8Array([0x89]))).toBe('image/jpeg');
});

test('fetchItems converte as linhas e assina a URL da foto', async () => {
  const { repo, calls, createSignedUrls } = setup({ clothing_items: { data: [row] } });

  const [item] = await repo.fetchItems();

  expect(item).toEqual({
    id: 'i1',
    name: 'Blusa',
    category: 'top',
    swatch: 0xff7a1836,
    imageUrl: 'https://signed/x',
    imageUrlExpiresAt: expect.any(Number),
    storagePath: 'user-1/i1.jpg',
    isFavorite: true,
    features: { cor: 'vinho' },
  });
  expect(createSignedUrls).toHaveBeenCalledWith(['user-1/i1.jpg'], 3600);
  expect(calls[0].steps).toEqual([['select'], ['order', 'created_at', { ascending: false }]]);
});

test('categoria desconhecida no banco ignora só aquela peça', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const { repo } = setup({
    clothing_items: { data: [{ ...row, id: 'x', category: 'sapato' }, row] },
  });
  const items = await repo.fetchItems();
  expect(items.map((i) => i.id)).toEqual(['i1']);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test('foto que não pôde ser assinada deixa a peça sem foto, sem derrubar a lista', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const { repo, createSignedUrls } = setup({ clothing_items: { data: [row] } });
  createSignedUrls.mockResolvedValueOnce({
    data: [{ path: 'user-1/i1.jpg', signedUrl: null, error: 'Object not found' }],
    error: null,
  });
  const [item] = await repo.fetchItems();
  expect(item.id).toBe('i1');
  expect(item.imageUrl).toBeUndefined();
  warn.mockRestore();
});

test('refreshImageUrls renova só as URLs vencidas', async () => {
  const { repo, createSignedUrls } = setup();
  const vencida = { id: 'i1', storagePath: 'user-1/i1.jpg', imageUrl: 'velha', imageUrlExpiresAt: 1 } as any;
  const valida = {
    id: 'i2',
    storagePath: 'user-1/i2.jpg',
    imageUrl: 'boa',
    imageUrlExpiresAt: Date.now() + 3_600_000,
  } as any;

  const out = await repo.refreshImageUrls([vencida, valida]);

  expect(createSignedUrls).toHaveBeenCalledWith(['user-1/i1.jpg'], 3600);
  expect(out[0].imageUrl).toBe('https://signed/x');
  expect(out[1]).toBe(valida);
  expect(await repo.refreshImageUrls([valida])).toEqual([valida]);
});

test('se o insert falha, a foto recém-enviada é apagada', async () => {
  const { repo, upload, remove } = setup({ clothing_items: { error: { code: '42501' } } });
  await expect(
    repo.addItem({ name: 'x', category: 'top', imageBytes: PNG, swatch: 1 }),
  ).rejects.toMatchObject({ code: '42501' });
  expect(upload).toHaveBeenCalled();
  expect(remove).toHaveBeenCalledWith(['user-1/new-id.png']);
});

test('deleteItem: falha ao apagar a foto não vira erro (a linha já foi)', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const { repo, remove } = setup();
  remove.mockResolvedValueOnce({ data: null, error: new Error('rede') } as any);
  await expect(repo.deleteItem({ id: 'i1', storagePath: 'user-1/i1.jpg' } as any)).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
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
