import { keyFor, outfitItemIds, outfitKey, sortedIds, type Outfit } from '../models/outfit';
import {
  OutfitHistoryRepository,
  type Rejection,
  type Wear,
} from '../repositories/outfitHistoryRepository';
import { isTableMissing } from '../repositories/supabaseHelpers';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Janela do histórico de uso carregado. */
export const WEAR_WINDOW_DAYS = 90;

/** Contrato que o OutfitHistory usa do repositório (facilita trocar por um em memória nos testes). */
export type OutfitHistoryStore = Pick<
  OutfitHistoryRepository,
  | 'fetchFavorites'
  | 'fetchWears'
  | 'fetchRejections'
  | 'addFavorite'
  | 'removeFavorite'
  | 'addWear'
  | 'addRejection'
  | 'removeRejection'
>;

function startOfDay(moment: Date): Date {
  return new Date(moment.getFullYear(), moment.getMonth(), moment.getDate());
}

/**
 * Favoritos, rejeições e último uso de cada look, compartilhados por todas as
 * telas (Novo look, Seus looks, detalhe do look, Favoritos): favoritar numa
 * aba já aparece nas outras. As mudanças aparecem na hora e são desfeitas se
 * o Supabase recusar. Também é o feedback que o recomendador usa.
 *
 * Para React: `useSyncExternalStore(history.subscribe, history.getSnapshot)`.
 */
export class OutfitHistory {
  private repositoryOverride: OutfitHistoryStore | undefined;
  private repositoryInstance: OutfitHistoryStore | undefined;

  private _favorites: string[][] = [];
  private _rejections: Rejection[] = [];
  private lastWornByKey = new Map<string, Date>();
  private wornIds = new Map<string, string[]>();
  private loading: Promise<void> | null = null;
  private loaded = false;
  // Muda em [reset]: uma carga que começou antes descarta o que trouxe.
  private generation = 0;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(repository?: OutfitHistoryStore) {
    this.repositoryOverride = repository;
  }

