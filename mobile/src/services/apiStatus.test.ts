import { ApiException, ApiStatus, RequestTimeoutError, type ApiState } from './apiStatus';

type Reply = number | Error;

/** `/health` que responde a sequência dada (status ou erro), repetindo a última. */
function harness(
  replies: Reply[],
  options: {
    delayMs?: number;
    wakeDeadlineMs?: number;
    freshForMs?: number;
    wakingAfterMs?: number;
  } = {},
) {
  const h = { calls: 0, states: [] as ApiState[], api: undefined as unknown as ApiStatus };
  h.api = new ApiStatus({
    baseUrl: 'http://api.test',
    wakeDeadlineMs: options.wakeDeadlineMs ?? 5000,
    freshForMs: options.freshForMs,
    wakingAfterMs: options.wakingAfterMs,
    backoffMs: () => 5,
    fetchFn: async (url) => {
      expect(url).toBe('http://api.test/health');
      const reply = replies[Math.min(h.calls, replies.length - 1)];
      h.calls++;
      if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
      if (reply instanceof Error) throw reply;
      return new Response('{}', { status: reply });
    },
  });
  h.api.subscribe(() => h.states.push(h.api.state));
  return h;
}

const offline = new TypeError('Network request failed');

async function problemOf(promise: Promise<unknown>): Promise<ApiException> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiException);
    return e as ApiException;
  }
  throw new Error('esperava ApiException');
}

describe('ensureReady', () => {
  test('API acordada: pronta de primeira, sem avisar "acordando"', async () => {
    const h = harness([200]);
    await h.api.ensureReady();
    expect(h.api.state).toBe('ready');
    expect(h.states).toEqual(['checking', 'ready']);
    expect(h.calls).toBe(1);
  });

  test('502–504 enquanto sobe: avisa "acordando" e espera', async () => {
    const h = harness([503, 502, 504, 200]);
    await h.api.ensureReady();
    expect(h.states).toEqual(['checking', 'waking', 'ready']);
    expect(h.calls).toBe(4);
  });

  test('timeout do /health conta como acordando, não como erro', async () => {
    const h = harness([new RequestTimeoutError('lento'), 200]);
    await h.api.ensureReady();
    expect(h.states).toContain('waking');
    expect(h.api.state).toBe('ready');
  });

  test('/health lento além de wakingAfter avisa "acordando"', async () => {
    const h = harness([200], { delayMs: 50, wakingAfterMs: 10 });
    await h.api.ensureReady();
    expect(h.states).toEqual(['checking', 'waking', 'ready']);
  });

  test('sem resposta nenhuma várias vezes: sem internet', async () => {
    const h = harness([offline]);
    const error = await problemOf(h.api.ensureReady());
    expect(error.problem).toBe('offline');
    expect(h.calls).toBe(3);
    expect(h.api.state).toBe('down');
    expect(h.states).not.toContain('waking');
  });

  test('falha de rede isolada não é "sem internet"', async () => {
    const h = harness([offline, 503, offline, 200]);
    await h.api.ensureReady();
    expect(h.api.state).toBe('ready');
  });

  test('não acorda dentro do prazo: desiste', async () => {
    const h = harness([503], { wakeDeadlineMs: 40 });
    const error = await problemOf(h.api.ensureReady());
    expect(error.problem).toBe('notWaking');
    expect(h.api.state).toBe('down');
  });

  test('500 no /health é erro do servidor, sem ficar esperando', async () => {
    const h = harness([500]);
    const error = await problemOf(h.api.ensureReady());
    expect(error.problem).toBe('server');
    expect(error.statusCode).toBe(500);
    expect(h.calls).toBe(1);
  });

  test('depois de desistir, o próximo pedido tenta de novo', async () => {
    const h = harness([500, 200]);
    await problemOf(h.api.ensureReady());
    await h.api.ensureReady();
    expect(h.api.state).toBe('ready');
  });

  test('telas chamando juntas compartilham a mesma espera', async () => {
    const h = harness([503, 200]);
    await Promise.all([h.api.ensureReady(), h.api.ensureReady()]);
    expect(h.calls).toBe(2);
  });

  test('pronta há pouco: não confere o /health de novo', async () => {
    const h = harness([200]);
    await h.api.ensureReady();
    await h.api.ensureReady();
    expect(h.calls).toBe(1);
  });

  test('pronta há muito tempo: confere de novo (pode ter dormido)', async () => {
    const h = harness([200], { freshForMs: 0 });
    await h.api.ensureReady();
    await h.api.ensureReady();
    expect(h.calls).toBe(2);
  });
});

describe('send', () => {
  test('espera acordar e devolve a resposta', async () => {
    const h = harness([503, 200]);
    const response = await h.api.send(async () => new Response('ok', { status: 200 }));
    expect(await response.text()).toBe('ok');
    expect(h.api.state).toBe('ready');
  });

  test('4xx volta pra quem chamou tratar', async () => {
    const h = harness([200]);
    const response = await h.api.send(async () => new Response('', { status: 413 }));
    expect(response.status).toBe(413);
  });

  test('5xx vira erro do servidor e o próximo pedido reconfere', async () => {
    const h = harness([200]);
    const error = await problemOf(h.api.send(async () => new Response('', { status: 503 })));
    expect(error.statusCode).toBe(503);
    await h.api.send(async () => new Response('', { status: 200 }));
    expect(h.calls).toBe(2);
  });

  test('falha de rede vira "sem internet"', async () => {
    const h = harness([200]);
    const error = await problemOf(
      h.api.send(async () => {
        throw offline;
      }),
    );
    expect(error.problem).toBe('offline');
  });

  test('pedido que estoura o tempo vira erro do servidor', async () => {
    const h = harness([200]);
    const error = await problemOf(
      h.api.send(async () => {
        throw new RequestTimeoutError('90 s');
      }),
    );
    expect(error.problem).toBe('server');
  });

  test('sem API, não chega a fazer o pedido', async () => {
    const h = harness([offline]);
    let sent = false;
    await problemOf(
      h.api.send(async () => {
        sent = true;
        return new Response('', { status: 200 });
      }),
    );
    expect(sent).toBe(false);
  });
});
