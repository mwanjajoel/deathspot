import { BadgeCheckIcon, CheckIcon, EyeOffIcon, FlagOffIcon, PencilIcon, SettingsIcon, ShieldAlertIcon, Trash2Icon, UsersIcon } from "lucide-react"

type LogAction = { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }

/** How each moderation_log action reads in the activity feed. */
export const LOG_ACTIONS: Record<string, LogAction> = {
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

export const logAction = (action: string): LogAction => LOG_ACTIONS[action] ?? { label: action, icon: PencilIcon, tone: "bg-slate-500" }
