import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeClient } from "../fake-supabase"

// Rare failure paths of route handlers that the integration tests can't trigger on demand.

let anon = fakeClient()
vi.mock("@/lib/supabase/server", () => ({ anonClient: () => anon }))
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_: string, handler: (req: Request, ctx: unknown) => unknown) => handler,
  rateLimitHeaders: () => ({ "Retry-After": "7" }),
}))
const search = { searchSpots: vi.fn(), geocode: vi.fn(), withNearby: vi.fn() }
vi.mock("@/lib/search", () => search)

const health = await import("@/app/api/health/route")
const searchRoute = await import("@/app/api/search/route")

beforeEach(() => {
  anon = fakeClient()
  search.searchSpots.mockReset().mockResolvedValue([{ id: 1 }])
  search.geocode.mockReset()
  search.withNearby.mockReset()
})

describe("GET /api/health", () => {
  it("returns 503 when the database is unreachable", async () => {
    anon = fakeClient({ from: { settings: { error: { message: "fetch failed" } } } })
    const res = await health.GET()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false, error: "fetch failed" })
  })
})

describe("GET /api/search", () => {
  const get = (q: string) => searchRoute.GET(new Request(`http://x/api/search?q=${q}`), undefined)

  it("still returns spots if attaching nearby spots to places fails", async () => {
    search.geocode.mockResolvedValue({ places: [{ name: "Ntinda" }], source: "cache" })
    search.withNearby.mockRejectedValue(new Error("db down"))
    expect(await (await get("ntinda")).json()).toEqual({ spots: [{ id: 1 }], places: [] })
  })

  it("returns the places with their nearby spots", async () => {
    search.geocode.mockResolvedValue({ places: [{ name: "Ntinda" }], source: "nominatim" })
    search.withNearby.mockResolvedValue([{ name: "Ntinda", nearby: [] }])
    expect(await (await get("ntinda")).json()).toEqual({ spots: [{ id: 1 }], places: [{ name: "Ntinda", nearby: [] }] })
  })

  it("returns 429 with Retry-After when the place lookup is throttled", async () => {
    search.geocode.mockResolvedValue({ limited: { policy: { message: "slow down" } } })
    const res = await get("ntinda")
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("7")
    expect(await res.json()).toEqual({ spots: [{ id: 1 }], places: [], error: "slow down" })
  })
})
