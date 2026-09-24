import { NextRequest } from "next/server"
import { rateLimit, voterHash } from "@/lib/rate-limit"

const UA = process.env.NOMINATIM_USER_AGENT ?? "DeathspotUG/0.1 (community safety map)"

export type Place = { name: string; detail: string; lat: number; lng: number }

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) return Response.json({ places: [] })
  // Nominatim's usage policy allows at most ~1 request per second.
  if (!rateLimit(`geocode:${voterHash(req)}`, 30, 60 * 1000)) {
    return Response.json({ error: "Too many searches" }, { status: 429 })
  }
  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.search = new URLSearchParams({
    q,
    format: "jsonv2",
    countrycodes: "ug",
    limit: "6",
    addressdetails: "0",
  }).toString()
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en" },
    next: { revalidate: 86400 },
  })
  if (!res.ok) return Response.json({ error: "Search unavailable" }, { status: 502 })
  const data = (await res.json()) as { name: string; display_name: string; lat: string; lon: string }[]
  const places: Place[] = data.map((d) => ({
    name: d.name || d.display_name.split(",")[0],
    detail: d.display_name.split(",").slice(1, 4).join(",").trim(),
    lat: Number(d.lat),
    lng: Number(d.lon),
  }))
  return Response.json({ places })
}
