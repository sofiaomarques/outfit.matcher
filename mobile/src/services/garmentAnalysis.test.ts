import { ApiStatus } from './apiStatus';
import {
  GarmentAnalysisService,
  featuresOrSkip,
  multipartFile,
  swatchFromFeatures,
  type Features,
} from './garmentAnalysis';

const latin1 = (bytes: Uint8Array) => Array.from(bytes, (c) => String.fromCharCode(c)).join('');

test('swatchFromFeatures converte cor_principal em ARGB opaco', () => {
  expect(swatchFromFeatures({ cor_principal: [122, 24, 54] })).toBe(0xff7a1836);
  expect(swatchFromFeatures({ cor_principal: [255.9, 0, 0] })).toBe(0xffff0000);
  expect(swatchFromFeatures({ cor_principal: [1, 2] })).toBeNull();
  expect(swatchFromFeatures({})).toBeNull();
  expect(swatchFromFeatures(null)).toBeNull();
});

/** ApiStatus pronto: o /health responde 200, e os pedidos vão para [fetchFn]. */
function service(reply: () => Promise<Response> | Response) {
  const api = new ApiStatus({
    baseUrl: 'http://api.test',
    fetchFn: async (url) => {
      if (url.endsWith('/health')) return new Response('{}', { status: 200 });
      return reply();
    },
  });
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return reply();
  };
  return { svc: new GarmentAnalysisService(api, fetchFn, async () => ({ Authorization: 'Bearer t' })), calls };
}

const photo = new Uint8Array([0xff, 0xd8, 0xff]);

test('analisarPeca manda o arquivo com o token e devolve o JSON', async () => {
  const { svc, calls } = service(() => new Response(JSON.stringify({ cor_principal: [1, 2, 3] })));

  expect(await svc.analisarPeca(photo)).toEqual({ cor_principal: [1, 2, 3] });

  expect(calls[0].url).toMatch(/\/items\/analyze$/);
  expect(calls[0].init?.method).toBe('POST');
  expect(calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer t' });
  const contentType = (calls[0].init?.headers as Record<string, string>)['Content-Type'];
  expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
  const body = latin1(calls[0].init?.body as Uint8Array);
  expect(body).toContain('name="file"');
  expect(body).toContain('Content-Type: image/jpeg');
});

test('status diferente de 200 vira erro', async () => {
  const { svc } = service(() => new Response('', { status: 413 }));
  await expect(svc.analisarPeca(photo)).rejects.toThrow('413');
  await expect(svc.recortarPeca(photo)).rejects.toThrow('413');
});

test('recortarPeca devolve os bytes do PNG', async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const { svc, calls } = service(() => new Response(png));
  expect(await svc.recortarPeca(photo)).toEqual(png);
  expect(calls[0].url).toMatch(/\/items\/crop$/);
});

describe('featuresOrSkip', () => {
  /** Espera a condição virar verdadeira, sem depender de um tempo fixo. */
  async function waitUntil(condition: () => boolean, timeoutMs = 1000) {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > timeoutMs) throw new Error('a condição não ficou verdadeira');
      await new Promise((r) => setTimeout(r, 1));
    }
  }

  test('devolve as features quando a análise termina', async () => {
    const api = new ApiStatus({ baseUrl: 'http://api.test' });
    const features: Features = { a: 1 };
    expect(await featuresOrSkip(api, Promise.resolve(features))).toEqual({ features, skipped: false });
  });

  test('com a API acordando, não espera a análise', async () => {
    // O /health responde 503 (proxy ainda subindo): o estado vira "waking".
    const api = new ApiStatus({
      baseUrl: 'http://api.test',
      fetchFn: async () => new Response('', { status: 503 }),
      backoffMs: () => 5,
      wakeDeadlineMs: 300,
    });
    const wake = api.ensureReady().catch(() => {});
    await waitUntil(() => api.isWaking);

    const never = new Promise<Features | null>(() => {});
    expect(await featuresOrSkip(api, never)).toEqual({ features: null, skipped: true });
    await wake;
  });
});

describe('multipartFile', () => {
  test('envolve os bytes entre o cabeçalho e o fecho do boundary, sem alterá-los', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255, 13, 10]);
    const { body, contentType } = multipartFile(png);
    const boundary = contentType.split('boundary=')[1];
    const text = latin1(body);

    expect(text.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(text).toContain('Content-Type: image/png');
    expect(text.endsWith(`\r\n--${boundary}--\r\n`)).toBe(true);
    const start = text.indexOf('\r\n\r\n') + 4;
    expect([...body.slice(start, start + png.length)]).toEqual([...png]);
  });
});
