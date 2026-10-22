import type { ClothingCategory } from '../models/clothingCategory';
import type { ClothingItem } from '../models/clothingItem';
import { makeOutfit, outfitItemIds, outfitKey, type Outfit } from '../models/outfit';
import type { Rejection, Wear } from '../repositories/outfitHistoryRepository';
import { OutfitHistory, describeLastWorn, type OutfitHistoryStore } from './outfitHistory';

/** Repositório em memória no lugar do Supabase. */
class FakeRepository implements OutfitHistoryStore {
  favorites: string[][] = [];
  wears: Wear[] = [];
  rejections: Rejection[] = [];
  fail = false;
  failFetchRejections: false | 'missing' | 'other' = false;
  // Se definido, os favoritos só chegam quando ele resolver.
  gate: Promise<void> | null = null;
  // Falha só pra esses looks (ids juntados com '+').
  failFor = new Set<string>();
  added: string[][] = [];
  removed: string[][] = [];
  worn: Wear[] = [];
  rejected: Rejection[] = [];
  unrejected: Rejection[] = [];

  private maybeFail(itemIds?: string[]) {
    if (this.fail) throw new Error('offline');
    if (itemIds && this.failFor.has(itemIds.join('+'))) throw new Error('recusado');
  }

  async fetchFavorites() {
    const snapshot = this.favorites;
    await this.gate;
    return snapshot;
  }
  async fetchWears() {
    return this.wears;
  }
  async fetchRejections() {
    if (this.failFetchRejections) throw this.failFetchRejections === 'missing' ? { code: 'PGRST205' } : new Error('offline');
    return this.rejections;
  }
  async addRejection(itemIds: string[], occasion: string | null) {
    this.maybeFail(itemIds);
    this.rejected.push({ itemIds, occasion });
  }
  async removeRejection(itemIds: string[], occasion: string | null) {
    this.maybeFail(itemIds);
    this.unrejected.push({ itemIds, occasion });
  }
  async addFavorite(itemIds: string[]) {
    // Deixa outros toques acontecerem antes de responder, como na rede.
    await Promise.resolve();
    this.maybeFail(itemIds);
    this.added.push(itemIds);
  }
  async removeFavorite(itemIds: string[]) {
    this.maybeFail();
    this.removed.push(itemIds);
  }
  async addWear(itemIds: string[], day: Date) {
    this.maybeFail();
    this.worn.push({ itemIds, day });
  }
}

const item = (id: string, category: ClothingCategory): ClothingItem => ({
  id,
  name: id,
  category,
  swatch: 0xff000000,
  isFavorite: false,
  features: null,
});

const look = (items: ClothingItem[]): Outfit =>
  makeOutfit({ id: items.map((i) => i.id).join('+'), items, tags: [] });

const blusa = item('b-blusa', 'top');
const calca = item('a-calca', 'bottom');
const saia = item('c-saia', 'skirt');
const NOW = new Date(2026, 8, 26);

test('o mesmo look é o mesmo, em qualquer ordem das peças', () => {
  expect(outfitKey(look([blusa, calca]))).toBe(outfitKey(look([calca, blusa])));
  expect(outfitItemIds(look([blusa, calca]))).toEqual(['a-calca', 'b-blusa']);
  expect(outfitKey(look([blusa, calca]))).not.toBe(outfitKey(look([blusa, saia])));
});

test('carrega favoritos e o último uso de cada look', async () => {
  const repo = new FakeRepository();
  repo.favorites = [['a-calca', 'b-blusa']];
  repo.wears = [
    { itemIds: ['a-calca', 'b-blusa'], day: new Date(2026, 8, 20) },
    { itemIds: ['a-calca', 'b-blusa'], day: new Date(2026, 8, 1) },
  ];
  const history = new OutfitHistory(repo);

  await history.load(NOW);

  expect(history.isFavorite(look([blusa, calca]))).toBe(true);
  expect(history.isFavorite(look([blusa, saia]))).toBe(false);
  expect(history.lastWorn(look([calca, blusa]))).toEqual(new Date(2026, 8, 20));
});

