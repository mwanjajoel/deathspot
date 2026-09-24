import Link from "next/link"
import { BadgeCheckIcon, CheckIcon, EyeOffIcon, FlagOffIcon, PencilIcon, SettingsIcon, ShieldAlertIcon, Trash2Icon, UsersIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { getLog } from "@/lib/admin"
import { timeAgo } from "@/lib/utils"

const ACTIONS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  approve: { label: "approved", icon: CheckIcon, tone: "bg-emerald-600" },
  reject: { label: "hid", icon: EyeOffIcon, tone: "bg-slate-500" },
  verify: { label: "verified", icon: BadgeCheckIcon, tone: "bg-blue-600" },
  unverify: { label: "removed verification from", icon: BadgeCheckIcon, tone: "bg-slate-500" },
  dismiss_flags: { label: "dismissed flags on", icon: FlagOffIcon, tone: "bg-amber-600" },
  edit: { label: "edited", icon: PencilIcon, tone: "bg-violet-600" },
  delete: { label: "deleted", icon: Trash2Icon, tone: "bg-red-700" },
  auto_hidden: { label: "Auto-hidden after flags:", icon: ShieldAlertIcon, tone: "bg-red-600" },
  setting: { label: "changed a setting", icon: SettingsIcon, tone: "bg-slate-600" },
  team: { label: "updated the team", icon: UsersIcon, tone: "bg-slate-600" },
}

export default async function ActivityPage() {
  const log = await getLog(150)
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">Every moderation action is recorded here for accountability.</p>
      </div>
      <Card className="py-0">
        <CardContent className="p-0">
          {log.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ol className="divide-y">
              {log.map((e) => {
                const a = ACTIONS[e.action] ?? { label: e.action, icon: PencilIcon, tone: "bg-slate-500" }
                const Icon = a.icon
                const who = e.actor_email ?? (e.action === "auto_hidden" ? "" : "System")
                return (
                  <li key={e.id} className="flex gap-3 p-4">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-full text-white ${a.tone}`}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="break-words">
                        {who && <span className="font-medium">{who} </span>}
                        {a.label}{" "}
                        {e.spot_title &&
                          (e.spot_id && e.action !== "delete" ? (
                            <Link href={`/admin/spots?q=${encodeURIComponent(e.spot_title)}`} className="font-medium text-primary hover:underline">
                              {e.spot_title}
                            </Link>
                          ) : (
                            <span className="font-medium">{e.spot_title}</span>
                          ))}
                      </p>
                      {e.note && <p className="mt-0.5 break-words text-muted-foreground">{e.note}</p>}
                      <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(e.created_at)}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
