"use client"

import { useState, useTransition } from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { saveSettings } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function SettingsForm({ initial }: { initial: { requireApproval: boolean; autoHideThreshold: number } }) {
  const [requireApproval, setRequireApproval] = useState(initial.requireApproval)
  const [threshold, setThreshold] = useState(String(initial.autoHideThreshold))
  const [pending, start] = useTransition()
  const dirty = requireApproval !== initial.requireApproval || Number(threshold) !== initial.autoHideThreshold

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await saveSettings({ requireApproval, autoHideThreshold: Number(threshold) })
          if (res.ok) toast.success(res.message)
          else toast.error(res.error)
        })
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="s-approval" className="text-sm font-medium">
            Hold new reports for review
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Off: reports go live instantly, marked unverified, which gets warnings out fastest. On: nothing appears until a moderator approves it.
          </p>
        </div>
        <Switch id="s-approval" checked={requireApproval} onCheckedChange={setRequireApproval} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="s-threshold">Auto-hide after this many flags</Label>
        <Input id="s-threshold" type="number" inputMode="numeric" min={0} max={50} value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-28" />
        <p className="text-sm text-muted-foreground">Flagged spots leave the map until reviewed. Moderator-verified spots are never auto-hidden. Set to 0 to disable.</p>
      </div>
      <Button type="submit" disabled={!dirty || pending} className="self-start">
        {pending && <Loader2Icon className="animate-spin" />}
        Save settings
      </Button>
    </form>
  )
}
