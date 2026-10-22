import { API_BASE_URL } from './apiConfig';

/** Em que pé está a API, do ponto de vista do app. */
export type ApiState =
  /** Ainda não falou com a API. */
  | 'unknown'
  /** Conferindo o `/health`; ainda não demorou o bastante pra avisar. */
  | 'checking'
  /** Não respondeu de primeira: subindo depois de ficar parada (cold start), até ~2 min. */
  | 'waking'
  | 'ready'
  /** Desistiu de esperar; o próximo pedido tenta de novo. */
  | 'down';

export type ApiProblem =
  /** Nem chegou resposta: sem internet (ou a API fora do endereço). */
  | 'offline'
  /** Respondeu, mas não acordou dentro do prazo. */
  | 'notWaking'
  /** Erro do servidor (5xx) ou pedido que estourou o tempo. */
  | 'server';

const MESSAGES: Record<ApiProblem, string> = {
  offline: 'Sem conexão com o servidor. Confira sua internet e tente de novo.',
  notWaking: 'O servidor não respondeu. Tente de novo em alguns minutos.',
  server: 'O servidor teve um problema. Tente de novo em instantes.',
};

/** Falha ao falar com a API, com a mensagem pra mostrar na tela. */
export class ApiException extends Error {
  constructor(
    readonly problem: ApiProblem,
    readonly statusCode?: number,
  ) {
    super(MESSAGES[problem]);
    this.name = 'ApiException';
  }

  get userMessage(): string {
    return MESSAGES[this.problem];
  }
}

/** O pedido passou do tempo limite (equivale ao TimeoutException do Dart). */
export class RequestTimeoutError extends Error {
  constructor(message = 'Tempo esgotado') {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** `fetch` que vira [RequestTimeoutError] se passar de [timeoutMs]. */
export async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (timedOut) throw new RequestTimeoutError();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface ApiStatusOptions {
  fetchFn?: FetchFn;
  baseUrl?: string;
  /** Quanto tempo esperar a API acordar antes de desistir. */
  wakeDeadlineMs?: number;
  /**
   * Depois desse tempo sem falar com a API, confere o `/health` de novo
   * antes do próximo pedido: ela pode ter voltado a dormir.
   */
  freshForMs?: number;
  /**
   * Um `/health` mais lento que isso já conta como "acordando" na tela;
   * antes, a conferência rápida de uma API acordada não pisca o aviso.
   */
  wakingAfterMs?: number;
  attemptTimeoutMs?: number;
  /**
   * Falhas de rede seguidas (sem resposta nenhuma) até concluir que está
   * sem internet. Acordando, a API responde (502–504) ou segura o pedido,
   * então isso não é cold start.
   */
  maxNetworkErrors?: number;
  backoffMs?: (attempt: number) => number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Acompanha se a API está acordada. Em produção ela desliga quando fica sem
 * uso, e o primeiro pedido depois disso espera o container subir e carregar
 * os modelos (~1–2 min) — mais que o timeout de qualquer chamada. Por isso
 * os serviços passam por [send], que antes espera o `/health` responder
 * (com retry e backoff, por até `wakeDeadlineMs`), e as telas mostram
 * "acordando" em vez de erro enquanto [isWaking].
 */
export class ApiStatus {
  static readonly wakingMessage = 'Acordando o servidor, pode levar até 2 minutos…';

  private readonly fetchFn: FetchFn;
  private readonly healthUrl: string;
  private readonly wakeDeadlineMs: number;
  private readonly freshForMs: number;
  private readonly wakingAfterMs: number;
  private readonly attemptTimeoutMs: number;
  private readonly maxNetworkErrors: number;
  private readonly backoffMs: (attempt: number) => number;

  private _state: ApiState = 'unknown';
  private lastContact: number | null = null;
  private pending: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(options: ApiStatusOptions = {}) {
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    this.healthUrl = `${options.baseUrl ?? API_BASE_URL}/health`;
    this.wakeDeadlineMs = options.wakeDeadlineMs ?? 3 * 60_000;
    this.freshForMs = options.freshForMs ?? 2 * 60_000;
    this.wakingAfterMs = options.wakingAfterMs ?? 3_000;
    this.attemptTimeoutMs = options.attemptTimeoutMs ?? 20_000;
    this.maxNetworkErrors = options.maxNetworkErrors ?? 3;
    this.backoffMs = options.backoffMs ?? ((attempt) => Math.min(2 ** attempt, 10) * 1000);
  }

  get state(): ApiState {
    return this._state;
  }

  get isWaking(): boolean {
    return this._state === 'waking';
  }

  /** Para `useSyncExternalStore`: devolve a função que cancela a assinatura. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ApiState => this._state;

  private setState(state: ApiState): void {
    if (this._state === state) return;
    this._state = state;
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Termina quando a API está pronta, ou rejeita com [ApiException]. Várias
   * telas chamando ao mesmo tempo compartilham a mesma espera.
   */
  ensureReady(): Promise<void> {
    if (
      this._state === 'ready' &&
      this.lastContact !== null &&
      Date.now() - this.lastContact < this.freshForMs
    ) {
      return Promise.resolve();
    }
    if (!this.pending) {
      this.pending = this.wake().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  private async wake(): Promise<void> {
    this.setState('checking');
    const wakingTimer = setTimeout(() => {
      if (this._state === 'checking') this.setState('waking');
    }, this.wakingAfterMs);
    const deadline = Date.now() + this.wakeDeadlineMs;
    let networkErrors = 0;
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await fetchWithTimeout(
            this.fetchFn,
            this.healthUrl,
            this.attemptTimeoutMs,
          );
          if (response.status === 200) {
            this.markContact();
            return;
          }
          // 502–504: o proxy na frente da API ainda espera ela subir.
          if (response.status < 502 || response.status > 504) {
            throw new ApiException('server', response.status);
          }
          networkErrors = 0;
          this.setState('waking');
        } catch (e) {
          if (e instanceof ApiException) throw e;
          if (e instanceof RequestTimeoutError) {
            networkErrors = 0;
            this.setState('waking');
          } else if (++networkErrors >= this.maxNetworkErrors) {
            throw new ApiException('offline');
          }
        }
        const wait = this.backoffMs(attempt);
        if (Date.now() + wait > deadline) {
          throw new ApiException('notWaking');
        }
        await sleep(wait);
      }
    } catch (e) {
      this.setState('down');
      throw e;
    } finally {
      clearTimeout(wakingTimer);
    }
  }

  private markContact(): void {
    this.lastContact = Date.now();
    this.setState('ready');
  }

  /**
   * Espera a API acordar ([ensureReady]) e faz o pedido. Falha de rede,
   * timeout e 5xx viram [ApiException] (e o próximo pedido confere o
   * `/health` de novo); outros status voltam pra quem chamou tratar.
   */
  async send(request: () => Promise<Response>): Promise<Response> {
    await this.ensureReady();
    let response: Response;
    try {
      response = await request();
    } catch (e) {
      this.lastContact = null;
      if (e instanceof ApiException) throw e;
      throw new ApiException(e instanceof RequestTimeoutError ? 'server' : 'offline');
    }
    if (response.status >= 500) {
      this.lastContact = null;
      throw new ApiException('server', response.status);
    }
    this.markContact();
    return response;
  }
}

export const apiStatus = new ApiStatus();
