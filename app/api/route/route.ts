import { listSpots } from "@/lib/db"
import { distanceToPolyline, inUganda, type LatLng } from "@/lib/geo"
import { withRateLimit } from "@/lib/rate-limit"

/** Spots closer than this to the route are flagged. */
const DANGER_BUFFER_M = 150

function parse(v: string | null): LatLng | null {
  const [lat, lng] = (v ?? "").split(",").map(Number)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

export const GET = withRateLimit("route", async (req: Request) => {
  const sp = new URL(req.url).searchParams
  const from = parse(sp.get("from"))
  const to = parse(sp.get("to"))
  if (!from || !to || !inUganda(from) || !inUganda(to)) {
    return Response.json({ error: "from and to must be lat,lng points inside Uganda" }, { status: 400 })
  }
  const osrm = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=true`
  const res = await fetch(osrm, { headers: { "User-Agent": "DeathspotUG/0.1" } })
  if (!res.ok) return Response.json({ error: "Routing service unavailable" }, { status: 502 })
  const data = (await res.json()) as {
    code: string
    routes: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[]
  }
  if (data.code !== "Ok" || !data.routes.length) {
    return Response.json({ error: "No route found" }, { status: 404 })
  }

  const spots = (await listSpots()).filter((s) => s.status !== "disputed")
  const routes = data.routes.map((r) => {
    const line = r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
    const dangers = spots
      .map((s) => ({ spot: s, ...distanceToPolyline(s, line) }))
      .filter((d) => d.distance <= DANGER_BUFFER_M)
      .sort((a, b) => a.along - b.along)
    const risk = dangers.reduce((sum, d) => sum + d.spot.severity, 0)
    return { distance: r.distance, duration: r.duration, line, dangers, risk }
  })
  // Safest first; when risk is equal, the faster route wins.
  routes.sort((a, b) => a.risk - b.risk || a.duration - b.duration)
  return Response.json({ routes, bufferMeters: DANGER_BUFFER_M })
})
