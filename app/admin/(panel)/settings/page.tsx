import { listTeam } from "@/app/admin/actions"
import { PasswordForm } from "@/components/admin/password-form"
import { SettingsForm } from "@/components/admin/settings-form"
import { TeamManager } from "@/components/admin/team-manager"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getSettings, requireModerator } from "@/lib/admin"

export default async function SettingsPage() {
  const me = await requireModerator()
  const isAdmin = me.role === "admin"
  const [settings, team] = await Promise.all([getSettings(), isAdmin ? listTeam() : Promise.resolve([])])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Signed in as {me.email}</p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Moderation rules</CardTitle>
            <CardDescription>How new reports and public flags are handled.</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsForm initial={settings} />
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
            <CardDescription>People who can sign in to this panel.</CardDescription>
          </CardHeader>
          <CardContent>
            <TeamManager team={team} meId={me.id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
