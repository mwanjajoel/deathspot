import { describe, expect, it } from "vitest"
import * as routeRoute from "@/app/api/route/route"
import * as searchRoute from "@/app/api/search/route"
import { anonClient, serviceClient } from "@/lib/supabase/server"
import { external, sql, visitor } from "./helpers"

const KALERWE = "0.34918,32.57195"
const NANSANA = "0.36582,32.52923"

describe("GET /api/route", () => {
  it("lists the spots along each route, safest first", async () => {
    const res = await routeRoute.GET(visitor().get(`/api/route?from=${KALERWE}&to=${NANSANA}`), undefined)
    expect(res.status).toBe(200)
    expect(res.headers.get("RateLimit-Limit")).toBe("20")
    const { routes, bufferMeters } = await res.json()
    expect(bufferMeters).toBe(150)
    expect(routes).toHaveLength(2)
    expect(routes[0].risk).toBeLessThanOrEqual(routes[1].risk)
    const titles = routes.flatMap((r: { dangers: { spot: { title: string } }[] }) => r.dangers.map((d) => d.spot.title))
    expect(titles).toEqual(expect.arrayContaining(["Kalerwe", "Nansana intersection"]))
    const osrmUrl = external.osrm.mock.calls[0][0]
    expect(osrmUrl).toContain("32.57195,0.34918;32.52923,0.36582")
  })

  it("breaks risk ties by duration", async () => {
    const far = (duration: number) => ({ distance: 1, duration, geometry: { coordinates: [[30, 3], [30.01, 3]] } })
    external.osrm.mockImplementation(async () => external.json({ code: "Ok", routes: [far(900), far(300)] }))
    const { routes } = await (await routeRoute.GET(visitor().get(`/api/route?from=${KALERWE}&to=${NANSANA}`), undefined)).json()
    expect(routes.map((r: { duration: number }) => r.duration)).toEqual([300, 900])
  })

  it.each([["from=abc&to=1,2"], [`from=${KALERWE}`], [`from=-1.29,36.82&to=${NANSANA}`]])("rejects %s", async (q) => {
    const res = await routeRoute.GET(visitor().get(`/api/route?${q}`), undefined)
    expect(res.status).toBe(400)
  })

  it("reports when no route exists", async () => {
    external.osrm.mockImplementation(async () => external.json({ code: "NoRoute", routes: [] }))
    const res = await routeRoute.GET(visitor().get(`/api/route?from=${KALERWE}&to=${NANSANA}`), undefined)
    expect(res.status).toBe(404)
  })

  it("reports an unavailable routing service", async () => {
    external.osrm.mockImplementation(async () => new Response("down", { status: 503 }))
    const res = await routeRoute.GET(visitor().get(`/api/route?from=${KALERWE}&to=${NANSANA}`), undefined)
    expect(res.status).toBe(502)
  })
})

