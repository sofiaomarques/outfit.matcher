import type { SupabaseClient } from '@supabase/supabase-js';

export interface Call {
  table: string;
  steps: unknown[][];
}

type Result = { data?: unknown; error?: unknown; count?: number | null };

/**
 * Cliente Supabase de mentira: cada `from(tabela)` vira um construtor
 * encadeável que só anota as chamadas e responde com o resultado programado
 * em [tables] (um valor fixo ou uma função das chamadas).
 */
export interface FakeOptions {
  userId?: string | null;
  email?: string;
  tables?: Record<string, Result | ((call: Call) => Result)>;
  storage?: Record<string, Record<string, jest.Mock>>;
}

export function fakeSupabase(options: FakeOptions = {}) {
  const calls: Call[] = [];
  const userId = options.userId === undefined ? 'user-1' : options.userId;

  const client = {
    auth: {
      getSession: jest.fn(async () => ({
        data: {
          session: userId ? { user: { id: userId, email: options.email ?? 'a@b.c' } } : null,
        },
      })),
      signOut: jest.fn(async () => ({ error: null })),
    },
    from(table: string) {
      const call: Call = { table, steps: [] };
      calls.push(call);
      const builder: any = new Proxy(
        {},
        {
          get(_, method: string) {
            if (method === 'then') {
              const programmed = options.tables?.[table];
              const result =
                typeof programmed === 'function' ? programmed(call) : (programmed ?? {});
              const full = { data: null, error: null, ...result };
              return (resolve: (v: unknown) => void) => resolve(full);
            }
            return (...args: unknown[]) => {
              call.steps.push([method, ...args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
    storage: {
      from(bucket: string) {
        const methods = options.storage?.[bucket] ?? {};
        return new Proxy(methods, {
          get: (target, name: string) =>
            target[name] ??
            // Sem resposta programada: listas/remoções vazias, o resto sem dados.
            jest.fn(async () => ({ data: name === 'list' || name === 'remove' ? [] : null, error: null })),
        });
      },
    },
  };

  return { client: client as unknown as SupabaseClient, calls, raw: client };
}

export const ok = (data: unknown) => jest.fn(async (..._args: any[]) => ({ data, error: null }));
