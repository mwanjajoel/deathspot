"use client"

import { useActionState } from "react"
import { Loader2Icon } from "lucide-react"
import { signIn } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, null)
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="l-email">Email</Label>
        <Input id="l-email" name="email" type="email" autoComplete="username" required autoFocus className="h-11" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="l-pass">Password</Label>
        <Input id="l-pass" name="password" type="password" autoComplete="current-password" required className="h-11" />
      </div>
      {state && !state.ok && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Sign in
      </Button>
    </form>
  )
}
