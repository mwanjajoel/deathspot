"use client"

import { useActionState, useEffect, useRef, useTransition } from "react"
import { Loader2Icon, UserPlusIcon } from "lucide-react"
import { toast } from "sonner"
import { addMember, setMemberRole, type TeamMember } from "@/app/admin/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { timeAgo } from "@/lib/utils"

export function TeamManager({ team, meId }: { team: TeamMember[]; meId: string }) {
  const [state, action, adding] = useActionState(addMember, null)
  const [pending, start] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!state) return
    if (state.ok) {
      toast.success(state.message)
      formRef.current?.reset()
    } else toast.error(state.error)
  }, [state])

  const change = (id: string, role: string) =>
    start(async () => {
      if (role === "none" && !confirm("Remove this person's access? Their account will be deleted.")) return
      const res = await setMemberRole(id, role as "admin" | "moderator" | "none")
      if (res.ok) toast.success(res.message)
      else toast.error(res.error)
    })

  return (
    <div className="flex flex-col gap-5">
      <ul className="divide-y rounded-lg border">
        {team.map((m) => (
          <li key={m.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{m.email}</span>
                {m.id === meId && <Badge variant="secondary">You</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">Last sign-in {timeAgo(m.lastSignIn)}</div>
            </div>
            {m.id === meId ? (
              <Badge variant="outline" className="self-start capitalize sm:self-auto">
                {m.role}
              </Badge>
            ) : (
              <Select value={m.role} onValueChange={(v) => change(m.id, v)} disabled={pending}>
                <SelectTrigger className="w-full sm:w-40" aria-label={`Role for ${m.email}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="moderator">Moderator</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="none" className="text-destructive">
                    Remove access
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </li>
        ))}
      </ul>

      <form ref={formRef} action={action} className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserPlusIcon className="size-4" /> Add a team member
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-email">Email</Label>
            <Input id="t-email" name="email" type="email" required autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-pass">Temporary password</Label>
            <Input id="t-pass" name="password" type="text" required minLength={10} autoComplete="off" />
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <Select name="role" defaultValue="moderator">
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="moderator">Moderator</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={adding}>
            {adding && <Loader2Icon className="animate-spin" />}
            Add member
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Share the password privately. They should change it under Settings after their first sign-in. Moderators review reports; admins also manage settings and the team.
        </p>
      </form>
    </div>
  )
}
