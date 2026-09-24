"use client"

import { useCallback, useState, useTransition } from "react"
import dynamic from "next/dynamic"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { updateSpot, type SpotEdit } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { CATEGORIES, CATEGORY_KEYS, TIMES_OF_DAY, severityColor, type AdminSpot } from "@/lib/categories"
import type { LatLng } from "@/lib/geo"
import { cn } from "@/lib/utils"

const LocationPicker = dynamic(() => import("@/components/map/location-picker"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
})

export function EditSpotForm({ spot, onSaved }: { spot: AdminSpot; onSaved: () => void }) {
  const [form, setForm] = useState<SpotEdit>({
    title: spot.title,
    description: spot.description,
    area: spot.area,
    category: spot.category,
    severity: spot.severity,
    time_of_day: spot.time_of_day,
    lat: spot.lat,
    lng: spot.lng,
    incident_date: spot.incident_date ?? "",
    source_url: spot.source_url ?? "",
    note: "",
  })
  const [pending, start] = useTransition()
  const set = <K extends keyof SpotEdit>(k: K, v: SpotEdit[K]) => setForm((f) => ({ ...f, [k]: v }))
  const move = useCallback((p: LatLng) => setForm((f) => ({ ...f, lat: p.lat, lng: p.lng })), [])

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const res = await updateSpot(spot.id, form)
      if (res.ok) {
        toast.success(res.message)
        onSaved()
      } else toast.error(res.error)
    })
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Location</Label>
        <div className="isolate h-56 overflow-hidden rounded-lg border">
          <LocationPicker value={{ lat: form.lat, lng: form.lng }} onChange={move} />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {form.lat.toFixed(5)}, {form.lng.toFixed(5)}: drag the pin or tap the map to move it
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="e-title">Title</Label>
        <Input id="e-title" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={80} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Category</Label>
          <Select value={form.category} onValueChange={(v) => set("category", v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_KEYS.map((k) => (
                <SelectItem key={k} value={k}>
                  {CATEGORIES[k].emoji} {CATEGORIES[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>When dangerous</Label>
          <Select value={form.time_of_day} onValueChange={(v) => set("time_of_day", v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIMES_OF_DAY).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Severity</Label>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set("severity", n)}
              aria-pressed={form.severity === n}
              className={cn("h-9 flex-1 rounded-md border text-sm font-semibold", form.severity >= n ? "text-white" : "bg-muted text-muted-foreground")}
              style={form.severity >= n ? { background: severityColor(form.severity), borderColor: "transparent" } : undefined}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="e-area">Area</Label>
          <Input id="e-area" value={form.area} onChange={(e) => set("area", e.target.value)} maxLength={80} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="e-date">Incident date</Label>
          <Input id="e-date" type="date" value={form.incident_date ?? ""} onChange={(e) => set("incident_date", e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="e-desc">Description</Label>
        <Textarea id="e-desc" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={600} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="e-src">Source link</Label>
        <Input id="e-src" type="url" value={form.source_url ?? ""} onChange={(e) => set("source_url", e.target.value)} placeholder="https://" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="e-note">Note for the moderation log (optional)</Label>
        <Input id="e-note" value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={300} placeholder="e.g. removed a person's name" />
      </div>

      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Save changes
      </Button>
    </form>
  )
}
