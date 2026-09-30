import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { gatewayFetch, gatewayOptions } from "@/lib/supabase/gateway"

const env = {
  SUPABASE_URL: "http://supabase.invalid/",
  SUPABASE_AUTH_URL: "https://auth.example/",
  SUPABASE_REST_URL: "https://rest.example",
}

const fetchMock = vi.fn<typeof fetch>(async () => new Response("ok"))
beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const calledUrl = () => {
  const [input] = fetchMock.mock.calls[0]
  return input instanceof Request ? input.url : String(input)
}

describe("gatewayFetch", () => {
  it("is off without service URLs, so the clients keep the default fetch", () => {
    expect(gatewayFetch({ SUPABASE_URL: "http://api-gw:8000" })).toBeUndefined()
    expect(gatewayFetch({ SUPABASE_AUTH_URL: "https://auth.example" })).toBeUndefined()
    expect(gatewayOptions({ SUPABASE_URL: "http://api-gw:8000" })).toEqual({})
  })

  it("sends /auth/v1 and /rest/v1 requests to their own services", async () => {
    const f = gatewayFetch(env)!
    await f("http://supabase.invalid/auth/v1/token?grant_type=password", { method: "POST" })
    expect(calledUrl()).toBe("https://auth.example/token?grant_type=password")
    expect(fetchMock.mock.calls[0][1]).toEqual({ method: "POST" })

    fetchMock.mockClear()
    await f(new URL("http://supabase.invalid/rest/v1/rpc/spot_stats"))
    expect(calledUrl()).toBe("https://rest.example/rpc/spot_stats")

    fetchMock.mockClear()
    await f("http://supabase.invalid/rest/v1?select=*")
    expect(calledUrl()).toBe("https://rest.example?select=*")
  })

  it("rewrites Request objects, keeping method and headers", async () => {
    const f = gatewayFetch(env)!
    await f(new Request("http://supabase.invalid/auth/v1/admin/users", { method: "DELETE", headers: { apikey: "k" } }))
    const req = fetchMock.mock.calls[0][0] as Request
    expect(req.url).toBe("https://auth.example/admin/users")
    expect(req.method).toBe("DELETE")
    expect(req.headers.get("apikey")).toBe("k")
  })

  it("leaves other URLs, and look-alike paths, untouched", async () => {
    const f = gatewayFetch({ SUPABASE_URL: env.SUPABASE_URL, SUPABASE_REST_URL: env.SUPABASE_REST_URL })!
    for (const url of ["http://supabase.invalid/auth/v1/user", "http://supabase.invalid/rest/v10/x", "https://elsewhere.example/rest/v1"]) {
      fetchMock.mockClear()
      await f(url)
      expect(calledUrl()).toBe(url)
    }
  })

  it("plugs into the Supabase client options", () => {
    expect(gatewayOptions(env)).toEqual({ global: { fetch: expect.any(Function) } })
  })
})
