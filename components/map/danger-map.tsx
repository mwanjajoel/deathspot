"use client"

import { useEffect, useMemo, useRef } from "react"
import L from "leaflet"
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet"
import { CATEGORIES, severityColor, type Spot } from "@/lib/categories"
import { KAMPALA_CENTER, UGANDA_BOUNDS, type LatLng } from "@/lib/geo"
import { TILE_ATTRIBUTION as ATTRIBUTION, TILE_URL } from "@/lib/tiles"
import type { FlyTarget, RouteResult } from "@/lib/types"

// leaflet.markercluster and leaflet.heat are UMD plugins that patch the global `L`.
if (typeof window !== "undefined") (window as unknown as { L: typeof L }).L = L

export type DangerMapProps = {
  spots: Spot[]
  selectedId: number | null
  onSelect: (spot: Spot) => void
  showHeat: boolean
  me: LatLng | null
  picking: boolean
  pickedPoint: LatLng | null
  onPick: (p: LatLng) => void
  routes: RouteResult[]
  activeRoute: number
  onRouteSelect: (i: number) => void
  flyTo: FlyTarget | null
}


function spotIcon(spot: Spot, selected: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="spot-pin" data-status="${spot.status}" data-selected="${selected}" style="background:${severityColor(
      spot.severity,
    )}"><span>${CATEGORIES[spot.category].emoji}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  })
}

const meIcon = L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })
const pickIcon = L.divIcon({ className: "", html: '<div class="pick-pin">📍</div>', iconSize: [34, 34], iconAnchor: [17, 32] })

function SpotLayer({ spots, selectedId, onSelect }: Pick<DangerMapProps, "spots" | "selectedId" | "onSelect">) {
  const map = useMap()
  const groupRef = useRef<L.MarkerClusterGroup | null>(null)
  const markers = useRef(new Map<number, L.Marker>())
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    let cancelled = false
    const markerMap = markers.current
    import("leaflet.markercluster").then(() => {
      if (cancelled) return
      const group = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
        disableClusteringAtZoom: 15,
        iconCreateFunction(cluster) {
          const children = cluster.getAllChildMarkers()
          const worst = Math.max(...children.map((m) => (m.options as { severity?: number }).severity ?? 1))
          const n = cluster.getChildCount()
          const size = n < 10 ? 36 : n < 50 ? 44 : 52
          return L.divIcon({
            className: "",
            html: `<div class="danger-cluster" style="width:${size}px;height:${size}px;background:${severityColor(worst)}">${n}</div>`,
            iconSize: [size, size],
          })
        },
      })
      groupRef.current = group
      map.addLayer(group)
      // Trigger the sync effect now that the group exists.
      map.fire("deathspot:cluster-ready")
    })
    return () => {
      cancelled = true
      if (groupRef.current) map.removeLayer(groupRef.current)
      groupRef.current = null
      markerMap.clear()
    }
  }, [map])

  useEffect(() => {
    const sync = () => {
      const group = groupRef.current
      if (!group) return
      const seen = new Set<number>()
      for (const spot of spots) {
        seen.add(spot.id)
        const icon = spotIcon(spot, spot.id === selectedId)
        let m = markers.current.get(spot.id)
        if (!m) {
          m = L.marker([spot.lat, spot.lng], { icon, severity: spot.severity, title: spot.title } as L.MarkerOptions)
          m.on("click", () => onSelectRef.current(spot))
          markers.current.set(spot.id, m)
          group.addLayer(m)
        } else {
          m.setIcon(icon)
          m.off("click").on("click", () => onSelectRef.current(spot))
          ;(m.options as { severity?: number }).severity = spot.severity
        }
      }
      for (const [id, m] of markers.current) {
        if (!seen.has(id)) {
          group.removeLayer(m)
          markers.current.delete(id)
        }
      }
      group.refreshClusters()
    }
    sync()
    map.on("deathspot:cluster-ready", sync)
    return () => {
      map.off("deathspot:cluster-ready", sync)
    }
  }, [map, spots, selectedId])

  return null
}

