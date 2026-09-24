import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeClient } from "../fake-supabase"

let anon = fakeClient()
let service = fakeClient()
const checkRateLimit = vi.fn()
vi.mock("@/lib/supabase/server", () => ({ anonClient: () => anon, serviceClient: () => service }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }))

const search = await import("@/lib/search")
const fetchMock = vi.fn()

beforeEach(() => {
  anon = fakeClient()
  service = fakeClient()
  checkRateLimit.mockReset().mockResolvedValue({ allowed: true })
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const nominatim = (rows: unknown[], status = 200) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rows), { status }))

describe("normalise", () => {
  it("lowercases, trims and collapses whitespace", () => expect(search.normalise("  Old   Taxi Park ")).toBe("old taxi park"))
})

describe("searchSpots / spotsNear", () => {
  it("call the Postgres functions", async () => {
    anon = fakeClient({ rpc: { search_spots: { data: [{ id: 1 }] }, spots_near: { data: [{ id: 2 }] } } })
    expect(await search.searchSpots("kal")).toEqual([{ id: 1 }])
    expect(anon.rpc).toHaveBeenCalledWith("search_spots", { q: "kal", lim: 8 })
    expect(await search.spotsNear(0.3, 32.5)).toEqual([{ id: 2 }])
    expect(anon.rpc).toHaveBeenCalledWith("spots_near", { p_lat: 0.3, p_lng: 32.5, p_radius_m: 2000, lim: 5 })
  })
  it("throw with context on errors", async () => {
    anon = fakeClient({ rpc: { search_spots: { error: { message: "x" } }, spots_near: { error: { message: "y" } } } })
    await expect(search.searchSpots("kal")).rejects.toThrow("searchSpots: x")
    await expect(search.spotsNear(0, 0)).rejects.toThrow("spotsNear: y")
  })
})

describe("geocode", () => {
  const headers = new Headers()

  it("serves fresh cache hits without calling Nominatim or counting the rate limit", async () => {
    service = fakeClient({ from: { geocode_cache: { data: { places: [{ name: "Mulago" }], fetched_at: new Date().toISOString() } } } })
    expect(await search.geocode(" Mulago ", headers)).toEqual({ places: [{ name: "Mulago" }], source: "cache" })
    expect(service.builders.geocode_cache[0].calls).toContainEqual(["eq", ["query", "mulago"]])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(checkRateLimit).not.toHaveBeenCalled()
  })

  it("refreshes stale entries from Nominatim and caches them", async () => {
    service = fakeClient({
      from: { geocode_cache: [{ data: { places: [], fetched_at: "2020-01-01T00:00:00Z" } }, { data: null }] },
    })
    nominatim([
      { name: "Mulago", display_name: "Mulago, Kawempe, Kampala, Central Region, Uganda", lat: "0.34", lon: "32.57" },
      { name: "", display_name: "Mulago Hill, Kampala", lat: "0.33", lon: "32.58" },
    ])
    const r = await search.geocode("Mulago", headers)
    expect(r).toEqual({
      source: "nominatim",
      places: [
        { name: "Mulago", detail: "Kawempe, Kampala, Central Region", lat: 0.34, lng: 32.57 },
        { name: "Mulago Hill", detail: "Kampala", lat: 0.33, lng: 32.58 },
      ],
    })
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get("countrycodes")).toBe("ug")
    expect(url.searchParams.get("viewbox")).toBe("32.35,0.55,32.85,0.05")
    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toMatch(/^DeathspotUG/)
    expect(service.builders.geocode_cache[1].calls[0][0]).toBe("upsert")
    expect(checkRateLimit).toHaveBeenCalledWith(headers, "geocode")
  })

  it("returns the limit instead of calling Nominatim when the caller is throttled", async () => {
    service = fakeClient({ from: { geocode_cache: { data: null } } })
    checkRateLimit.mockResolvedValue({ allowed: false, policy: { message: "slow" } })
    expect(await search.geocode("Ntinda", headers)).toEqual({ limited: { allowed: false, policy: { message: "slow" } } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws when Nominatim refuses", async () => {
    service = fakeClient({ from: { geocode_cache: { data: null } } })
    nominatim([], 403)
    await expect(search.geocode("Ntinda", headers)).rejects.toThrow("Nominatim responded 403")
  })
})

describe("dedupePlaces", () => {
  const p = (name: string, lat: number, nearby = 0) => ({
    name,
    detail: "",
    lat,
    lng: 32.5,
    nearby: Array.from({ length: nearby }, (_, i) => ({ id: i }) as never),
  })

  it("merges same-named places within 3 km, keeping the one with more spots nearby", () => {
    const r = search.dedupePlaces([p("Mulago", 0.34, 0), p("mulago", 0.345, 2), p("Mulago", 0.35, 1)])
    expect(r).toHaveLength(1)
    expect(r[0].nearby).toHaveLength(2)
  })

  it("keeps same-named places that are far apart, and different names", () => {
    expect(search.dedupePlaces([p("Mulago", 0.34), p("Mulago", 1.0), p("Ntinda", 0.34)])).toHaveLength(3)
  })
})

describe("withNearby", () => {
  it("attaches nearby spots and puts places with spots first", async () => {
    anon.rpc = vi.fn(async (_fn: string, args: { p_lat: number }) => ({
      data: args.p_lat > 1 ? [] : [{ id: 1, distance_m: 500 }],
      error: null,
    })) as never
    const r = await search.withNearby([
      { name: "Far", detail: "", lat: 2, lng: 32 },
      { name: "Near", detail: "", lat: 0.3, lng: 32.5 },
    ])
    expect(r.map((x) => x.name)).toEqual(["Near", "Far"])
    expect(r[0].nearby).toEqual([{ id: 1, distance_m: 500 }])
  })
})
