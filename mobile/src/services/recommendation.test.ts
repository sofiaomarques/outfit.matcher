import type { ClothingItem } from '../models/clothingItem';
import { ApiException, ApiStatus } from './apiStatus';
import {
  NoAnalyzedItemsException,
  RecommendationService,
  describeRecommendError,
} from './recommendation';

const item = (id: string, features: Record<string, unknown> | null, storagePath = `u/${id}.jpg`): ClothingItem => ({
  id,
  name: id,
  category: id.startsWith('a') ? 'bottom' : 'top',
  swatch: 0xff000000,
  storagePath,
  isFavorite: false,
  features,
});

const OK_FEATURES = { cor_principal: [10, 20, 30], versao_features: 2 };

function setup(
  wardrobe: ClothingItem[],
  options: {
    recommend?: () => Response | Promise<Response>;
    history?: Partial<ConstructorParameters<typeof RecommendationService>[2]>;
  } = {},
) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const api = new ApiStatus({
    baseUrl: 'http://api.test',
    fetchFn: async () => new Response('{}', { status: 200 }),
    backoffMs: () => 1,
  });
  const repository = {
    fetchItems: jest.fn(async () => wardrobe),
    downloadImage: jest.fn(async () => new Uint8Array([1, 2, 3])),
    updateFeatures: jest.fn(async () => {}),
  };
  const analysis = { analisarPeca: jest.fn(async (): Promise<Record<string, unknown>> => ({ cor_principal: [1, 2, 3], versao_features: 2 })) };
  const history = {
    ensureLoaded: async () => {},
    favorites: [['a1', 'b1']],
    rejections: [{ itemIds: ['a1', 'b2'], occasion: 'trabalho' as string | null }],
    wornLooks: [{ itemIds: ['a1', 'b3'], day: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 3) }],
    ...options.history,
  };
  const fetchFn = async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    return (
      options.recommend?.() ??
      new Response(JSON.stringify({ looks: [{ pecas: ['b1', 'a1'], score: 0.9 }] }))
    );
  };
  const service = new RecommendationService(repository, analysis, history, api, fetchFn, async () => ({
    Authorization: 'Bearer t',
  }));
  return { service, repository, analysis, requests, api };
}

describe('loadWardrobe', () => {
  test('sem peças pendentes, só devolve o guarda-roupa (sem acordar a API)', async () => {
    const { service, analysis, api } = setup([item('a1', OK_FEATURES)]);
    const ensure = jest.spyOn(api, 'ensureReady');
    expect(await service.loadWardrobe()).toHaveLength(1);
    expect(analysis.analisarPeca).not.toHaveBeenCalled();
    expect(ensure).not.toHaveBeenCalled();
  });

  test('analisa peça sem features ou com versão antiga e salva no Supabase', async () => {
    const wardrobe = [
      item('a1', null),
      item('a2', { versao_features: 1 }),
      item('a3', OK_FEATURES),
      item('a4', null, undefined as unknown as string), // sem foto: não dá pra analisar
    ];
    wardrobe[3].storagePath = undefined;
    const { service, repository, analysis } = setup(wardrobe);

    const result = await service.loadWardrobe();

    expect(analysis.analisarPeca).toHaveBeenCalledTimes(2);
    expect(repository.updateFeatures).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
      { cor_principal: [1, 2, 3], versao_features: 2 },
      0xff010203,
    );
    expect(result[0].features).toEqual({ cor_principal: [1, 2, 3], versao_features: 2 });
    expect(result[0].swatch).toBe(0xff010203);
    expect(result[2]).toBe(wardrobe[2]);
    expect(result[3].features).toBeNull();
  });

  test('avisa o progresso peça a peça', async () => {
    const { service } = setup([item('a1', null), item('a2', null)]);
    const progress: [number, number][] = [];
    await service.loadWardrobe((done, total) => progress.push([done, total]));
    expect(progress).toEqual([[0, 2], [1, 2], [2, 2]]);
  });

  test('falha numa peça não impede as outras', async () => {
    const { service, analysis } = setup([item('a1', null), item('a2', null)]);
    analysis.analisarPeca.mockRejectedValueOnce(new Error('imagem ruim'));
    const result = await service.loadWardrobe();
    expect(result[0].features).toBeNull();
    expect(result[1].features).not.toBeNull();
  });

  test('API cai no meio: para e fica com o que já foi analisado', async () => {
    const { service, analysis } = setup([item('a1', null), item('a2', null), item('a3', null)]);
    analysis.analisarPeca
      .mockResolvedValueOnce({ versao_features: 2 })
      .mockRejectedValueOnce(new ApiException('offline'));
    const result = await service.loadWardrobe();
    expect(analysis.analisarPeca).toHaveBeenCalledTimes(2);
    expect(result.map((i) => i.features !== null)).toEqual([true, false, false]);
  });

  test('sem API, falha uma vez só com o motivo', async () => {
    const { service, analysis, api } = setup([item('a1', null)]);
    jest.spyOn(api, 'ensureReady').mockRejectedValue(new ApiException('notWaking'));
    await expect(service.loadWardrobe()).rejects.toMatchObject({ problem: 'notWaking' });
    expect(analysis.analisarPeca).not.toHaveBeenCalled();
  });

  test('duas telas carregando juntas compartilham a mesma análise', async () => {
    const { service, repository } = setup([item('a1', null)]);
    const [x, y] = await Promise.all([service.loadWardrobe(), service.loadWardrobe()]);
    expect(repository.fetchItems).toHaveBeenCalledTimes(1);
    expect(x).toBe(y);
    await service.loadWardrobe(); // depois de terminar, uma nova carga busca de novo
    expect(repository.fetchItems).toHaveBeenCalledTimes(2);
  });
});

