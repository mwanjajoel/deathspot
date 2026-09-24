"use client"

import { useState, useTransition } from "react"
import dynamic from "next/dynamic"
import {
  BadgeCheckIcon,
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  FlagOffIcon,
  Loader2Icon,
  MapIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import { deleteSpot, moderate, type ActionResult, type ModerationAction } from "@/app/admin/actions"
import { EditSpotForm } from "@/components/admin/edit-spot-form"
import { ModerationBadges } from "@/components/admin/moderation-badge"
import { SpotDetail } from "@/components/admin/spot-detail"
import { ResponsiveModal } from "@/components/responsive-modal"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import type { OpenFlag } from "@/lib/admin"
import { CATEGORIES, FLAG_REASONS, TIMES_OF_DAY, severityColor, type AdminSpot } from "@/lib/categories"
import { cn, timeAgo } from "@/lib/utils"

const LocationPicker = dynamic(() => import("@/components/map/location-picker"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
})

type Confirm = { kind: "reject" | "delete" } | null

export function SpotCard({ spot, flags = [] }: { spot: AdminSpot; flags?: OpenFlag[] }) {
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [note, setNote] = useState("")
  const [detail, setDetail] = useState(false)
  const cat = CATEGORIES[spot.category]

  const run = (key: string, fn: () => Promise<ActionResult>) => {
    setBusy(key)
    start(async () => {
      const res = await fn()
      if (res.ok) toast.success(res.message)
      else toast.error(res.error)
      setBusy(null)
    })
  }
  const act = (action: ModerationAction, n?: string) => run(action, () => moderate(spot.id, action, n))

  const icon = (k: string, Icon: React.ComponentType) => (busy === k && pending ? <Loader2Icon className="animate-spin" /> : <Icon />)

  // The whole card opens the detail panel, except clicks on its own controls. Clicks inside
  // portalled dialogs/menus bubble through React too, so only count targets inside the card's DOM.
  const openFromCard = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (!e.currentTarget.contains(target)) return
    if (target.closest("button, a, input, textarea, select, [role=menuitem], .leaflet-container")) return
    if (window.getSelection()?.toString()) return // let moderators select text
    setDetail(true)
  }

  const edit = () => {
    setDetail(false)
    setEditing(true)
  }

  const actions = (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {spot.moderation !== "approved" && (
        <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={pending} onClick={() => act("approve")}>
          {icon("approve", CheckIcon)} {spot.moderation === "rejected" ? "Restore" : "Approve"}
        </Button>
      )}
      {spot.moderation === "approved" && spot.flag_count > 0 && (
        <Button variant="outline" disabled={pending} onClick={() => act("dismiss_flags")}>
          {icon("dismiss_flags", FlagOffIcon)} Keep, dismiss flags
        </Button>
      )}
      {spot.moderation !== "rejected" && (
        <Button variant="outline" disabled={pending} onClick={() => setConfirm({ kind: "reject" })}>
          {icon("reject", EyeOffIcon)} {spot.moderation === "pending" ? "Reject" : "Hide"}
        </Button>
      )}
      <Button variant="ghost" disabled={pending} onClick={edit}>
        <PencilIcon /> Edit
      </Button>
    </div>
  )

  return (
    <Card
      className={cn(
        "group/card cursor-pointer gap-0 py-0 transition-shadow hover:shadow-md hover:ring-2 hover:ring-primary/20",
        detail && "ring-2 ring-primary/40",
      )}
      onClick={openFromCard}
    >
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-full text-lg"
            style={{ background: severityColor(spot.severity) }}
            aria-label={`Severity ${spot.severity}`}
          >
            {cat.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="leading-snug font-semibold break-words">
              <button
                type="button"
                onClick={() => setDetail(true)}
                className="rounded-sm text-left underline-offset-4 outline-none group-hover/card:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {spot.title}
              </button>
            </h3>
            <p className="text-xs text-muted-foreground">
              {cat.label} · {spot.area || "No area"} · {TIMES_OF_DAY[spot.time_of_day]} · severity {spot.severity}/5
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="More actions" className="-mt-1 -mr-2 shrink-0">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDetail(true)}>
                <ChevronRightIcon /> View details
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={edit}>
                <PencilIcon /> Edit details
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShowMap((m) => !m)}>
                <MapIcon /> {showMap ? "Hide map" : "Show on map"}
              </DropdownMenuItem>
              {spot.moderation === "approved" && (
                <DropdownMenuItem asChild>
                  <a href={`/?spot=${spot.id}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLinkIcon /> Open public page
                  </a>
                </DropdownMenuItem>
              )}
              {spot.moderation === "approved" &&
                (spot.moderator_verified ? (
                  <DropdownMenuItem onSelect={() => act("unverify")}>
                    <BadgeCheckIcon /> Remove verification
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => act("verify")}>
                    <BadgeCheckIcon /> Mark verified
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "delete" })}>
                <Trash2Icon /> Delete permanently
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <ModerationBadges spot={spot} />
        </div>

        {spot.description && <p className="text-sm leading-relaxed break-words">{spot.description}</p>}

        {flags.length > 0 && (
          <ul className="flex flex-col gap-1.5 rounded-lg bg-destructive/10 p-3 text-sm">
            {flags.map((f) => (
              <li key={f.id} className="flex flex-col">
                <span className="font-medium text-destructive">{FLAG_REASONS[f.reason]}</span>
                {f.note && <span className="break-words text-muted-foreground">“{f.note}”</span>}
                <span className="text-xs text-muted-foreground">{timeAgo(f.created_at)}</span>
              </li>
            ))}
          </ul>
        )}

        {showMap && (
          <div className="isolate h-48 overflow-hidden rounded-lg border">
            <LocationPicker value={{ lat: spot.lat, lng: spot.lng }} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ThumbsUpIcon className="size-3" /> {spot.confirmations}
          </span>
          <span className="inline-flex items-center gap-1">
            <ThumbsDownIcon className="size-3" /> {spot.denials}
          </span>
          <span>{spot.seeded ? "Seed data" : `Reported ${timeAgo(spot.created_at)}`}</span>
          {spot.moderated_at && <span>Moderated {timeAgo(spot.moderated_at)}</span>}
          {spot.source_url && (
            <a href={spot.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary hover:underline">
              <ExternalLinkIcon className="size-3" /> {new URL(spot.source_url).hostname.replace(/^www\./, "")}
            </a>
          )}
        </div>
        {spot.moderation_note && <p className="text-xs text-muted-foreground italic">Note: {spot.moderation_note}</p>}

        <div className="flex items-end justify-between gap-2">
          {actions}
          <ChevronRightIcon className="mb-2 hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover/card:translate-x-0.5 sm:block" aria-hidden />
        </div>
      </CardContent>

      <ResponsiveModal
        open={detail}
        onOpenChange={setDetail}
        desktop="sheet"
        title={spot.title}
        description={`${cat.emoji} ${cat.label} · ${spot.area || "No area"}`}
        className="md:w-[480px] md:max-w-[480px]"
      >
        {detail && <SpotDetail spot={spot} flags={flags} actions={actions} />}
      </ResponsiveModal>

      <ResponsiveModal open={editing} onOpenChange={setEditing} title="Edit spot" description="Changes are logged and go live immediately.">
        {editing && <EditSpotForm spot={spot} onSaved={() => setEditing(false)} />}
      </ResponsiveModal>

      <AlertDialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) {
            setConfirm(null)
            setNote("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "delete" ? "Delete this spot permanently?" : "Hide this spot from the map?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete"
                ? "The spot, its votes and flags are removed for good. Prefer Hide if you may need it later."
                : "It stays in the admin panel, so you can restore it later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder="Reason (optional, saved in the moderation log)" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.kind === "delete" ? "destructive" : "default"}
              onClick={() => {
                const n = note
                if (confirm?.kind === "delete") run("delete", () => deleteSpot(spot.id, n))
                else act("reject", n)
                setNote("")
              }}
            >
              {confirm?.kind === "delete" ? "Delete" : "Hide spot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
