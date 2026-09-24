import type { Spot } from "./categories"
import type { LatLng } from "./geo"

export type RouteDanger = { spot: Spot; distance: number; along: number }

export type RouteResult = {
  distance: number
  duration: number
  line: LatLng[]
  dangers: RouteDanger[]
  risk: number
}

export type FlyTarget = LatLng & { zoom?: number; key: number }
