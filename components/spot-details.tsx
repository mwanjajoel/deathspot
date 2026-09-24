"use client"

import { CheckIcon, ClockIcon, ExternalLinkIcon, MapPinIcon, NavigationIcon, Share2Icon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { CATEGORIES, STATUS_LABEL, TIMES_OF_DAY, severityColor, type Spot } from "@/lib/categories"
import { formatDistance, haversine, type LatLng } from "@/lib/geo"
import { timeAgo } from "@/lib/utils"

type Props = {
  spot: Spot
  myVote?: number
  me: LatLng | null
  onVote: (value: 1 | -1) => void
  voting: boolean
  onCheckRoute: () => void
}

export function StatusBadge({ status }: { status: Spot["status"] }) {
  const variant = status === "confirmed" ? "destructive" : status === "disputed" ? "outline" : "secondary"
  return (
    <Badge variant={variant} className={status === "unverified" ? "border-dashed border-foreground/30" : undefined}>
      {status === "confirmed" && <CheckIcon />}
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export function SeverityMeter({ severity }: { severity: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Severity ${severity} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="h-2.5 w-4 rounded-sm" style={{ background: i <= severity ? severityColor(severity) : "var(--muted)" }} />
      ))}
    </span>
  )
}

export function SpotDetails({ spot, myVote, me, onVote, voting, onCheckRoute }: Props) {
  const cat = CATEGORIES[spot.category]

  const share = async () => {
    const url = `${window.location.origin}/?spot=${spot.id}`
    const data = { title: `Danger spot: ${spot.title}`, text: `Stay safe. Reported danger spot: ${spot.title} (${spot.area}). Via Deathspot UG`, url }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard.writeText(url)
        toast.success("Link copied. Share it on WhatsApp to warn others.")
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" style={{ borderColor: cat.color, color: cat.color }}>
          <span aria-hidden>{cat.emoji}</span> {cat.label}
        </Badge>
        <StatusBadge status={spot.status} />
        <Badge variant="outline">
          <ClockIcon /> {TIMES_OF_DAY[spot.time_of_day]}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Severity</div>
          <SeverityMeter severity={spot.severity} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Area</div>
          <div className="flex items-center gap-1 font-medium">
            <MapPinIcon className="size-3.5 text-muted-foreground" />
            {spot.area || "Unknown"}
          </div>
        </div>
        {me && (
          <div>
            <div className="text-xs text-muted-foreground">From you</div>
            <div className="font-medium">{formatDistance(haversine(me, spot))}</div>
          </div>
        )}
        <div>
          <div className="text-xs text-muted-foreground">Last confirmed</div>
          <div className="font-medium">{timeAgo(spot.last_confirmed_at)}</div>
        </div>
      </div>

      {spot.description && <p className="text-sm leading-relaxed">{spot.description}</p>}

      {spot.source_url && (
        <a href={spot.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
          <ExternalLinkIcon className="size-3.5" />
          Source: {new URL(spot.source_url).hostname.replace(/^www\./, "")}
        </a>
      )}

      <Separator />

      <div>
        <div className="mb-2 text-sm font-medium">Is this place still dangerous?</div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={myVote === 1 ? "destructive" : "outline"} disabled={voting || myVote === 1} onClick={() => onVote(1)} className="h-11">
            <ThumbsUpIcon /> Still dangerous
            <span className="ml-1 tabular-nums opacity-70">{spot.confirmations}</span>
          </Button>
          <Button variant={myVote === -1 ? "secondary" : "outline"} disabled={voting || myVote === -1} onClick={() => onVote(-1)} className="h-11">
            <ThumbsDownIcon /> Not anymore
            <span className="ml-1 tabular-nums opacity-70">{spot.denials}</span>
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {spot.seeded ? "Seeded from public reports. " : `Reported ${timeAgo(spot.created_at)}. `}
          Three net “still dangerous” votes mark a spot community confirmed.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={share}>
          <Share2Icon /> Warn others
        </Button>
        <Button variant="secondary" onClick={onCheckRoute}>
          <NavigationIcon /> Check my route
        </Button>
      </div>
    </div>
  )
}
