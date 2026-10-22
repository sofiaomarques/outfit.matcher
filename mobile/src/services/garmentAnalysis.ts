import { API_BASE_URL } from './apiConfig';
import { ApiStatus, apiStatus, fetchWithTimeout, type FetchFn } from './apiStatus';
import { authHeaders } from './supabase';
import { detectImageContentType } from '../repositories/supabaseHelpers';

export type Features = Record<string, unknown>;

/**
 * Cor principal extraída pela API (`cor_principal`, RGB), como ARGB opaco pra
 * usar de swatch da peça. Nula se a peça não foi analisada.
 */
export function swatchFromFeatures(features: Features | null | undefined): number | null {
  const rgb = features?.cor_principal;
  if (!Array.isArray(rgb) || rgb.length !== 3) return null;
  const [r, g, b] = rgb.map((v) => Math.trunc(Number(v)) & 0xff);
  return ((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

/**
 * Features da análise, ou nulas sem esperar se a API estiver acordando
 * (agora ou durante a espera): aí a análise pode levar minutos.
 */
export function featuresOrSkip(
  api: ApiStatus,
  analysis: Promise<Features | null>,
): Promise<{ features: Features | null; skipped: boolean }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: { features: Features | null; skipped: boolean }) => {
      if (done) return;
      done = true;
      unsubscribe();
      resolve(result);
    };
    const check = () => {
      if (api.isWaking) finish({ features: null, skipped: true });
    };
    const unsubscribe = api.subscribe(check);
    check();
    analysis.then((features) => finish({ features, skipped: false }));
  });
}

/**
 * Cliente da API Python que roda o pipeline de `features/*.py`
 * (`api/main.py`): recorta a peça da foto e extrai as features (cor,
 * categoria, estampa, formalidade e o embedding usado pelo recomendador).
 * Cada chamada espera a API acordar (`ApiStatus.send`); sem API, lança
 * `ApiException`.
 */
export class GarmentAnalysisService {
  constructor(
    private readonly api: ApiStatus = apiStatus,
    private readonly fetchFn: FetchFn = (url, init) => fetch(url, init),
    private readonly headers: () => Promise<Record<string, string>> = authHeaders,
  ) {}

  /**
   * Roda o pipeline completo sobre a foto (`/items/analyze`) e devolve o JSON
   * cru, que vai direto pra coluna `features` de `clothing_items`. Mais lento
   * que o recorte (CLIP + segmentação): pode levar vários segundos por peça.
   */
  async analisarPeca(imageBytes: Uint8Array): Promise<Features> {
    const response = await this.post('/items/analyze', imageBytes, 90_000);
    if (response.status !== 200) throw new Error(`Falha ao analisar a peça (${response.status})`);
    return (await response.json()) as Features;
  }

  /**
   * Recorta a peça da foto, removendo corpo/fundo, e devolve um PNG com fundo
   * transparente. Lança se o serviço não estiver acessível — quem chama decide
   * o fallback (normalmente: manter a foto original).
   */
  async recortarPeca(imageBytes: Uint8Array): Promise<Uint8Array> {
    const response = await this.post('/items/crop', imageBytes, 30_000);
    if (response.status !== 200) throw new Error(`Falha ao recortar a peça (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }

  private async post(path: string, imageBytes: Uint8Array, timeoutMs: number): Promise<Response> {
    const headers = await this.headers();
    const { body, contentType } = multipartFile(imageBytes);
    return this.api.send(() =>
      fetchWithTimeout(this.fetchFn, `${API_BASE_URL}${path}`, timeoutMs, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': contentType },
        body: body as unknown as BodyInit,
      }),
    );
  }
}

/**
 * Corpo `multipart/form-data` com o campo `file`, montado à mão: o React
 * Native não cria Blob a partir de bytes, mas manda um Uint8Array como corpo
 * (iOS, Android e web).
 */
export function multipartFile(bytes: Uint8Array): { body: Uint8Array; contentType: string } {
  const boundary = `----wable${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  const mime = detectImageContentType(bytes);
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="foto.${mime === 'image/png' ? 'png' : 'jpg'}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

export const garmentAnalysis = new GarmentAnalysisService();
