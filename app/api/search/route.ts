import { geocode, searchSpots, withNearby, type PlaceHit } from "@/lib/search"
import { rateLimitHeaders, withRateLimit } from "@/lib/rate-limit"

/**
 * Real-time search. `places=0` returns only mapped spots (fast, for every keystroke);
 * otherwise geocoded places are included, each with the mapped spots near it.
 */
export const GET = withRateLimit("search", async (req: Request) => {
  const sp = new URL(req.url).searchParams
  const q = (sp.get("q") ?? "").trim().slice(0, 100)
  if (q.length < 2) return Response.json({ spots: [], places: [] })

  const wantPlaces = sp.get("places") !== "0" && q.length >= 3
  const [spots, geo] = await Promise.all([
    searchSpots(q),
    // A place-lookup failure (e.g. Nominatim down) must never break spot search.
    wantPlaces ? geocode(q, req.headers).catch(() => ({ failed: true as const })) : null,
  ])

  if (geo && "failed" in geo) {
    return Response.json({ spots, places: [], error: "Place search is unavailable right now. Showing mapped spots only." })
  }

  if (geo && "limited" in geo) {
    // Spot matches still come back; only the place lookup is throttled.
    return Response.json(
      { spots, places: [], error: geo.limited.policy.message },
      { status: 429, headers: rateLimitHeaders(geo.limited) },
    )
  }
  let places: PlaceHit[] = []
  if (geo) {
    try {
      places = await withNearby(geo.places)
    } catch {
      places = []
    }
  }
  return Response.json({ spots, places })
})
