import type { ClothingItem } from '../models/clothingItem';
import { makeOutfit, type Outfit } from '../models/outfit';
import { WardrobeRepository } from '../repositories/wardrobeRepository';
import { API_BASE_URL } from './apiConfig';
import { ApiException, ApiStatus, apiStatus, fetchWithTimeout, type FetchFn } from './apiStatus';
import { GarmentAnalysisService, garmentAnalysis, swatchFromFeatures } from './garmentAnalysis';
import { outfitHistory, type OutfitHistory } from './outfitHistory';
import { authHeaders } from './supabase';

/** Ocasiões de "Novo look" -> chave aceita por `/looks/recommend` (`OCASIOES` em `model/recomendar.py`). */
export const occasionKeys: Record<string, string> = {
  Casual: 'casual',
  Trabalho: 'trabalho',
  Festa: 'festa',
  Encontro: 'encontro',
  'Dia a dia': 'dia_a_dia',
};

/**
 * Filtros de clima de "Seus looks" -> chave de `CLIMAS` no recomendador.
 * "Qualquer clima" fica de fora de propósito: é o mesmo que não mandar.
 */
export const weatherKeys: Record<string, string> = {
  Calor: 'calor',
  Frio: 'frio',
  Chuva: 'chuva',
};

/**
 * Mesmo valor de `VERSAO_FEATURES` em `features/embedding_neural.py`. Peças
 * analisadas com versão anterior são reanalisadas.
 */
export const FEATURES_VERSION = 2;

/**
 * Existem peças no guarda-roupa, mas nenhuma pôde ser analisada: diferente de
 * um guarda-roupa vazio.
 */
export class NoAnalyzedItemsException extends Error {
  constructor() {
    super('Nenhuma peça analisada');
    this.name = 'NoAnalyzedItemsException';
  }
}

/** Mensagem pra mostrar na tela quando o recomendador ou a análise falham. */
export function describeRecommendError(error: unknown, fallback: string): string {
  if (error instanceof ApiException) return error.userMessage;
  if (error instanceof NoAnalyzedItemsException) {
    return 'Não foi possível analisar suas peças. Tente de novo em instantes.';
  }
  return fallback;
}

type WardrobeStore = Pick<WardrobeRepository, 'fetchItems' | 'downloadImage' | 'updateFeatures'>;
type HistorySource = Pick<OutfitHistory, 'ensureLoaded' | 'favorites' | 'rejections' | 'wornLooks'>;
type Progress = (done: number, total: number) => void;

function needsAnalysis(item: ClothingItem): boolean {
  const version = (item.features?.versao_features as number | undefined) ?? 1;
  return item.features === null || version < FEATURES_VERSION;
}

/**
 * Monta looks com as peças reais do guarda-roupa, chamando o recomendador da
 * API Python (`model/recomendar.py`): compatibilidade entre as peças (modelo
 * treinado) + ocasião + clima + feedback da usuária (favoritos, rejeições e
 * usos do OutfitHistory), com variedade entre os looks. Sem API (fora do ar,
 * sem internet, não acordou), lança `ApiException`.
 */
export class RecommendationService {
  // "Novo look" e "Seus looks" nascem juntas e as duas carregam o
  // guarda-roupa: compartilham a mesma análise em andamento em vez de
  // analisar as mesmas peças duas vezes.
  private static pendingLoad: Promise<ClothingItem[]> | null = null;
  private static progressListeners = new Set<Progress>();

  /** Esquece a carga em andamento (troca de conta / dados apagados): a próxima não herda o guarda-roupa antigo. */
  static reset(): void {
    RecommendationService.pendingLoad = null;
    RecommendationService.progressListeners.clear();
  }

  constructor(
    private readonly repository: WardrobeStore = new WardrobeRepository(),
    private readonly analysis: Pick<GarmentAnalysisService, 'analisarPeca'> = garmentAnalysis,
    private readonly history: HistorySource = outfitHistory,
    private readonly api: ApiStatus = apiStatus,
    private readonly fetchFn: FetchFn = (url, init) => fetch(url, init),
    private readonly headers: () => Promise<Record<string, string>> = authHeaders,
  ) {}

  /**
   * Busca o guarda-roupa e analisa as peças sem features (cadastradas antes da
   * análise automática, ou com a API fora do ar no upload) ou com features de
   * uma versão antiga do pipeline, salvando o resultado no Supabase. Se a
   * análise falhar, a peça fica como estava — sem features, o recomendador só
   * a ignora.
   */
  async loadWardrobe(onProgress?: Progress): Promise<ClothingItem[]> {
    const listeners = RecommendationService.progressListeners;
    if (onProgress) listeners.add(onProgress);
    try {
      RecommendationService.pendingLoad ??= this.doLoadWardrobe().finally(() => {
        RecommendationService.pendingLoad = null;
      });
      return await RecommendationService.pendingLoad;
    } finally {
      if (onProgress) listeners.delete(onProgress);
    }
  }

