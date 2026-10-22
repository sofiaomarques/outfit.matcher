import { fakeSupabase, ok } from '../test/fakeSupabase';
import { AccountRepository, removeAllFiles } from './accountRepository';

describe('AccountRepository', () => {
  test('email vem da sessão', async () => {
    const { client } = fakeSupabase({ email: 'oi@exemplo.com' });
    expect(await new AccountRepository(client).email()).toBe('oi@exemplo.com');
  });

  test('eraseMyData apaga as linhas de cada tabela e as fotos dos dois buckets', async () => {
    const list = jest
      .fn()
      .mockResolvedValueOnce({ data: [{ id: '1', name: 'a.jpg' }, { id: null, name: 'pasta' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const remove = jest.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const { client, calls } = fakeSupabase({
      storage: {
        'clothing-images': { list, remove },
        'wishlist-images': { list: ok([]), remove },
      },
    });

    await new AccountRepository(client).eraseMyData();

    expect(calls.map((c) => c.table)).toEqual([
      'clothing_items',
      'wishlist_items',
      'outfit_favorites',
      'outfit_wears',
      'outfit_rejections',
    ]);
    expect(calls[0].steps).toEqual([['delete'], ['eq', 'user_id', 'user-1']]);
    expect(list).toHaveBeenCalledWith('user-1');
    expect(remove).toHaveBeenCalledWith(['user-1/a.jpg']);
  });

  test('tabela que ainda não existe é ignorada, outro erro interrompe', async () => {
    const missing = fakeSupabase({
      tables: { outfit_rejections: { error: { code: 'PGRST205' } } },
    });
    await expect(new AccountRepository(missing.client).eraseMyData()).resolves.toBeUndefined();

    const denied = fakeSupabase({ tables: { wishlist_items: { error: { code: '42501' } } } });
    await expect(new AccountRepository(denied.client).eraseMyData()).rejects.toMatchObject({
      code: '42501',
    });
    // Parou na wishlist: as tabelas seguintes nem foram tocadas.
    expect(denied.calls.map((c) => c.table)).toEqual(['clothing_items', 'wishlist_items']);
  });

  test('sem usuário logado não apaga nada', async () => {
    const { client, calls } = fakeSupabase({ userId: null });
    await expect(new AccountRepository(client).eraseMyData()).rejects.toThrow('Usuário não autenticado.');
    expect(calls).toHaveLength(0);
  });

  test('signOut chama o Supabase', async () => {
    const { client, raw } = fakeSupabase();
    await new AccountRepository(client).signOut();
    expect(raw.auth.signOut).toHaveBeenCalled();
  });
});

describe('removeAllFiles', () => {
  test('apaga em lotes até a pasta esvaziar', async () => {
    const batches = [['u/1.jpg', 'u/2.jpg'], ['u/3.jpg'], []];
    const removed: string[][] = [];
    await removeAllFiles({
      list: async () => batches.shift()!,
      remove: async (paths) => {
        removed.push(paths);
        return paths.length;
      },
    });
    expect(removed).toEqual([['u/1.jpg', 'u/2.jpg'], ['u/3.jpg']]);
  });

  test('se o Storage não apaga nada (RLS), lança em vez de repetir pra sempre', async () => {
    await expect(
      removeAllFiles({ list: async () => ['u/1.jpg'], remove: async () => 0 }),
    ).rejects.toThrow('1 foto');
  });
});