function HeatLayer({ spots }: { spots: Spot[] }) {
  const map = useMap()
  useEffect(() => {
    let layer: L.HeatLayer | null = null
    let cancelled = false
    import("leaflet.heat").then(() => {
      if (cancelled) return
      layer = L.heatLayer(
        spots.filter((s) => s.status !== "disputed").map((s) => [s.lat, s.lng, s.severity / 3]),
        { radius: 40, blur: 28, maxZoom: 13, minOpacity: 0.45, gradient: { 0.3: "#facc15", 0.6: "#f97316", 1: "#991b1b" } },
      ).addTo(map)
    })
    return () => {
      cancelled = true
      if (layer) map.removeLayer(layer)
    }
  }, [map, spots])
  return null
}

function MapEvents({ picking, onPick }: { picking: boolean; onPick: (p: LatLng) => void }) {
  const map = useMapEvents({
    click(e) {
      if (picking) onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  useEffect(() => {
    map.getContainer().style.cursor = picking ? "crosshair" : ""
  }, [map, picking])
  return null
}

function FlyController({ target, routes, activeRoute }: { target: FlyTarget | null; routes: RouteResult[]; activeRoute: number }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom ?? Math.max(map.getZoom(), 15), { duration: 0.8 })
  }, [map, target])
  useEffect(() => {
    const r = routes[activeRoute]
    if (r) map.flyToBounds(L.latLngBounds(r.line.map((p) => [p.lat, p.lng])), { padding: [60, 60], duration: 0.8 })
    // Only refit when a new set of routes arrives, not when switching between them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routes])
  return null
}

export default function DangerMap(props: DangerMapProps) {
  const selected = useMemo(() => props.spots.find((s) => s.id === props.selectedId), [props.spots, props.selectedId])

  return (
    <MapContainer
      center={[KAMPALA_CENTER.lat, KAMPALA_CENTER.lng]}
      zoom={13}
      minZoom={7}
      maxBounds={[
        [UGANDA_BOUNDS.south - 1, UGANDA_BOUNDS.west - 1],
        [UGANDA_BOUNDS.north + 1, UGANDA_BOUNDS.east + 1],
      ]}
      zoomControl={false}
      className="size-full"
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />

      {props.routes.map((r, i) =>
        i === props.activeRoute ? null : (
          <Polyline
            key={`alt-${i}`}
            positions={r.line.map((p) => [p.lat, p.lng])}
            pathOptions={{ color: "#64748b", weight: 6, opacity: 0.55 }}
            eventHandlers={{ click: () => props.onRouteSelect(i) }}
          />
        ),
      )}
      {props.routes[props.activeRoute] && (
        <>
          <Polyline positions={props.routes[props.activeRoute].line.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#ffffff", weight: 10, opacity: 0.9 }} />
          <Polyline positions={props.routes[props.activeRoute].line.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#2563eb", weight: 6 }} />
        </>
      )}

      {props.showHeat ? <HeatLayer spots={props.spots} /> : <SpotLayer spots={props.spots} selectedId={props.selectedId} onSelect={props.onSelect} />}

      {selected && (
        <Circle
          center={[selected.lat, selected.lng]}
          radius={150}
          pathOptions={{ color: severityColor(selected.severity), fillOpacity: 0.15, weight: 1.5, dashArray: "4 4" }}
        />
      )}
      {props.me && <Marker position={[props.me.lat, props.me.lng]} icon={meIcon} interactive={false} />}
      {props.pickedPoint && <Marker position={[props.pickedPoint.lat, props.pickedPoint.lng]} icon={pickIcon} interactive={false} />}

      <MapEvents picking={props.picking} onPick={props.onPick} />
      <FlyController target={props.flyTo} routes={props.routes} activeRoute={props.activeRoute} />
    </MapContainer>
  )
}
