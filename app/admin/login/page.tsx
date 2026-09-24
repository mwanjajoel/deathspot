import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SkullIcon } from "lucide-react"
import { LoginForm } from "@/components/admin/login-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getModerator } from "@/lib/admin"

export const metadata: Metadata = { title: "Moderator sign in · Deathspot UG", robots: { index: false } }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getModerator()) redirect("/admin")
  const { next } = await searchParams
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mx-auto mb-2 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <SkullIcon className="size-6" />
          </span>
          <CardTitle className="text-xl">Moderator sign in</CardTitle>
          <CardDescription>Deathspot UG admin panel</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Accounts are created by an admin.{" "}
            <Link href="/" className="underline">
              Back to the map
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