test('reset esquece tudo e descarta a carga em andamento', async () => {
  const repo = new FakeRepository();
  repo.favorites = [['a-calca', 'b-blusa']];
  const history = new OutfitHistory(repo);
  await history.load(NOW);
  expect(history.isFavorite(look([blusa, calca]))).toBe(true);

  // Uma carga começa antes de apagar e só responde depois.
  let release!: () => void;
  repo.gate = new Promise<void>((resolve) => (release = resolve));
  const stale = history.load(NOW);
  history.reset();
  expect(history.isFavorite(look([blusa, calca]))).toBe(false);

  repo.favorites = [];
  repo.gate = null;
  const fresh = history.load(NOW);
  expect(fresh).not.toBe(stale);
  await fresh;

  // A carga antiga termina depois e não traz o favorito de volta.
  release();
  await stale;
  expect(history.isFavorite(look([blusa, calca]))).toBe(false);
});

test('várias telas carregando juntas compartilham o mesmo pedido', async () => {
  const history = new OutfitHistory(new FakeRepository());
  expect(history.load(NOW)).toBe(history.load(NOW));
  await history.load(NOW);
});

test('ensureLoaded só carrega na primeira vez', async () => {
  const repo = new FakeRepository();
  const spy = jest.spyOn(repo, 'fetchFavorites');
  const history = new OutfitHistory(repo);
  await history.ensureLoaded();
  await history.ensureLoaded();
  expect(spy).toHaveBeenCalledTimes(1);
});

test('favoritar e desfavoritar salvam no repositório', async () => {
  const repo = new FakeRepository();
  const history = new OutfitHistory(repo);
  const l = look([blusa, calca]);

  expect(await history.toggleFavorite(l)).toBe(true);
  expect(history.isFavorite(l)).toBe(true);
  expect(history.favorites[0]).toEqual(['a-calca', 'b-blusa']);
  expect(repo.added).toEqual([['a-calca', 'b-blusa']]);

  expect(await history.toggleFavorite(l)).toBe(true);
  expect(history.isFavorite(l)).toBe(false);
  expect(repo.removed).toEqual([['a-calca', 'b-blusa']]);
});

test('se o Supabase recusa, o favorito é desfeito', async () => {
  const repo = new FakeRepository();
  repo.fail = true;
  const history = new OutfitHistory(repo);
  const l = look([blusa, calca]);
  const listener = jest.fn();
  history.subscribe(listener);

  expect(await history.toggleFavorite(l)).toBe(false);
  expect(history.isFavorite(l)).toBe(false);
  expect(listener).toHaveBeenCalledTimes(2); // aparece na hora, depois some
});

test('getSnapshot muda a cada notificação e subscribe devolve o cancelamento', async () => {
  const history = new OutfitHistory(new FakeRepository());
  const listener = jest.fn();
  const unsubscribe = history.subscribe(listener);
  const before = history.getSnapshot();
  await history.toggleFavorite(look([blusa, calca]));
  expect(history.getSnapshot()).not.toBe(before);
  unsubscribe();
  listener.mockClear();
  history.reset();
  expect(listener).not.toHaveBeenCalled();
});

test('marcar como usado guarda o dia local, sem hora', async () => {
  const repo = new FakeRepository();
  const history = new OutfitHistory(repo);
  const l = look([blusa, calca]);

  expect(await history.markWorn(l, new Date(2026, 8, 26, 23, 50))).toBe(true);
  expect(history.lastWorn(l)).toEqual(new Date(2026, 8, 26));
  expect(repo.worn[0].day).toEqual(new Date(2026, 8, 26));

  repo.fail = true;
  expect(await history.markWorn(l, new Date(2026, 8, 27))).toBe(false);
  expect(history.lastWorn(l)).toEqual(new Date(2026, 8, 26));
});

test('marcar como usado e falhar, sem uso anterior, não deixa rastro', async () => {
  const repo = new FakeRepository();
  repo.fail = true;
  const history = new OutfitHistory(repo);
  const l = look([blusa, calca]);
  expect(await history.markWorn(l, NOW)).toBe(false);
  expect(history.lastWorn(l)).toBeUndefined();
  expect(history.wornLooks).toEqual([]);
});

