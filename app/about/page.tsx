import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeftIcon, HeartHandshakeIcon, MapPinnedIcon, ShieldAlertIcon, SkullIcon, UsersIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { EMERGENCY_CONTACTS } from "@/lib/categories"

export const metadata: Metadata = {
  title: "About · Deathspot UG",
}

const SOURCES = [
  { label: "@TonyNatif on X: hotspot list after the killing of Moses Matovu (Sept 2026)", href: "https://x.com/TonyNatif/status/2102998432218534245" },
  { label: "AllAfrica / Daily Monitor: Crime Report 2025, 25 Ugandans killed daily", href: "https://allafrica.com/stories/202603310303.html" },
  { label: "UG Mirror: police name Kampala Metropolitan crime hotspots (Feb 2026)", href: "https://ugmirror.com/index.php/2026/02/17/crime-wave-rocks-kampala-metropolitan-area-as-police-name-hotspots-arrest-over-250-suspects/" },
  { label: "AllAfrica: police crackdown on Kampala crime hotspots (Jan 2026)", href: "https://allafrica.com/stories/202601130514.html" },
  { label: "The Observer: police report names Uganda's top crimes", href: "https://observer.ug/news/police-report-unmasks-ugandas-7-top-crimes/" },
  { label: "Uganda Police Force: Annual Crime Reports", href: "https://upf.go.ug/" },
]

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2">
        <Link href="/">
          <ArrowLeftIcon /> Back to map
        </Link>
      </Button>

      <div className="mb-8 flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
          <SkullIcon className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Deathspot<span className="text-primary">UG</span>
          </h1>
          <p className="text-sm text-muted-foreground">A community danger map for Uganda</p>
        </div>
      </div>

      <section className="space-y-4 text-[15px] leading-relaxed">
        <p>
          Uganda Police recorded <strong>4,328 murders in 2025</strong>, about 11 every day. Many happen in the same places again and again: dark junctions, boda stages where gangs wait, stretches of road
          with no patrols. The people who live nearby know these places. Visitors and new residents usually don&apos;t.
        </p>
        <p>
          Deathspot UG is a <strong>community-led, open-source</strong> initiative. It works like Waze, but for danger. Anyone can pin a place where people have been attacked or killed, and everyone else can confirm the
          spot is still dangerous or report that it has improved. Before you travel, check your route and choose the safer way.
        </p>
      </section>

      <div className="my-8 grid gap-3 sm:grid-cols-3">
        {[
          { icon: MapPinnedIcon, title: "Report", body: "Tap Report, drop a pin, and say what happened. No account needed." },
          { icon: UsersIcon, title: "Confirm", body: "Three “still dangerous” votes turn a report community confirmed." },
          { icon: ShieldAlertIcon, title: "Avoid", body: "Check routes and turn on nearby alerts while you move." },
        ].map(({ icon: Icon, title, body }) => (
          <Card key={title} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="size-4 text-primary" /> {title}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{body}</CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-8 border-amber-500/40 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartHandshakeIcon className="size-4" /> Community rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>
              <strong>Report places, never people.</strong> Don&apos;t name, describe, or accuse anyone. Phone numbers are removed automatically.
            </li>
            <li>Only report what you saw or what was credibly reported. Add a news or police link when you can.</li>
            <li>Reports are community submitted and may be wrong. Use them as a warning, not as proof.</li>
            <li>
              Volunteer moderators review new and flagged reports, remove anything that breaks these rules, and can mark spots <strong>verified</strong>. Use{" "}
              <em>Report a problem</em> on any spot to alert them.
            </li>
            <li>This map doesn&apos;t replace the police. Always report crimes to them as well.</li>
          </ul>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Emergency contacts</h2>
      <div className="mb-8 grid gap-2 sm:grid-cols-2">
        {EMERGENCY_CONTACTS.map((c) => (
          <a key={c.number} href={c.href} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-accent">
            <span>{c.label}</span>
            <span className="font-mono font-semibold whitespace-nowrap">{c.number}</span>
          </a>
        ))}
      </div>

      <Separator className="my-8" />

      <h2 className="mb-3 text-lg font-semibold">Sources for the starting data</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        The map was seeded with areas named publicly by residents and in police statements. Pins mark approximate areas, not exact addresses.
      </p>
      <ul className="space-y-2 text-sm">
        {SOURCES.map((s) => (
          <li key={s.href}>
            <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
              {s.label}
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-xs text-muted-foreground">
        Map data © OpenStreetMap contributors. Place search by Nominatim, routing by OSRM. Moderators can{" "}
        <Link href="/admin" className="underline">
          sign in here
        </Link>
        .
      </p>
    </main>
  )
}
