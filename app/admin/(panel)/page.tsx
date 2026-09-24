import { CheckCircle2Icon, ClockIcon, FlagIcon, GlobeIcon, SparklesIcon } from "lucide-react"
import { SpotCard } from "@/components/admin/spot-card"
import { Card, CardContent } from "@/components/ui/card"
import { getCounts, getQueue, getSettings } from "@/lib/admin"

export default async function QueuePage() {
  const [queue, counts, settings] = await Promise.all([getQueue(), getCounts(), getSettings()])

  const stats = [
    { label: "Awaiting review", value: counts.pending, icon: ClockIcon, tone: "text-amber-600" },
    { label: "Flagged by public", value: counts.flagged, icon: FlagIcon, tone: "text-destructive" },
    { label: "New in 24 h", value: counts.today, icon: SparklesIcon, tone: "text-blue-600" },
    { label: "Live on map", value: counts.live, icon: GlobeIcon, tone: "text-emerald-600" },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Review queue</h1>
        <p className="text-sm text-muted-foreground">
          {settings.requireApproval
            ? "New reports wait here until a moderator approves them."
            : "New reports go live immediately. Flagged spots and anything held for review appear here."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="gap-0 py-0">
            <CardContent className="flex items-center gap-3 p-4">
              <Icon className={`size-5 shrink-0 ${tone}`} />
              <div>
                <div className="text-2xl leading-none font-bold tabular-nums">{value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {queue.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2Icon className="size-10 text-emerald-600" />
            <div className="font-semibold">All caught up</div>
            <p className="max-w-sm text-sm text-muted-foreground">Nothing is waiting for review. New reports and flags will show up here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {queue.map((s) => (
            <SpotCard key={s.id} spot={s} flags={s.flags} />
          ))}
        </div>
      )}
    </div>
  )
}
