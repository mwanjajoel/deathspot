"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2Icon, MapPinIcon, SearchIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { CATEGORIES, severityColor } from "@/lib/categories"
import { formatDistance } from "@/lib/geo"
import type { PlaceHit, SearchResults, SpotHit } from "@/lib/search"
import { cn } from "@/lib/utils"

export type SearchSelection =
  | { kind: "spot"; id: number; name: string; lat: number; lng: number }
  | { kind: "place"; name: string; lat: number; lng: number }

type Props = {
  placeholder?: string
  value?: string
  onSelect: (selection: SearchSelection) => void
  onClear?: () => void
  className?: string
  inputClassName?: string
  autoFocus?: boolean
}

// Spots come from our own database, so they're fetched almost on every keystroke; places need
// OpenStreetMap on a cache miss, so they wait for a short pause in typing.
const SPOTS_DELAY_MS = 120
const PLACES_DELAY_MS = 450

type Row = { key: string; selection: SearchSelection; spot?: SpotHit; place?: PlaceHit }

function Highlight({ text, term }: { text: string; term: string }) {
  const i = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-primary/15 px-0.5 text-inherit">{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  )
}

export function PlaceSearch({ placeholder = "Search places or danger spots", value, onSelect, onClear, className, inputClassName, autoFocus }: Props) {
  const [q, setQ] = useState(value ?? "")
  const [prevValue, setPrevValue] = useState(value)
  const [results, setResults] = useState<SearchResults>({ spots: [], places: [] })
  const [loadingPlaces, setLoadingPlaces] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const seq = useRef(0)
  const inflight = useRef<AbortController[]>([])

  // Let the parent set the text (e.g. "My location") without triggering a search.
  if (value !== prevValue) {
    setPrevValue(value)
    setQ(value ?? "")
  }

  const cancel = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    inflight.current.forEach((c) => c.abort())
    inflight.current = []
  }
  useEffect(() => cancel, [])

  const load = async (term: string, withPlaces: boolean, id: number) => {
    const ctrl = new AbortController()
    inflight.current.push(ctrl)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}${withPlaces ? "" : "&places=0"}`, { signal: ctrl.signal })
      const data = (await res.json()) as SearchResults & { error?: string }
      if (id !== seq.current) return // a newer search has started
      // Keep places from the previous full search while a quick spots-only refresh arrives.
      setResults((prev) => ({ spots: data.spots ?? [], places: withPlaces ? (data.places ?? []) : prev.places }))
      setNotice(data.error ?? null)
      setActive(0)
      setOpen(true)
    } catch {
      /* aborted or offline */
    } finally {
      if (withPlaces && id === seq.current) setLoadingPlaces(false)
    }
  }

  const search = (text: string) => {
    setQ(text)
    cancel()
    const id = ++seq.current
    const term = text.trim()
    if (term.length < 2) {
      setResults({ spots: [], places: [] })
      setOpen(false)
      setLoadingPlaces(false)
      return
    }
    timers.current.push(setTimeout(() => load(term, false, id), SPOTS_DELAY_MS))
    if (term.length >= 3) {
      setLoadingPlaces(true)
      timers.current.push(setTimeout(() => load(term, true, id), PLACES_DELAY_MS))
    }
  }

  const rows: Row[] = [
    ...results.spots.map((s) => ({
      key: `s${s.id}`,
      spot: s,
      selection: { kind: "spot" as const, id: s.id, name: s.title, lat: s.lat, lng: s.lng },
    })),
    ...results.places.map((p, i) => ({
      key: `p${i}${p.lat}${p.lng}`,
      place: p,
      selection: { kind: "place" as const, name: p.name, lat: p.lat, lng: p.lng },
    })),
  ]

  const choose = (row: Row) => {
    setQ(row.selection.name)
    setOpen(false)
    onSelect(row.selection)
  }

  const term = q.trim()

  // The results panel anchors to the nearest positioned ancestor: this wrapper by default, or a
  // wider container when the caller passes `static` (e.g. the map's whole top bar on phones).
  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => search(e.target.value)}
          onFocus={() => rows.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !rows.length) return
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setActive((a) => (a + 1) % rows.length)
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setActive((a) => (a - 1 + rows.length) % rows.length)
            } else if (e.key === "Enter") {
              e.preventDefault()
              choose(rows[active])
            } else if (e.key === "Escape") setOpen(false)
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className={cn("pr-9 pl-9", inputClassName)}
        />
        <div className="absolute top-1/2 right-2 -translate-y-1/2">
          {loadingPlaces ? (
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Searching places" />
          ) : q ? (
            <button
              type="button"
              aria-label="Clear search"
              className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted"
              onClick={() => {
                search("")
                onClear?.()
              }}
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {open && (
        <div role="listbox" className="absolute inset-x-0 top-full z-[1100] mt-1 max-h-[min(70dvh,26rem)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
          {rows.length === 0 && !loadingPlaces && (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">No mapped spots or places match “{term}”</p>
          )}

          {results.spots.length > 0 && (
            <p className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Mapped danger spots</p>
          )}
          {rows.map((row, i) => (
            <div key={row.key}>
              {row.place && i === results.spots.length && (
                <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Places</p>
              )}
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(row)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-sm", i === active && "bg-accent")}
              >
                {row.spot ? (
                  <>
                    <span className="grid size-6 shrink-0 place-items-center rounded-full text-xs" style={{ background: severityColor(row.spot.severity) }} aria-hidden>
                      {CATEGORIES[row.spot.category].emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        <Highlight text={row.spot.title} term={term} />
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <Highlight text={row.spot.area || CATEGORIES[row.spot.category].label} term={term} /> · severity {row.spot.severity}/5
                      </span>
                    </span>
                  </>
                ) : (
                  row.place && (
                    <>
                      <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{row.place.name}</span>
                        {row.place.detail && <span className="block truncate text-xs text-muted-foreground">{row.place.detail}</span>}
                        {row.place.nearby.length > 0 ? (
                          <span className="mt-0.5 flex items-start gap-1 text-xs font-medium text-destructive">
                            <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" />
                            <span className="line-clamp-2">
                              {row.place.nearby.length} danger spot{row.place.nearby.length > 1 ? "s" : ""} nearby: {row.place.nearby[0].title}{" "}
                              ({formatDistance(row.place.nearby[0].distance_m)})
                            </span>
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-xs text-muted-foreground">No reported spots within 2 km</span>
                        )}
                      </span>
                    </>
                  )
                )}
              </button>
            </div>
          ))}
          {loadingPlaces && (
            <p className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" /> Looking up places…
            </p>
          )}
          {notice && <p className="px-2 py-1.5 text-xs text-muted-foreground">{notice}</p>}
        </div>
      )}
    </div>
  )
}
