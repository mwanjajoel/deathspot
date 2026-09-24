import { Suspense } from "react"
import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { SpotCard } from "@/components/admin/spot-card"
import { SpotFilters } from "@/components/admin/spot-filters"
import { Button } from "@/components/ui/button"
import { PAGE_SIZE, searchSpots } from "@/lib/admin"

type Search = { q?: string; status?: string; category?: string; page?: string }

export default async function SpotsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams
  const { spots, total, page } = await searchSpots({
    q: sp.q,
    moderation: sp.status,
    category: sp.category,
    page: Number(sp.page) || 1,
  })
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const href = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][])
    next.set("page", String(p))
    return `/admin/spots?${next}`
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">All spots</h1>
        <p className="text-sm text-muted-foreground">
          {total} spot{total === 1 ? "" : "s"} match. Edit, hide, restore or verify any of them.
        </p>
      </div>

      <Suspense>
        <SpotFilters />
      </Suspense>

      {spots.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No spots match these filters.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {spots.map((s) => (
            <SpotCard key={s.id} spot={s} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-2" aria-label="Pagination">
          <Button variant="outline" asChild disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : undefined}>
            <Link href={href(page - 1)}>
              <ChevronLeftIcon /> Previous
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            Page {page} of {pages}
          </span>
          <Button variant="outline" asChild className={page >= pages ? "pointer-events-none opacity-50" : undefined}>
            <Link href={href(page + 1)}>
              Next <ChevronRightIcon />
            </Link>
          </Button>
        </nav>
      )}
    </div>
  )
}
