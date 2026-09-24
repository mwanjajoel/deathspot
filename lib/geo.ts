export type LatLng = { lat: number; lng: number }

/** Rough bounding box around Uganda. */
export const UGANDA_BOUNDS = {
  south: -1.6,
  north: 4.3,
  west: 29.5,
  east: 35.1,
}

export const KAMPALA_CENTER: LatLng = { lat: 0.3136, lng: 32.5811 }

export function inUganda({ lat, lng }: LatLng) {
  return (
    lat >= UGANDA_BOUNDS.south &&
    lat <= UGANDA_BOUNDS.north &&
    lng >= UGANDA_BOUNDS.west &&
    lng <= UGANDA_BOUNDS.east
  )
}

const R = 6371000
const rad = (d: number) => (d * Math.PI) / 180

/** Great-circle distance in metres. */
export function haversine(a: LatLng, b: LatLng) {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Distance in metres from point p to segment a–b. Uses a local equirectangular
 * projection, which is accurate enough over the few-km segments of a city route.
 */
export function pointToSegment(p: LatLng, a: LatLng, b: LatLng) {
  const k = Math.cos(rad(p.lat))
  const ax = (a.lng - p.lng) * k, ay = a.lat - p.lat
  const bx = (b.lng - p.lng) * k, by = b.lat - p.lat
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
  const cx = ax + t * dx, cy = ay + t * dy
  return rad(Math.sqrt(cx * cx + cy * cy)) * R
}

/** Minimum distance from p to a polyline, plus how far along the route that point is. */
export function distanceToPolyline(p: LatLng, line: LatLng[]) {
  let best = Infinity
  let along = 0
  let bestAlong = 0
  for (let i = 0; i < line.length - 1; i++) {
    const d = pointToSegment(p, line[i], line[i + 1])
    if (d < best) {
      best = d
      bestAlong = along
    }
    along += haversine(line[i], line[i + 1])
  }
  return { distance: best, along: bestAlong }
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}
