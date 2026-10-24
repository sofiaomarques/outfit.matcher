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

    // Cada tabela: o delete e a conferência de que não sobrou linha.
    expect(calls.map((c) => c.table)).toEqual(
      ['clothing_items', 'wishlist_items', 'outfit_favorites', 'outfit_wears', 'outfit_rejections'].flatMap(
        (table) => [table, table],
      ),
    );
    expect(calls[0].steps).toEqual([['delete'], ['eq', 'user_id', 'user-1']]);
    expect(calls[1].steps).toEqual([
      ['select', 'id', { count: 'exact', head: true }],
      ['eq', 'user_id', 'user-1'],
    ]);
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
    expect(denied.calls.map((c) => c.table)).toEqual(['clothing_items', 'clothing_items', 'wishlist_items']);
  });

  test('delete recusado em silêncio pelo RLS (sobrou linha) vira erro', async () => {
    // Sem a policy de delete, o PostgREST responde sem erro e não apaga nada.
    const { client, calls } = fakeSupabase({
      tables: {
        outfit_wears: (call) => (call.steps[0][0] === 'select' ? { count: 3 } : {}),
      },
    });
    await expect(new AccountRepository(client).eraseMyData()).rejects.toThrow(
      '3 registro(s) de outfit_wears não foram apagados.',
    );
    // Parou antes das rejeições e das fotos.
    expect(calls.map((c) => c.table)).not.toContain('outfit_rejections');
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
