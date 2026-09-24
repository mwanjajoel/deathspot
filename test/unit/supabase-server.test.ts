import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const createClient = vi.fn((...args: unknown[]) => ({ kind: "js", args }))
const createServerClient = vi.fn((...args: unknown[]) => ({ kind: "ssr", args }))
const store = { getAll: vi.fn(() => [{ name: "a", value: "1" }]), set: vi.fn() }

vi.mock("@supabase/supabase-js", () => ({ createClient }))
vi.mock("@supabase/ssr", () => ({ createServerClient }))
vi.mock("next/headers", () => ({ cookies: async () => store }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  const g = globalThis as Record<string, unknown>
  delete g.deathspotService
  delete g.deathspotAnon
  vi.stubEnv("SUPABASE_URL", "http://supabase.test")
  vi.stubEnv("SUPABASE_ANON_KEY", "anon")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service")
})
afterEach(() => vi.unstubAllEnvs())

describe("supabase clients", () => {
  it("creates the service and anon clients once, without sessions", async () => {
    const s = await import("@/lib/supabase/server")
    expect(s.serviceClient()).toBe(s.serviceClient())
    expect(s.anonClient()).toBe(s.anonClient())
    expect(createClient).toHaveBeenCalledTimes(2)
    expect(createClient.mock.calls[0].slice(0, 2)).toEqual(["http://supabase.test", "service"])
    expect(createClient.mock.calls[1].slice(0, 2)).toEqual(["http://supabase.test", "anon"])
    expect(createClient.mock.calls[0][2]).toMatchObject({ auth: { persistSession: false } })
  })

  it("explains a missing environment variable", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    const s = await import("@/lib/supabase/server")
    expect(() => s.serviceClient()).toThrow("Missing environment variable SUPABASE_SERVICE_ROLE_KEY")
  })

  it("binds the user client to the request cookies", async () => {
    const s = await import("@/lib/supabase/server")
    await s.userClient()
    const [url, key, opts] = createServerClient.mock.calls[0] as [string, string, { cookies: { getAll: () => unknown; setAll: (c: unknown[]) => void } }]
    expect([url, key]).toEqual(["http://supabase.test", "anon"])
    expect(opts.cookies.getAll()).toEqual([{ name: "a", value: "1" }])
    opts.cookies.setAll([{ name: "sb", value: "v", options: { path: "/" } }])
    expect(store.set).toHaveBeenCalledWith("sb", "v", { path: "/" })
  })

  it("ignores cookie writes where cookies are read-only (Server Components)", async () => {
    store.set.mockImplementationOnce(() => {
      throw new Error("read-only")
    })
    const s = await import("@/lib/supabase/server")
    await s.userClient()
    const opts = createServerClient.mock.calls[0][2] as { cookies: { setAll: (c: unknown[]) => void } }
    expect(() => opts.cookies.setAll([{ name: "sb", value: "v", options: {} }])).not.toThrow()
  })
})
