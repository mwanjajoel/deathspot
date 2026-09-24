"use client"

import { useState } from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { FLAG_REASONS, type FlagReason } from "@/lib/categories"
import { cn } from "@/lib/utils"

/** Lets the public report a problem with a spot. Enough flags hide it until a moderator reviews. */
export function FlagForm({ spotId, onDone }: { spotId: number; onDone: (hidden: boolean) => void }) {
  const [reason, setReason] = useState<FlagReason | null>(null)
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)

  const submit = async () => {
    if (!reason) return
    setSending(true)
    try {
      const res = await fetch(`/api/spots/${spotId}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(
        data.result === "hidden"
          ? "Thanks. This spot is now hidden until a moderator reviews it."
          : "Thanks. Moderators will review this spot.",
      )
      onDone(data.result === "hidden")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send report")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="What's wrong?">
        {(Object.entries(FLAG_REASONS) as [FlagReason, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={reason === k}
            onClick={() => setReason(k)}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg border px-3 text-left text-sm transition-colors hover:bg-accent",
              reason === k && "border-primary bg-primary/10",
            )}
          >
            <span className={cn("size-4 shrink-0 rounded-full border-2", reason === k ? "border-primary bg-primary" : "border-muted-foreground/40")} />
            {label}
          </button>
        ))}
      </div>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder="Anything moderators should know? (optional)" />
      <Button onClick={submit} disabled={!reason || sending} className="h-11">
        {sending && <Loader2Icon className="animate-spin" />}
        Send to moderators
      </Button>
    </div>
  )
}
