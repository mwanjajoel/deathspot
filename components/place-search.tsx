"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2Icon, MapPinIcon, SearchIcon, XIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Place } from "@/lib/types"

type Props = {
  placeholder?: string
  value?: string
  onSelect: (place: Place) => void
  onClear?: () => void
  className?: string
  inputClassName?: string
  autoFocus?: boolean
}

export function PlaceSearch({ placeholder = "Search a place in Uganda", value, onSelect, onClear, className, inputClassName, autoFocus }: Props) {
  const [q, setQ] = useState(value ?? "")
  const [prevValue, setPrevValue] = useState(value)
  const [results, setResults] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inflight = useRef<AbortController>(undefined)

  // Let the parent set the text (e.g. "My location") without triggering a search.
  if (value !== prevValue) {
    setPrevValue(value)
    setQ(value ?? "")
  }

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      inflight.current?.abort()
    },
    [],
  )

  const search = (text: string) => {
    setQ(text)
    clearTimeout(timer.current)
    inflight.current?.abort()
    const term = text.trim()
    if (term.length < 3) {
      setResults([])
      setOpen(false)
      return
    }
    // Debounce: Nominatim allows about one request per second.
    timer.current = setTimeout(async () => {
      const ctrl = (inflight.current = new AbortController())
      setLoading(true)
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const data = await res.json()
        setResults(data.places ?? [])
        setActive(0)
        setOpen(true)
      } catch {
        /* aborted or offline */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 450)
  }

  const choose = (p: Place) => {
    setQ(p.name)
    setOpen(false)
    onSelect(p)
  }

  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => search(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !results.length) return
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive((a) => (a + 1) % results.length)
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive((a) => (a - 1 + results.length) % results.length)
          } else if (e.key === "Enter") {
            e.preventDefault()
            choose(results[active])
          } else if (e.key === "Escape") setOpen(false)
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        role="combobox"
        aria-expanded={open}
        className={cn("pr-9 pl-9", inputClassName)}
      />
      <div className="absolute top-1/2 right-2 -translate-y-1/2">
        {loading ? (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
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
      {open && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-[1100] mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
          {results.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">No places found</li>
          ) : (
            results.map((p, i) => (
              <li key={`${p.lat},${p.lng},${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(p)}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm", i === active && "bg-accent")}
                >
                  <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    {p.detail && <span className="block truncate text-xs text-muted-foreground">{p.detail}</span>}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
