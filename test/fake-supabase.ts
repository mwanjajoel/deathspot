import { vi } from "vitest"

export type Result = { data?: unknown; error?: { message: string } | null; count?: number | null }

/**
 * A chainable stand-in for a supabase-js query builder: every builder method records its call and
 * returns the builder; awaiting it (or calling maybeSingle) resolves to `result`.
 */
export function query(result: Result) {
  const calls: [string, unknown[]][] = []
  const builder: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "calls") return calls
        if (prop === "then") {
          const settled = { data: null, error: null, ...result }
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(settled).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          calls.push([String(prop), args])
          return builder
        }
      },
    },
  )
  return builder as unknown as PromiseLike<Result> & Record<string, (...a: unknown[]) => unknown> & { calls: [string, unknown[]][] }
}

/** A fake client whose `from(table)` and `rpc(fn)` results are configured per name. */
export function fakeClient(opts: { from?: Record<string, Result | Result[]>; rpc?: Record<string, Result>; auth?: Record<string, unknown> } = {}) {
  const queues = new Map(Object.entries(opts.from ?? {}).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]))
  const builders: Record<string, ReturnType<typeof query>[]> = {}
  return {
    builders,
    from: vi.fn((table: string) => {
      const q = queues.get(table)
      const res = q && q.length > 1 ? q.shift()! : (q?.[0] ?? { data: [] })
      const b = query(res)
      ;(builders[table] ??= []).push(b)
      return b
    }),
    rpc: vi.fn(async (fn: string) => ({ data: null, error: null, ...(opts.rpc?.[fn] ?? {}) })),
    auth: opts.auth ?? {},
  }
}
