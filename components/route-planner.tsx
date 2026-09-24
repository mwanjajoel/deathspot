"use client"

import { useState } from "react"
import { ArrowDownUpIcon, CrosshairIcon, Loader2Icon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PlaceSearch } from "@/components/place-search"
import { CATEGORIES, severityColor, type Spot } from "@/lib/categories"
import { formatDistance, type LatLng } from "@/lib/geo"
import type { Place, RouteResult } from "@/lib/types"
import { cn, formatDuration } from "@/lib/utils"

type Endpoint = (LatLng & { label: string }) | null

type Props = {
  me: LatLng | null
  requestLocation: () => Promise<LatLng | null>
  routes: RouteResult[]
  activeRoute: number
  onRoutes: (routes: RouteResult[]) => void
  onActiveRoute: (i: number) => void
  onFocusSpot: (spot: Spot) => void
  onShowMap?: () => void
}

export function RoutePlanner({ me, requestLocation, routes, activeRoute, onRoutes, onActiveRoute, onFocusSpot, onShowMap }: Props) {
  const [from, setFrom] = useState<Endpoint>(me ? { ...me, label: "My location" } : null)
  const [to, setTo] = useState<Endpoint>(null)
  const [loading, setLoading] = useState(false)

  const plan = async (f = from, t = to) => {
    if (!f || !t) return
    setLoading(true)
    try {
      const res = await fetch(`/api/route?from=${f.lat},${f.lng}&to=${t.lat},${t.lng}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onRoutes(data.routes)
      onActiveRoute(0)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not plan route")
    } finally {
      setLoading(false)
    }
  }

  const useMine = async () => {
    const p = me ?? (await requestLocation())
    if (p) setFrom({ ...p, label: "My location" })
  }

  const pick = (setter: (e: Endpoint) => void) => (p: Place) => setter({ lat: p.lat, lng: p.lng, label: p.name })

  const r = routes[activeRoute]

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="size-3 shrink-0 rounded-full border-2 border-blue-600" aria-hidden />
          <PlaceSearch className="flex-1" placeholder="Starting point" value={from?.label} onSelect={pick(setFrom)} onClear={() => setFrom(null)} />
          <Button size="icon" variant="outline" onClick={useMine} aria-label="Use my location" title="Use my location">
            <CrosshairIcon />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-3 shrink-0 rounded-full bg-primary" aria-hidden />
          <PlaceSearch className="flex-1" placeholder="Destination" value={to?.label} onSelect={pick(setTo)} onClear={() => setTo(null)} />
          <Button
            size="icon"
            variant="outline"
            aria-label="Swap start and destination"
            title="Swap"
            onClick={() => {
              setFrom(to)
              setTo(from)
            }}
          >
            <ArrowDownUpIcon />
          </Button>
        </div>
      </div>

      <Button onClick={() => plan()} disabled={!from || !to || loading} className="h-11">
        {loading && <Loader2Icon className="animate-spin" />}
        Check route for danger spots
      </Button>

      {routes.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">Routes, safest first</div>
          {routes.map((route, i) => (
            <button
              key={i}
              onClick={() => onActiveRoute(i)}
              className={cn("flex items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent", i === activeRoute && "border-blue-600 ring-2 ring-blue-600/30")}
            >
              <span>
                <span className="font-semibold">{formatDuration(route.duration)}</span>
                <span className="text-muted-foreground"> · {formatDistance(route.distance)}</span>
                {i === 0 && routes.length > 1 && <span className="ml-2 text-xs font-medium text-emerald-600">Safest</span>}
              </span>
              {route.dangers.length === 0 ? (
                <Badge variant="outline" className="border-emerald-600 text-emerald-600">
                  <ShieldCheckIcon /> No reported spots
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <TriangleAlertIcon /> {route.dangers.length} danger spot{route.dangers.length > 1 ? "s" : ""}
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}

      {r && onShowMap && (
        <Button variant="outline" onClick={onShowMap} className="md:hidden">
          Show route on map
        </Button>
      )}

      {r && r.dangers.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">Along this route</div>
          <ol className="flex flex-col gap-1.5">
            {r.dangers.map(({ spot, along, distance }) => (
              <li key={spot.id}>
                <button onClick={() => onFocusSpot(spot)} className="flex w-full items-center gap-3 rounded-lg border p-2.5 text-left text-sm hover:bg-accent">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full text-base" style={{ background: severityColor(spot.severity) }}>
                    {CATEGORIES[spot.category].emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{spot.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDistance(along)} into the trip · {Math.round(distance)} m off the road
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Flags spots within 150 m of the route. If you have to pass through, go in daylight, avoid walking alone, and use a trusted boda or ride-hailing driver.
          </p>
        </div>
      )}
    </div>
  )
}
