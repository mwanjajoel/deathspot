"use client"

import { useState } from "react"
import { Loader2Icon, MapPinIcon, ShieldAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CATEGORIES, CATEGORY_KEYS, TIMES_OF_DAY, severityColor, type Category, type Spot, type TimeOfDay } from "@/lib/categories"
import type { LatLng } from "@/lib/geo"
import { cn } from "@/lib/utils"

type Props = {
  point: LatLng
  requireApproval: boolean
  onRepick: () => void
  onCreated: (spot: Spot, pending: boolean) => void
}

const SEVERITY_HINT = ["", "Feels unsafe", "Harassment / threats", "Robbery / snatching", "Violent attack", "Someone was killed"]

export function ReportForm({ point, requireApproval, onRepick, onCreated }: Props) {
  const [category, setCategory] = useState<Category | "">("")
  const [severity, setSeverity] = useState(3)
  const [time, setTime] = useState<TimeOfDay>("night")
  const [title, setTitle] = useState("")
  const [area, setArea] = useState("")
  const [description, setDescription] = useState("")
  const [date, setDate] = useState("")
  const [source, setSource] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!category) {
      toast.error("Choose what happened")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/spots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || `${CATEGORIES[category].label}${area ? ` – ${area}` : ""}`,
          description,
          area,
          category,
          severity,
          time_of_day: time,
          incident_date: date || null,
          source_url: source.trim() || null,
          lat: point.lat,
          lng: point.lng,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Could not save report")
      toast.success(
        data.pending
          ? "Thank you. Moderators will review your report before it appears on the map."
          : "Thank you. Your report is live and others can now confirm it.",
      )
      onCreated(data.spot, data.pending)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save report")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <MapPinIcon className="size-4 shrink-0 text-primary" />
          <span className="truncate tabular-nums">
            {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
          </span>
        </span>
        <Button type="button" size="sm" variant="outline" onClick={onRepick}>
          Move pin
        </Button>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">What happened here?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CATEGORY_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setCategory(k)}
              aria-pressed={category === k}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-xs font-medium transition-colors hover:bg-accent",
                category === k && "border-primary bg-primary/10 ring-2 ring-primary/40",
              )}
            >
              <span className="text-xl" aria-hidden>
                {CATEGORIES[k].emoji}
              </span>
              {CATEGORIES[k].label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label>How serious?</Label>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSeverity(n)}
              aria-label={`Severity ${n}`}
              aria-pressed={severity === n}
              className={cn("h-9 flex-1 rounded-md border text-sm font-semibold transition", severity >= n ? "text-white" : "bg-muted text-muted-foreground")}
              style={severity >= n ? { background: severityColor(severity), borderColor: "transparent" } : undefined}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{SEVERITY_HINT[severity]}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>When is it dangerous?</Label>
        <ToggleGroup type="single" variant="outline" value={time} onValueChange={(v) => v && setTime(v as TimeOfDay)} className="w-full">
          {Object.entries(TIMES_OF_DAY).map(([k, label]) => (
            <ToggleGroupItem key={k} value={k} className="flex-1">
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="r-area">Area / landmark</Label>
          <Input id="r-area" value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} placeholder="e.g. Kalerwe market" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="r-date">Date (optional)</Label>
          <Input id="r-date" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="r-title">Short title (optional)</Label>
        <Input id="r-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Boda gang attacks near the junction" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="r-desc">What should people know? (optional)</Label>
        <Textarea id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} rows={3} placeholder="Describe the place and when it's dangerous. Don't name or describe individuals." />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="r-src">News or police link (optional)</Label>
        <Input id="r-src" type="url" inputMode="url" value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://" />
      </div>

      <div className="flex gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
        <ShieldAlertIcon className="size-4 shrink-0" />
        <p>
          {requireApproval && "Reports are checked by moderators before they appear. "}
          Report places, not people. Don&apos;t accuse or name anyone. If a crime just happened, call <strong>999</strong> or <strong>112</strong> first.
        </p>
      </div>

      <Button type="submit" size="lg" className="h-12 text-base" disabled={submitting || !category}>
        {submitting && <Loader2Icon className="animate-spin" />}
        Post danger alert
      </Button>
    </form>
  )
}
