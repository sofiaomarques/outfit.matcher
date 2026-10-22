import type { Rejection, Wear } from '../repositories/outfitHistoryRepository';
import type { OutfitHistoryStore } from '../services/outfitHistory';

/** Histórico de looks em memória, no lugar do Supabase. */
export class FakeHistoryStore implements OutfitHistoryStore {
  constructor(public favorites: string[][] = []) {}
  fail = false;

  fetchFavorites = async () => this.favorites;
  fetchWears = async (): Promise<Wear[]> => [];
  fetchRejections = async (): Promise<Rejection[]> => [];
  addFavorite = async (ids: string[]) => {
    if (this.fail) throw new Error('offline');
    this.favorites = [ids, ...this.favorites];
  };
  removeFavorite = async (ids: string[]) => {
    if (this.fail) throw new Error('offline');
    this.favorites = this.favorites.filter((f) => f.join('+') !== ids.join('+'));
  };
  addWear = async (_ids: string[], _day: Date) => {};
  addRejection = async (_ids: string[], _occasion: string | null) => {};
  removeRejection = async (_ids: string[], _occasion: string | null) => {};
}