describe('recommend', () => {
  const wardrobe = [item('a1', OK_FEATURES), item('b1', OK_FEATURES), item('b9', null)];

  test('guarda-roupa vazio devolve lista vazia; com peças mas nenhuma analisada, lança', async () => {
    const { service } = setup([]);
    expect(await service.recommend([])).toEqual([]);
    await expect(service.recommend([item('a1', null)])).rejects.toBeInstanceOf(NoAnalyzedItemsException);
  });

  test('manda só as peças analisadas, com ocasião, clima e feedback', async () => {
    const { service, requests } = setup(wardrobe);

    await service.recommend(wardrobe, { occasion: 'Dia a dia', weather: 'Chuva', topK: 5 });

    expect(requests[0].url).toBe('http://localhost:8000/looks/recommend');
    expect(requests[0].init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer t' });
    expect(JSON.parse(requests[0].init?.body as string)).toEqual({
      pecas: [
        { id: 'a1', categoria: 'bottom', features: OK_FEATURES },
        { id: 'b1', categoria: 'top', features: OK_FEATURES },
      ],
      ocasiao: 'dia_a_dia',
      clima: 'chuva',
      top_k: 5,
      feedback: {
        favoritos: [['a1', 'b1']],
        rejeitados: [{ pecas: ['a1', 'b2'], ocasiao: 'trabalho' }],
        usos: [{ pecas: ['a1', 'b3'], dias: 3 }],
      },
    });
  });

  test('sem filtros manda ocasião e clima nulos; "Qualquer clima" é o mesmo que nada', async () => {
    const { service, requests } = setup(wardrobe);
    await service.recommend(wardrobe, { weather: 'Qualquer clima' });
    const body = JSON.parse(requests[0].init?.body as string);
    expect(body).toMatchObject({ ocasiao: null, clima: null, top_k: 12 });
  });

  test('monta os looks com as peças, as tags e o score', async () => {
    const { service } = setup(wardrobe);
    const [look] = await service.recommend(wardrobe, { occasion: 'Trabalho', weather: 'Frio' });
    expect(look.id).toBe('b1+a1');
    expect(look.items.map((i) => i.id)).toEqual(['b1', 'a1']);
    expect(look.tags).toEqual(['Trabalho', 'Frio']);
    expect(look.score).toBe(0.9);
  });

  test('"Qualquer clima" não vira tag', async () => {
    const { service } = setup(wardrobe);
    const [look] = await service.recommend(wardrobe, { weather: 'Qualquer clima' });
    expect(look.tags).toEqual([]);
  });

  test('histórico indisponível: recomenda sem feedback', async () => {
    const { service, requests } = setup(wardrobe, {
      history: {
        ensureLoaded: async () => {
          throw new Error('tabela não existe');
        },
      },
    });
    await service.recommend(wardrobe);
    expect(JSON.parse(requests[0].init?.body as string).feedback).toBeNull();
  });

  test('resposta que não é 200 vira erro; 5xx vira ApiException', async () => {
    const bad = setup(wardrobe, { recommend: () => new Response('', { status: 422 }) });
    await expect(bad.service.recommend(wardrobe)).rejects.toThrow('422');
    const down = setup(wardrobe, { recommend: () => new Response('', { status: 503 }) });
    await expect(down.service.recommend(wardrobe)).rejects.toMatchObject({ statusCode: 503 });
  });

  test('peça desconhecida na resposta falha com mensagem clara', async () => {
    const { service } = setup(wardrobe, {
      recommend: () => new Response(JSON.stringify({ looks: [{ pecas: ['zzz'], score: 1 }] })),
    });
    await expect(service.recommend(wardrobe)).rejects.toThrow('zzz');
  });
});

test('describeRecommendError escolhe a mensagem certa', () => {
  expect(describeRecommendError(new ApiException('offline'), 'x')).toMatch(/Sem conexão/);
  expect(describeRecommendError(new NoAnalyzedItemsException(), 'x')).toMatch(/analisar suas peças/);
  expect(describeRecommendError(new Error('?'), 'Falhou')).toBe('Falhou');
});
