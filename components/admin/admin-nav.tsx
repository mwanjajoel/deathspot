"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { HistoryIcon, InboxIcon, ListIcon, SettingsIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/admin", label: "Queue", icon: InboxIcon },
  { href: "/admin/spots", label: "All spots", icon: ListIcon },
  { href: "/admin/activity", label: "Activity", icon: HistoryIcon },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
]

function useActive() {
  const path = usePathname()
  return (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href))
}

function Count({ n, className }: { n: number; className?: string }) {
  if (!n) return null
  return (
    <span className={cn("grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] leading-5 font-bold text-primary-foreground tabular-nums", className)}>
      {n > 99 ? "99+" : n}
    </span>
  )
}

/** Horizontal tabs in the header on tablets and desktops. */
export function AdminTopNav({ queueCount }: { queueCount: number }) {
  const active = useActive()
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Admin">
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active(href) ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            active(href) && "bg-muted text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
          {href === "/admin" && <Count n={queueCount} />}
        </Link>
      ))}
    </nav>
  )
}

/** Thumb-reachable tab bar on phones. */
export function AdminBottomNav({ queueCount }: { queueCount: number }) {
  const active = useActive()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Admin"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active(href) ? "page" : undefined}
          className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground", active(href) && "text-primary")}
        >
          <span className="relative">
            <Icon className="size-5" />
            {href === "/admin" && <Count n={queueCount} className="absolute -top-2 -right-3" />}
          </span>
          {label}
        </Link>
      ))}
    </nav>
  )
}