test('falha de um favorito não desfaz outro favoritado ao mesmo tempo', async () => {
  const repo = new FakeRepository();
  repo.failFor.add('b-blusa+c-saia');
  const history = new OutfitHistory(repo);
  const recusado = look([blusa, saia]);
  const aceito = look([blusa, calca]);

  const results = await Promise.all([
    history.toggleFavorite(recusado),
    history.toggleFavorite(aceito),
  ]);

  expect(results).toEqual([false, true]);
  expect(history.isFavorite(recusado)).toBe(false);
  expect(history.isFavorite(aceito)).toBe(true);
});

test('rejeição vale só na ocasião em que foi dada, e dá pra desfazer', async () => {
  const repo = new FakeRepository();
  const history = new OutfitHistory(repo);
  const l = look([blusa, calca]);

  expect(await history.reject(l, 'trabalho')).toBe(true);
  expect(history.isRejected(l, 'trabalho')).toBe(true);
  expect(history.isRejected(l, 'casual')).toBe(false);
  expect(repo.rejected[0]).toEqual({ itemIds: ['a-calca', 'b-blusa'], occasion: 'trabalho' });

  expect(await history.undoReject(l, 'trabalho')).toBe(true);
  expect(history.isRejected(l, 'trabalho')).toBe(false);
  expect(repo.unrejected[0].occasion).toBe('trabalho');
});

test('rejeitar de novo o mesmo look na mesma ocasião não repete o pedido', async () => {
  const repo = new FakeRepository();
  const history = new OutfitHistory(repo);
  const l = look([blusa, calca]);
  await history.reject(l, 'festa');
  expect(await history.reject(l, 'festa')).toBe(true);
  expect(repo.rejected).toHaveLength(1);
});

test('se o Supabase recusa, a rejeição é desfeita', async () => {
  const repo = new FakeRepository();
  repo.fail = true;
  const history = new OutfitHistory(repo);
  const l = look([blusa, calca]);

  expect(await history.reject(l, 'festa')).toBe(false);
  expect(history.isRejected(l, 'festa')).toBe(false);
});

test('se desfazer a rejeição falha, ela volta', async () => {
  const repo = new FakeRepository();
  const history = new OutfitHistory(repo);
  const l = look([blusa, calca]);
  await history.reject(l, 'festa');
  repo.fail = true;
  expect(await history.undoReject(l, 'festa')).toBe(false);
  expect(history.isRejected(l, 'festa')).toBe(true);
});

test('carrega rejeições e usos pro recomendador', async () => {
  const repo = new FakeRepository();
  repo.rejections = [{ itemIds: ['a-calca', 'b-blusa'], occasion: 'trabalho' }];
  repo.wears = [{ itemIds: ['a-calca', 'b-blusa'], day: new Date(2026, 8, 24) }];
  const history = new OutfitHistory(repo);

  await history.load(NOW);

  expect(history.isRejected(look([calca, blusa]), 'trabalho')).toBe(true);
  expect(history.wornLooks).toEqual([
    { itemIds: ['a-calca', 'b-blusa'], day: new Date(2026, 8, 24) },
  ]);
});

test('sem a tabela de rejeições, favoritos continuam carregando', async () => {
  const repo = new FakeRepository();
  repo.failFetchRejections = 'missing';
  repo.favorites = [['a-calca', 'b-blusa']];
  const history = new OutfitHistory(repo);

  await history.load(NOW);

  expect(history.isFavorite(look([blusa, calca]))).toBe(true);
  expect(history.rejections).toEqual([]);
});

test('erro que não é tabela ausente nas rejeições não é engolido', async () => {
  const repo = new FakeRepository();
  repo.failFetchRejections = 'other';
  const history = new OutfitHistory(repo);

  await expect(history.load(NOW)).rejects.toThrow('offline');
  // Não marcou como carregado: a próxima tela tenta de novo.
  repo.failFetchRejections = false;
  const spy = jest.spyOn(repo, 'fetchFavorites');
  await history.ensureLoaded();
  expect(spy).toHaveBeenCalled();
});

test('descreve há quanto tempo o look foi usado', () => {
  const now = new Date(2026, 8, 26, 15);
  expect(describeLastWorn(new Date(2026, 8, 26), now)).toBe('Usado hoje');
  expect(describeLastWorn(new Date(2026, 8, 25), now)).toBe('Usado ontem');
  expect(describeLastWorn(new Date(2026, 8, 19), now)).toBe('Usado há 7 dias');
});
