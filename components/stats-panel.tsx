"use client"

import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { CATEGORIES, severityColor, type Category } from "@/lib/categories"

type Stats = {
  byCategory: { category: Category; count: number }[]
  byArea: { area: string; count: number; max_severity: number }[]
  totals: { total: number; confirmed: number; unverified: number; this_week: number }
}

// Uganda Police Force Annual Crime Report 2025, as reported in the press (March 2026).
const NATIONAL = [
  { value: "4,328", label: "people murdered in 2025" },
  { value: "11", label: "murders per day on average" },
  { value: "950", label: "killed by mob action" },
  { value: "1,326", label: "killed in assaults" },
]

export function StatsPanel({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
  }, [refreshKey])

  const maxCat = Math.max(1, ...(stats?.byCategory.map((c) => c.count) ?? []))

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-3 gap-2">
        {stats ? (
          [
            [stats.totals.total, "spots mapped"],
            [stats.totals.confirmed, "confirmed"],
            [stats.totals.this_week, "new this week"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-lg border p-3">
              <div className="text-2xl font-bold tabular-nums">{v}</div>
              <div className="text-xs text-muted-foreground">{l}</div>
            </div>
          ))
        ) : (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Areas with the most reports</h3>
        <ol className="flex flex-col gap-1.5">
          {stats?.byArea.map((a, i) => (
            <li key={a.area} className="flex items-center gap-2 text-sm">
              <span className="w-4 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="size-2.5 rounded-full" style={{ background: severityColor(a.max_severity) }} />
              <span className="flex-1 truncate">{a.area}</span>
              <span className="tabular-nums text-muted-foreground">{a.count}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">What people report</h3>
        <div className="flex flex-col gap-2">
          {stats?.byCategory.map((c) => (
            <div key={c.category} className="flex items-center gap-2 text-sm">
              <span className="w-36 shrink-0 truncate">
                {CATEGORIES[c.category].emoji} {CATEGORIES[c.category].label}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${(c.count / maxCat) * 100}%`, background: CATEGORIES[c.category].color }} />
              </div>
              <span className="w-6 text-right tabular-nums text-muted-foreground">{c.count}</span>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      <section>
        <h3 className="mb-1 text-sm font-medium">National picture</h3>
        <p className="mb-3 text-xs text-muted-foreground">Uganda Police Annual Crime Report 2025</p>
        <div className="grid grid-cols-2 gap-2">
          {NATIONAL.map((n) => (
            <div key={n.label} className="rounded-lg bg-muted/60 p-3">
              <div className="text-xl font-bold text-primary tabular-nums">{n.value}</div>
              <div className="text-xs text-muted-foreground">{n.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Worst-hit districts for murders: Kyegegwa (67), Mubende and Kyenjojo (58 each), Rukungiri (54), Oyam (53). Sources:{" "}
          <a className="underline" href="https://allafrica.com/stories/202603310303.html" target="_blank" rel="noopener noreferrer">
            AllAfrica
          </a>
          ,{" "}
          <a className="underline" href="https://upf.go.ug/" target="_blank" rel="noopener noreferrer">
            Uganda Police Force
          </a>
          .
        </p>
      </section>
    </div>
  )
}
