import { fakeSupabase } from '../test/fakeSupabase';
import { OutfitHistoryRepository, dateOnly, parseDateOnly } from './outfitHistoryRepository';

test('dateOnly e parseDateOnly usam o dia local', () => {
  expect(dateOnly(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  const parsed = parseDateOnly('2026-09-20');
  expect([parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), parsed.getHours()]).toEqual([
    2026, 8, 20, 0,
  ]);
});

test('fetchFavorites devolve os ids de cada look', async () => {
  const { client, calls } = fakeSupabase({
    tables: { outfit_favorites: { data: [{ item_ids: ['a', 'b'] }, { item_ids: ['c'] }] } },
  });
  expect(await new OutfitHistoryRepository(client).fetchFavorites()).toEqual([['a', 'b'], ['c']]);
  expect(calls[0].steps).toEqual([
    ['select', 'item_ids'],
    ['order', 'created_at', { ascending: false }],
  ]);
});

test('addFavorite faz upsert sem duplicar', async () => {
  const { client, calls } = fakeSupabase();
  await new OutfitHistoryRepository(client).addFavorite(['a', 'b']);
  expect(calls[0].steps).toEqual([
    [
      'upsert',
      { user_id: 'user-1', item_ids: ['a', 'b'] },
      { onConflict: 'user_id,item_ids', ignoreDuplicates: true },
    ],
  ]);
});

test('removeFavorite casa o mesmo conjunto de peças (contains + containedBy)', async () => {
  const { client, calls } = fakeSupabase();
  await new OutfitHistoryRepository(client).removeFavorite(['a', 'b']);
  expect(calls[0].steps).toEqual([
    ['delete'],
    ['contains', 'item_ids', ['a', 'b']],
    ['containedBy', 'item_ids', ['a', 'b']],
  ]);
});

test('fetchRejections traz a ocasião, nula = geral', async () => {
  const { client } = fakeSupabase({
    tables: {
      outfit_rejections: {
        data: [
          { item_ids: ['a'], ocasiao: 'trabalho' },
          { item_ids: ['b'], ocasiao: null },
        ],
      },
    },
  });
  expect(await new OutfitHistoryRepository(client).fetchRejections()).toEqual([
    { itemIds: ['a'], occasion: 'trabalho' },
    { itemIds: ['b'], occasion: null },
  ]);
});

test('removeRejection sem ocasião filtra por ocasiao IS NULL', async () => {
  const { client, calls } = fakeSupabase();
  const repo = new OutfitHistoryRepository(client);
  await repo.removeRejection(['a'], null);
  await repo.removeRejection(['a'], 'festa');
  expect(calls[0].steps.at(-1)).toEqual(['is', 'ocasiao', null]);
  expect(calls[1].steps.at(-1)).toEqual(['eq', 'ocasiao', 'festa']);
});

test('addRejection grava a ocasião no upsert', async () => {
  const { client, calls } = fakeSupabase();
  await new OutfitHistoryRepository(client).addRejection(['a'], 'festa');
  expect(calls[0].steps[0]).toEqual([
    'upsert',
    { user_id: 'user-1', item_ids: ['a'], ocasiao: 'festa' },
    { onConflict: 'user_id,item_ids,ocasiao', ignoreDuplicates: true },
  ]);
});

test('fetchWears filtra desde o dia e converte worn_on pra dia local', async () => {
  const { client, calls } = fakeSupabase({
    tables: { outfit_wears: { data: [{ item_ids: ['a'], worn_on: '2026-09-20' }] } },
  });
  const wears = await new OutfitHistoryRepository(client).fetchWears(new Date(2026, 5, 28));
  expect(wears).toEqual([{ itemIds: ['a'], day: new Date(2026, 8, 20) }]);
  expect(calls[0].steps).toEqual([
    ['select', 'item_ids, worn_on'],
    ['gte', 'worn_on', '2026-06-28'],
    ['order', 'worn_on', { ascending: false }],
  ]);
});

test('addWear grava o dia sem hora', async () => {
  const { client, calls } = fakeSupabase();
  await new OutfitHistoryRepository(client).addWear(['a'], new Date(2026, 8, 26, 23, 50));
  expect(calls[0].steps[0]).toEqual([
    'upsert',
    { user_id: 'user-1', item_ids: ['a'], worn_on: '2026-09-26' },
    { onConflict: 'user_id,item_ids,worn_on', ignoreDuplicates: true },
  ]);
});

test('escrita sem usuário logado lança antes de ir ao banco', async () => {
  const { client, calls } = fakeSupabase({ userId: null });
  await expect(new OutfitHistoryRepository(client).addFavorite(['a'])).rejects.toThrow(
    'Usuário não autenticado.',
  );
  expect(calls).toHaveLength(0);
});
