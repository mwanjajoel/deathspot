import "server-only"
import type { Category, SpotStatus } from "./categories"
import { haversine } from "./geo"
import { checkRateLimit, type LimitResult } from "./rate-limit"
import { anonClient, serviceClient } from "./supabase/server"

/** A mapped spot matching the search text. */
export type SpotHit = {
  id: number
  title: string
  area: string
  category: Category
  severity: number
  status: SpotStatus
  moderator_verified: boolean
  lat: number
  lng: number
  score: number
}

/** A mapped spot near a searched place. */
export type NearbySpot = Omit<SpotHit, "score"> & { distance_m: number }

/** A geocoded place, with the mapped spots around it. */
export type PlaceHit = { name: string; detail: string; lat: number; lng: number; nearby: NearbySpot[] }

export type SearchResults = { spots: SpotHit[]; places: PlaceHit[] }

/** Radius used to relate a searched place to mapped spots. */
export const NEARBY_RADIUS_M = 2000
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000
/** west,north,east,south */
const KAMPALA_VIEWBOX = "32.35,0.55,32.85,0.05"
const UA = process.env.NOMINATIM_USER_AGENT ?? "DeathspotUG/0.2 (community safety map; https://github.com/mwanjajoel/deathspot)"

type Geocoded = Omit<PlaceHit, "nearby">

export const normalise = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ")

/** Fuzzy match over approved spots' titles, areas and descriptions (pg_trgm, in Postgres). */
export async function searchSpots(q: string, limit = 8): Promise<SpotHit[]> {
  const { data, error } = await anonClient().rpc("search_spots", { q, lim: limit })
  if (error) throw new Error(`searchSpots: ${error.message}`)
  return data as SpotHit[]
}

export async function spotsNear(lat: number, lng: number, radiusM = NEARBY_RADIUS_M, limit = 5): Promise<NearbySpot[]> {
  const { data, error } = await anonClient().rpc("spots_near", { p_lat: lat, p_lng: lng, p_radius_m: radiusM, lim: limit })
  if (error) throw new Error(`spotsNear: ${error.message}`)
  return data as NearbySpot[]
}

async function fetchNominatim(q: string): Promise<Geocoded[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.search = new URLSearchParams({
    q,
    format: "jsonv2",
    countrycodes: "ug",
    limit: "6",
    addressdetails: "0",
    // Prefer (but don't restrict to) Greater Kampala, where most spots are mapped.
    viewbox: KAMPALA_VIEWBOX,
    bounded: "0",
  }).toString()
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } })
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`)
  const data = (await res.json()) as { name: string; display_name: string; lat: string; lon: string }[]
  return data.map((d) => ({
    name: d.name || d.display_name.split(",")[0],
    detail: d.display_name.split(",").slice(1, 4).join(",").trim(),
    lat: Number(d.lat),
    lng: Number(d.lon),
  }))
}

export type GeocodeOutcome = { places: Geocoded[]; source: "cache" | "nominatim" } | { limited: LimitResult }

/**
 * Places for `q`, served from the geocode_cache table when possible. Only cache misses reach
 * Nominatim, and only those count against the caller's `geocode` rate limit.
 */
export async function geocode(q: string, headers: Headers): Promise<GeocodeOutcome> {
  const key = normalise(q)
  const db = serviceClient()
  const { data: cached } = await db.from("geocode_cache").select("places, fetched_at").eq("query", key).maybeSingle()
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return { places: cached.places as Geocoded[], source: "cache" }
  }
  const limit = await checkRateLimit(headers, "geocode")
  if (!limit.allowed) return { limited: limit }
  const places = await fetchNominatim(q)
  await db.from("geocode_cache").upsert({ query: key, places, fetched_at: new Date().toISOString() })
  return { places, source: "nominatim" }
}

/** Same-named places closer than this are treated as one (OSM often has a node, a suburb and a road). */
const DUPLICATE_RADIUS_M = 3000

/**
 * Collapses duplicate places: for each name, keep one result per DUPLICATE_RADIUS_M, preferring
 * the one with the most mapped spots nearby. Order otherwise follows the geocoder's ranking.
 */
export function dedupePlaces(places: PlaceHit[]): PlaceHit[] {
  const kept: PlaceHit[] = []
  for (const p of places) {
    const i = kept.findIndex((k) => normalise(k.name) === normalise(p.name) && haversine(k, p) < DUPLICATE_RADIUS_M)
    if (i < 0) kept.push(p)
    else if (p.nearby.length > kept[i].nearby.length) kept[i] = p
  }
  return kept
}

/**
 * Places with the mapped spots within NEARBY_RADIUS_M of each, duplicates removed. Places near
 * mapped spots come first (a stable sort, so the geocoder's ranking breaks ties).
 */
export async function withNearby(places: Geocoded[]): Promise<PlaceHit[]> {
  const hits = await Promise.all(places.map(async (p) => ({ ...p, nearby: await spotsNear(p.lat, p.lng) })))
  return dedupePlaces(hits).sort((a, b) => b.nearby.length - a.nearby.length)
}