  private notifyProgress(done: number, total: number): void {
    [...RecommendationService.progressListeners].forEach((listener) => listener(done, total));
  }

  private async doLoadWardrobe(): Promise<ClothingItem[]> {
    const items = await this.repository.fetchItems();
    const missing = items.filter((item) => needsAnalysis(item) && item.storagePath);
    if (missing.length === 0) return items;

    // Sem a API não há o que analisar: falha uma vez só, com o motivo, em vez
    // de esperar ela acordar peça por peça.
    await this.api.ensureReady();
    const analyzed = new Map<string, ClothingItem>();
    for (const [index, item] of missing.entries()) {
      this.notifyProgress(index, missing.length);
      try {
        const bytes = await this.repository.downloadImage(item);
        const features = await this.analysis.analisarPeca(bytes);
        const swatch = swatchFromFeatures(features);
        await this.repository.updateFeatures(item, features, swatch ?? undefined);
        analyzed.set(item.id, { ...item, swatch: swatch ?? item.swatch, features });
      } catch (e) {
        // A API caiu no meio: para aqui e fica com o que já foi analisado.
        if (e instanceof ApiException) break;
        // Segue sem essa peça; tenta de novo na próxima vez que a tela abrir.
      }
    }
    this.notifyProgress(missing.length, missing.length);
    return items.map((item) => analyzed.get(item.id) ?? item);
  }

  /**
   * Pede os [topK] melhores looks. [occasion] e [weather] são os rótulos da
   * interface (ex.: 'Trabalho', 'Frio'); nulos = sem filtro. Lança
   * `NoAnalyzedItemsException` se há peças mas nenhuma foi analisada.
   */
  async recommend(
    items: ClothingItem[],
    options: { occasion?: string | null; weather?: string | null; topK?: number } = {},
  ): Promise<Outfit[]> {
    const { occasion = null, weather = null, topK = 12 } = options;
    const analyzed = items.filter((item) => item.features !== null);
    if (analyzed.length === 0) {
      if (items.length > 0) throw new NoAnalyzedItemsException();
      return [];
    }

    const response = await this.api.send(async () =>
      fetchWithTimeout(this.fetchFn, `${API_BASE_URL}/looks/recommend`, 30_000, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await this.headers()) },
        body: JSON.stringify({
          pecas: analyzed.map((item) => ({
            id: item.id,
            categoria: item.category,
            features: item.features,
          })),
          ocasiao: (occasion && occasionKeys[occasion]) || null,
          clima: (weather && weatherKeys[weather]) || null,
          top_k: topK,
          feedback: await this.feedbackPayload(),
        }),
      }),
    );
    if (response.status !== 200) throw new Error(`Falha ao gerar looks (${response.status})`);

    const byId = new Map(analyzed.map((item) => [item.id, item]));
    const looks = ((await response.json()) as { looks: { pecas: string[]; score: number }[] }).looks;
    const tags = [...(occasion ? [occasion] : []), ...(weather && weather in weatherKeys ? [weather] : [])];
    return looks.map((look) =>
      makeOutfit({
        id: look.pecas.join('+'),
        items: look.pecas.map((id) => {
          const item = byId.get(id);
          if (!item) throw new Error(`O recomendador devolveu uma peça desconhecida: ${id}`);
          return item;
        }),
        tags,
        score: Number(look.score),
      }),
    );
  }

  /**
   * Favoritos, rejeições e usos no formato de `Feedback.de_dict`
   * (`model/feedback.py`). Sem histórico (Supabase fora, tabelas ainda não
   * criadas), recomenda sem feedback em vez de falhar.
   */
  private async feedbackPayload(): Promise<Record<string, unknown> | null> {
    try {
      await this.history.ensureLoaded();
    } catch {
      return null;
    }
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return {
      favoritos: this.history.favorites,
      rejeitados: this.history.rejections.map((r) => ({ pecas: r.itemIds, ocasiao: r.occasion })),
      usos: this.history.wornLooks.map(({ itemIds, day }) => ({
        pecas: itemIds,
        // Arredonda as horas: com horário de verão um dia tem 23 ou 25h.
        dias: Math.round((today.getTime() - day.getTime()) / 3_600_000 / 24),
      })),
    };
  }
}
