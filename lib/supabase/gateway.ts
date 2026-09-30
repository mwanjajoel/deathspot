type Env = Record<string, string | undefined>

/**
 * The Supabase clients call SUPABASE_URL/auth/v1 and SUPABASE_URL/rest/v1, which the Envoy
 * gateway in docker-compose.yml routes to Auth and PostgREST. Where those run as separate
 * services with no gateway in front (e.g. on InstaCloud), set SUPABASE_AUTH_URL and
 * SUPABASE_REST_URL and this fetch sends each request straight to the right service.
 * Returns undefined, so the clients keep the default fetch, when neither is set.
 */
export function gatewayFetch(env: Env = process.env): typeof fetch | undefined {
  const base = env.SUPABASE_URL?.replace(/\/+$/, "")
  const routes = (
    [
      ["/auth/v1", env.SUPABASE_AUTH_URL],
      ["/rest/v1", env.SUPABASE_REST_URL],
    ] as const
  ).flatMap(([prefix, to]) => (to ? [{ from: `${base}${prefix}`, to: to.replace(/\/+$/, "") }] : []))
  if (!base || !routes.length) return undefined

  return (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const route = routes.find((r) => url === r.from || url.startsWith(`${r.from}/`) || url.startsWith(`${r.from}?`))
    if (!route) return globalThis.fetch(input, init)
    const target = route.to + url.slice(route.from.length)
    return globalThis.fetch(input instanceof Request ? new Request(target, input) : target, init)
  }
}

/** Options for createClient / createServerClient that apply gatewayFetch when it's configured. */
export function gatewayOptions(env: Env = process.env) {
  const fetch = gatewayFetch(env)
  return fetch ? { global: { fetch } } : {}
}