  // Criado só no primeiro uso, pra não exigir o Supabase nos testes.
  private get repository(): OutfitHistoryStore {
    return (this.repositoryInstance ??= this.repositoryOverride ?? new OutfitHistoryRepository());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Número que muda a cada notificação (snapshot pro `useSyncExternalStore`). */
  getSnapshot = (): number => this.version;

  private notify(): void {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }

  /** Ids das peças de cada look favoritado, do mais recente pro mais antigo. */
  get favorites(): readonly string[][] {
    return this._favorites;
  }

  isFavorite(outfit: Outfit): boolean {
    const key = outfitKey(outfit);
    return this._favorites.some((ids) => keyFor(ids) === key);
  }

  /** Looks rejeitados, com a ocasião em que foram (nula = geral). */
  get rejections(): readonly Rejection[] {
    return this._rejections;
  }

  /** Looks usados dentro de [WEAR_WINDOW_DAYS], com o último dia de uso. */
  get wornLooks(): Wear[] {
    return [...this.lastWornByKey].map(([key, day]) => ({ itemIds: this.wornIds.get(key)!, day }));
  }

  /** Último dia (dentro da janela) em que o look foi marcado como usado, ou undefined. */
  lastWorn(outfit: Outfit): Date | undefined {
    return this.lastWornByKey.get(outfitKey(outfit));
  }

  /**
   * Recarrega do Supabase. Várias telas abrem juntas e chamam isso ao mesmo
   * tempo; elas compartilham o mesmo pedido.
   */
  load(now: Date = new Date()): Promise<void> {
    if (this.loading) return this.loading;
    const loading = this.doLoad(now, this.generation);
    this.loading = loading;
    const clear = () => {
      // Depois de um [reset], `loading` já pode ser outra carga.
      if (this.loading === loading) this.loading = null;
    };
    loading.then(clear, clear);
    return loading;
  }

  /** Carrega só se ainda não carregou nenhuma vez. */
  ensureLoaded(): Promise<void> {
    return this.loaded ? Promise.resolve() : this.load();
  }

  /**
   * Esquece tudo o que foi carregado (depois de sair da conta ou de apagar os
   * dados). Uma carga em andamento não preenche mais nada: o próximo [load]
   * busca de novo.
   */
  reset(): void {
    this.generation++;
    this.loading = null;
    this.loaded = false;
    this._favorites = [];
    this._rejections = [];
    this.lastWornByKey = new Map();
    this.wornIds = new Map();
    this.notify();
  }

  private async doLoad(now: Date, generation: number): Promise<void> {
    const since = new Date(now.getTime() - WEAR_WINDOW_DAYS * DAY_MS);
    const [favorites, wears, rejections] = await Promise.all([
      this.repository.fetchFavorites(),
      this.repository.fetchWears(since),
      // Tabela mais nova: se ainda não foi criada no projeto Supabase, os
      // favoritos e usos continuam funcionando, só sem rejeições. Qualquer
      // outro erro (rede, permissão) sobe: carregar sem rejeições faria o
      // recomendador voltar a sugerir looks rejeitados.
      this.repository.fetchRejections().catch((error): Rejection[] => {
        if (isTableMissing(error)) return [];
        throw error;
      }),
    ]);
    if (generation !== this.generation) return;
    this._favorites = favorites;
    this._rejections = rejections;
    this.lastWornByKey = new Map();
    this.wornIds = new Map();
    for (const { itemIds, day } of wears) {
      // Vem do mais recente pro mais antigo: o primeiro de cada look vale.
      const key = keyFor(itemIds);
      if (!this.lastWornByKey.has(key)) this.lastWornByKey.set(key, day);
      this.wornIds.set(key, sortedIds(itemIds));
    }
    this.loaded = true;
    this.notify();
  }

  /** Favorita ou desfavorita. Devolve false (e desfaz) se não conseguiu salvar. */
  async toggleFavorite(outfit: Outfit): Promise<boolean> {
    const ids = outfitItemIds(outfit);
    const adding = !this.isFavorite(outfit);
    this.setFavorite(ids, adding);
    try {
      if (adding) await this.repository.addFavorite(ids);
      else await this.repository.removeFavorite(ids);
      return true;
    } catch {
      // Desfaz só esse look: restaurar a lista inteira apagaria toques em
      // outros looks feitos enquanto esse salvava.
      this.setFavorite(ids, !adding);
      return false;
    }
  }

  private setFavorite(ids: string[], favorite: boolean): void {
    const key = keyFor(ids);
    this._favorites = [
      ...(favorite ? [ids] : []),
      ...this._favorites.filter((f) => keyFor(f) !== key),
    ];
    this.notify();
  }

  /** Marca o look como usado hoje. Devolve false (e desfaz) se não conseguiu salvar. */
  async markWorn(outfit: Outfit, now: Date = new Date()): Promise<boolean> {
    const today = startOfDay(now);
    const key = outfitKey(outfit);
    const ids = outfitItemIds(outfit);
    const before = this.lastWornByKey.get(key);
    this.lastWornByKey.set(key, today);
    this.wornIds.set(key, ids);
    this.notify();
    try {
      await this.repository.addWear(ids, today);
      return true;
    } catch {
      if (before === undefined) {
        this.lastWornByKey.delete(key);
        this.wornIds.delete(key);
      } else {
        this.lastWornByKey.set(key, before);
      }
      this.notify();
      return false;
    }
  }

  isRejected(outfit: Outfit, occasion: string | null = null): boolean {
    const key = outfitKey(outfit);
    return this._rejections.some((r) => keyFor(r.itemIds) === key && r.occasion === occasion);
  }

  /**
   * "Não curti": o look não volta nessa ocasião (a chave, ex.: 'trabalho').
   * Devolve false (e desfaz) se não conseguiu salvar.
   */
  async reject(outfit: Outfit, occasion: string | null = null): Promise<boolean> {
    if (this.isRejected(outfit, occasion)) return true;
    const ids = outfitItemIds(outfit);
    this.setRejected(ids, occasion, true);
    try {
      await this.repository.addRejection(ids, occasion);
      return true;
    } catch {
      this.setRejected(ids, occasion, false);
      return false;
    }
  }

  /** Desfaz um [reject]. Devolve false (e desfaz) se não conseguiu salvar. */
  async undoReject(outfit: Outfit, occasion: string | null = null): Promise<boolean> {
    const ids = outfitItemIds(outfit);
    this.setRejected(ids, occasion, false);
    try {
      await this.repository.removeRejection(ids, occasion);
      return true;
    } catch {
      this.setRejected(ids, occasion, true);
      return false;
    }
  }

  private setRejected(ids: string[], occasion: string | null, rejected: boolean): void {
    const key = keyFor(ids);
    this._rejections = [
      ...(rejected ? [{ itemIds: ids, occasion }] : []),
      ...this._rejections.filter((r) => !(keyFor(r.itemIds) === key && r.occasion === occasion)),
    ];
    this.notify();
  }
}

export const outfitHistory = new OutfitHistory();

/** "Usado hoje", "Usado ontem", "Usado há 5 dias". */
export function describeLastWorn(day: Date, now: Date = new Date()): string {
  const today = startOfDay(now);
  // Arredonda as horas: com horário de verão um "dia" pode ter 23 ou 25h.
  const hours = (today.getTime() - startOfDay(day).getTime()) / (60 * 60 * 1000);
  const days = Math.round(hours / 24);
  if (days <= 0) return 'Usado hoje';
  if (days === 1) return 'Usado ontem';
  return `Usado há ${days} dias`;
}
