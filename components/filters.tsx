"use client"

import { SlidersHorizontalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CATEGORIES, CATEGORY_KEYS, type Category, type Spot } from "@/lib/categories"

export type Filters = {
  categories: Category[]
  showUnverified: boolean
  showDisputed: boolean
  nightOnly: boolean
  recency: "all" | "30" | "7"
}

export const DEFAULT_FILTERS: Filters = {
  categories: [...CATEGORY_KEYS],
  showUnverified: true,
  showDisputed: false,
  nightOnly: false,
  recency: "all",
}

export function applyFilters(spots: Spot[], f: Filters) {
  const cutoff = f.recency === "all" ? 0 : Date.now() - Number(f.recency) * 86400000
  return spots.filter(
    (s) =>
      f.categories.includes(s.category) &&
      (f.showUnverified || s.status !== "unverified") &&
      (f.showDisputed || s.status !== "disputed") &&
      (!f.nightOnly || s.time_of_day !== "day") &&
      (!cutoff || new Date(s.last_confirmed_at ?? s.created_at).getTime() >= cutoff),
  )
}

export function activeFilterCount(f: Filters) {
  return (
    (f.categories.length !== CATEGORY_KEYS.length ? 1 : 0) +
    (f.showUnverified ? 0 : 1) +
    (f.showDisputed ? 1 : 0) +
    (f.nightOnly ? 1 : 0) +
    (f.recency !== "all" ? 1 : 0)
  )
}

export function FiltersPopover({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const count = activeFilterCount(value)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon-lg" variant="ghost" aria-label="Filters" className="relative">
          <SlidersHorizontalIcon />
          {count > 0 && <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[1100] w-[min(92vw,22rem)]">
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2 text-sm font-medium">Show</div>
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              value={value.categories}
              onValueChange={(v) => onChange({ ...value, categories: v as Category[] })}
              className="flex flex-wrap justify-start"
              spacing={1}
            >
              {CATEGORY_KEYS.map((k) => (
                <ToggleGroupItem key={k} value={k} className="text-xs">
                  {CATEGORIES[k].emoji} {CATEGORIES[k].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <Separator />
          <div className="flex flex-col gap-3">
            {(
              [
                ["showUnverified", "Include unverified reports"],
                ["showDisputed", "Include disputed reports"],
                ["nightOnly", "Only dangerous at night"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <Label htmlFor={`f-${key}`} className="font-normal">
                  {label}
                </Label>
                <Switch id={`f-${key}`} checked={value[key]} onCheckedChange={(c) => onChange({ ...value, [key]: c })} />
              </div>
            ))}
          </div>
          <Separator />
          <div>
            <div className="mb-2 text-sm font-medium">Active within</div>
            <ToggleGroup type="single" variant="outline" size="sm" value={value.recency} onValueChange={(v) => v && onChange({ ...value, recency: v as Filters["recency"] })} className="w-full">
              <ToggleGroupItem value="7" className="flex-1">7 days</ToggleGroupItem>
              <ToggleGroupItem value="30" className="flex-1">30 days</ToggleGroupItem>
              <ToggleGroupItem value="all" className="flex-1">All time</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {count > 0 && (
            <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_FILTERS)}>
              Reset filters
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
