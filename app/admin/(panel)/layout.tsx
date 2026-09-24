import type { Metadata } from "next"
import Link from "next/link"
import { LogOutIcon, MapIcon, ShieldIcon, SkullIcon } from "lucide-react"
import { signOut } from "@/app/admin/actions"
import { AdminBottomNav, AdminTopNav } from "@/components/admin/admin-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getCounts, requireModerator } from "@/lib/admin"

export const metadata: Metadata = { title: "Moderation · Deathspot UG", robots: { index: false } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireModerator()
  const counts = await getCounts()
  const queueCount = counts.pending + counts.flagged

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Link href="/admin" className="flex items-center gap-2 font-bold">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <SkullIcon className="size-4" />
            </span>
            <span className="hidden sm:inline">
              Deathspot<span className="text-primary">UG</span>
            </span>
            <Badge variant="secondary" className="gap-1">
              <ShieldIcon /> {me.role === "admin" ? "Admin" : "Moderator"}
            </Badge>
          </Link>
          <div className="flex-1" />
          <AdminTopNav queueCount={queueCount} />
          <div className="flex-1 md:flex-none" />
          <Button variant="ghost" size="icon" asChild aria-label="Open public map">
            <Link href="/">
              <MapIcon />
            </Link>
          </Button>
          <form action={signOut}>
            <Button variant="ghost" size="icon" type="submit" aria-label={`Sign out ${me.email}`} title={`Sign out ${me.email}`}>
              <LogOutIcon />
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:py-6">{children}</main>
      <AdminBottomNav queueCount={queueCount} />
    </div>
  )
}