describe("GET /api/search", () => {
  const search = async (q: string, extra = "", v = visitor()) => {
    const res = await searchRoute.GET(v.get(`/api/search?q=${encodeURIComponent(q)}${extra}`), undefined)
    return { status: res.status, body: await res.json(), res }
  }

  it("returns nothing for one character or no query", async () => {
    expect((await search("k")).body).toEqual({ spots: [], places: [] })
    const res = await searchRoute.GET(visitor().get("/api/search"), undefined)
    expect(await res.json()).toEqual({ spots: [], places: [] })
  })

  it("finds mapped spots from the database, tolerating typos, without calling Nominatim", async () => {
    for (const [q, title] of [
      ["Kalerwe", "Kalerwe"],
      ["kalerw", "Kalerwe"],
      ["nansna", "Nansana intersection"],
      ["old taxi", "Old Taxi Park"],
      ["mukwano", "Mukwano Road (near CID HQ)"],
    ]) {
      const { body } = await search(q, "&places=0")
      expect(body.spots[0].title, q).toBe(title)
      expect(body.places).toEqual([])
    }
    expect(external.nominatim).not.toHaveBeenCalled()
  })

  it("does not return weak fuzzy matches", async () => {
    const { body } = await search("wandegeya", "&places=0")
    expect(body.spots).toEqual([])
  })

  it("shows mapped spots near a searched place, and caches the place lookup", async () => {
    external.nominatim.mockImplementation(async () =>
      external.json([
        { name: "Mulago", display_name: "Mulago, Kawempe, Kampala, Central Region, Uganda", lat: "0.3408", lon: "32.5794" },
        { name: "Mulago", display_name: "Mulago, Butaleja, Eastern Region, Uganda", lat: "0.9979", lon: "34.0476" },
      ]),
    )
    const q = `test mulago ${Date.now()}`
    const first = await search(q)
    expect(first.body.places[0]).toMatchObject({ name: "Mulago", detail: "Kawempe, Kampala, Central Region" })
    expect(first.body.places[0].nearby[0]).toMatchObject({ title: "Kalerwe" })
    expect(first.body.places[0].nearby[0].distance_m).toBeGreaterThan(1000)
    expect(first.body.places[1].nearby).toEqual([])

    await search(q)
    expect(external.nominatim).toHaveBeenCalledTimes(1)
    const [row] = await sql("select query from public.geocode_cache where query = $1", [q])
    expect(row).toBeTruthy()
  })

  it("still returns spots when place search fails", async () => {
    external.nominatim.mockImplementation(async () => new Response("", { status: 403 }))
    const { status, body } = await search(`test kalerwe ${Date.now()}`)
    expect(status).toBe(200)
    expect(body.places).toEqual([])
    expect(body.error).toMatch(/Place search is unavailable/)
  })

  it("throttles uncached place lookups separately from spot search", async () => {
    const v = visitor()
    for (let i = 0; i < 30; i++) expect((await search(`test place ${i} ${Date.now()}`, "", v)).status).toBe(200)
    // "kalerwe" matches a mapped spot; clear its cached places so the lookup must hit Nominatim.
    await sql("delete from public.geocode_cache where query = 'kalerwe'")
    const { status, body, res } = await search("Kalerwe", "", v)
    expect(status).toBe(429)
    expect(body.spots[0].title).toBe("Kalerwe")
    expect(body.error).toMatch(/Too many place searches/)
    expect(res.headers.get("Retry-After")).toBeTruthy()
  })
})

describe("database security and functions", () => {
  it("keeps internal tables private from the anon role", async () => {
    for (const table of ["rate_limits", "geocode_cache", "votes", "flags", "moderation_log"]) {
      const { data } = await anonClient().from(table).select("*").limit(1)
      expect(data ?? [], table).toEqual([])
    }
  })

  it("does not let anon call write functions", async () => {
    const { error } = await anonClient().rpc("hit_rate_limit", { p_key: "x", p_limit: 1, p_window_seconds: 60 })
    expect(error?.message).toMatch(/permission denied/)
  })

  it("rate limits with a sliding window counter", async () => {
    const key = `test:${Date.now()}`
    const hit = async () => {
      const { data } = await serviceClient().rpc("hit_rate_limit", { p_key: key, p_limit: 2, p_window_seconds: 3600 })
      return data[0]
    }
    expect(await hit()).toMatchObject({ allowed: true, remaining: 1 })
    expect(await hit()).toMatchObject({ allowed: true, remaining: 0 })
    const blocked = await hit()
    expect(blocked.allowed).toBe(false)
    expect(blocked.reset_seconds).toBeGreaterThan(0)
    await sql("delete from public.rate_limits where key = $1", [key])
  })

  it("finds nearby spots in order of distance", async () => {
    const { data } = await anonClient().rpc("spots_near", { p_lat: 0.3136, p_lng: 32.5811, p_radius_m: 1500, lim: 3 })
    expect(data.length).toBeGreaterThan(0)
    expect(data.map((s: { distance_m: number }) => s.distance_m)).toEqual([...data.map((s: { distance_m: number }) => s.distance_m)].sort((a, b) => a - b))
  })
})
