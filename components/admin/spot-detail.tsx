"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { CopyIcon, ExternalLinkIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { getSpotHistory } from "@/app/admin/actions"
import { logAction } from "@/components/admin/log-actions"
import { ModerationBadges } from "@/components/admin/moderation-badge"
import { SeverityMeter, StatusBadge } from "@/components/spot-details"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import type { LogEntry, OpenFlag } from "@/lib/admin"
import { CATEGORIES, FLAG_REASONS, TIMES_OF_DAY, type AdminSpot } from "@/lib/categories"
import { timeAgo } from "@/lib/utils"

const LocationPicker = dynamic(() => import("@/components/map/location-picker"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
})

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  )
}

function History({ spotId }: { spotId: number }) {
  const [log, setLog] = useState<LogEntry[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getSpotHistory(spotId)
      .then((l) => !cancelled && setLog(l))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [spotId])

  if (error) return <p className="text-sm text-muted-foreground">Couldn&apos;t load history.</p>
  if (!log)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> Loading…
      </p>
    )
  if (!log.length) return <p className="text-sm text-muted-foreground">No moderation actions yet.</p>
  return (
    <ol className="flex flex-col gap-3">
      {log.map((e) => {
        const a = logAction(e.action)
        const Icon = a.icon
        return (
          <li key={e.id} className="flex gap-2.5 text-sm">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-white ${a.tone}`}>
              <Icon className="size-3" />
            </span>
            <div className="min-w-0">
              <p className="break-words">
                <span className="font-medium">{e.actor_email ?? (e.action === "auto_hidden" ? "System" : "Unknown")}</span> {a.label.toLowerCase()}
              </p>
              {e.note && <p className="break-words text-muted-foreground">{e.note}</p>}
              <p className="text-xs text-muted-foreground">{timeAgo(e.created_at)}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Everything a moderator needs to decide on one spot. `actions` are the same buttons as on the card. */
export function SpotDetail({ spot, flags, actions }: { spot: AdminSpot; flags: OpenFlag[]; actions: React.ReactNode }) {
  const cat = CATEGORIES[spot.category]
  const coords = `${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}`

  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="flex flex-wrap gap-1.5">
        <ModerationBadges spot={spot} />
        <StatusBadge status={spot.status} />
      </div>

      <div className="isolate h-56 overflow-hidden rounded-lg border sm:h-64">
        <LocationPicker value={{ lat: spot.lat, lng: spot.lng }} />
      </div>
      <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">{coords}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => navigator.clipboard.writeText(coords).then(() => toast.success("Coordinates copied"))}
        >
          <CopyIcon className="size-3" /> Copy
        </button>
        <a
          href={`https://www.openstreetmap.org/?mlat=${spot.lat}&mlon=${spot.lng}#map=17/${spot.lat}/${spot.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ExternalLinkIcon className="size-3" /> OpenStreetMap
        </a>
        {spot.moderation === "approved" && (
          <a href={`/?spot=${spot.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
            <ExternalLinkIcon className="size-3" /> Public page
          </a>
        )}
      </div>

      {actions}

      {flags.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Open flags ({flags.length})</h3>
          <ul className="flex flex-col gap-2 rounded-lg bg-destructive/10 p-3 text-sm">
            {flags.map((f) => (
              <li key={f.id} className="flex flex-col">
                <span className="font-medium text-destructive">{FLAG_REASONS[f.reason]}</span>
                {f.note && <span className="break-words text-muted-foreground">“{f.note}”</span>}
                <span className="text-xs text-muted-foreground">{timeAgo(f.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Report</h3>
        {spot.description ? (
          <p className="mb-3 text-sm leading-relaxed break-words">{spot.description}</p>
        ) : (
          <p className="mb-3 text-sm text-muted-foreground italic">No description given.</p>
        )}
        <dl className="grid grid-cols-2 gap-3">
          <Field label="Category">
            {cat.emoji} {cat.label}
          </Field>
          <Field label="Severity">
            <SeverityMeter severity={spot.severity} />
          </Field>
          <Field label="Area">{spot.area || "—"}</Field>
          <Field label="Dangerous">{TIMES_OF_DAY[spot.time_of_day]}</Field>
          <Field label="Incident date">{spot.incident_date ?? "—"}</Field>
          <Field label="Reported">{spot.seeded ? "Seed data" : timeAgo(spot.created_at)}</Field>
          <Field label="Source">
            {spot.source_url ? (
              <a href={spot.source_url} target="_blank" rel="noopener noreferrer nofollow" className="text-primary hover:underline">
                {new URL(spot.source_url).hostname.replace(/^www\./, "")}
              </a>
            ) : (
              "—"
            )}
          </Field>
          <Field label="ID">#{spot.id}</Field>
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Community</h3>
        <dl className="grid grid-cols-3 gap-3">
          <Field label="Still dangerous">{spot.confirmations}</Field>
          <Field label="Not anymore">{spot.denials}</Field>
          <Field label="Last confirmed">{timeAgo(spot.last_confirmed_at)}</Field>
        </dl>
      </section>

      <Separator />

      <section>
        <h3 className="mb-3 text-sm font-semibold">Moderation history</h3>
        {spot.moderation_note && <p className="mb-3 text-sm text-muted-foreground italic">Latest note: {spot.moderation_note}</p>}
        <History spotId={spot.id} />
      </section>
    </div>
  )
}
