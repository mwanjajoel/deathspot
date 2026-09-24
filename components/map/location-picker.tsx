"use client"

import { useMemo } from "react"
import L from "leaflet"
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet"
import { UGANDA_BOUNDS, type LatLng } from "@/lib/geo"
import { TILE_ATTRIBUTION, TILE_URL } from "@/lib/tiles"

const pinIcon = L.divIcon({ className: "", html: '<div class="pick-pin">📍</div>', iconSize: [34, 34], iconAnchor: [17, 32] })

function ClickToMove({ onChange }: { onChange: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

/** Small map for moderators: drag the pin or tap to move it. Without `onChange` it is a read-only preview. */
export default function LocationPicker({ value, onChange }: { value: LatLng; onChange?: (p: LatLng) => void }) {
  const handlers = useMemo(
    () => ({
      dragend: (e: L.LeafletEvent) => {
        const p = (e.target as L.Marker).getLatLng()
        onChange?.({ lat: p.lat, lng: p.lng })
      },
    }),
    [onChange],
  )
  return (
    <MapContainer
      center={[value.lat, value.lng]}
      zoom={16}
      minZoom={7}
      maxBounds={[
        [UGANDA_BOUNDS.south - 1, UGANDA_BOUNDS.west - 1],
        [UGANDA_BOUNDS.north + 1, UGANDA_BOUNDS.east + 1],
      ]}
      className="size-full"
      scrollWheelZoom={false}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      <Marker position={[value.lat, value.lng]} icon={pinIcon} draggable={!!onChange} eventHandlers={handlers} />
      {onChange && <ClickToMove onChange={onChange} />}
    </MapContainer>
  )
}
