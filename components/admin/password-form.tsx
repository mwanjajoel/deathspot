"use client"

import { useActionState, useEffect, useRef } from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { changePassword } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (!state) return
    if (state.ok) {
      toast.success(state.message)
      ref.current?.reset()
    } else toast.error(state.error)
  }, [state])

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="p-new">New password</Label>
        <Input id="p-new" name="password" type="password" required minLength={10} autoComplete="new-password" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="p-confirm">Confirm</Label>
        <Input id="p-confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Update
      </Button>
    </form>
  )
}
