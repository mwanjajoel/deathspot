import "server-only"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

function env(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing environment variable ${name}. Run \`pnpm setup:env\` or check docker-compose.yml.`)
  return v
}

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }

const g = globalThis as unknown as { deathspotService?: SupabaseClient; deathspotAnon?: SupabaseClient }

/** Full access; bypasses RLS. Only for server code that has already validated its input. */
export function serviceClient() {
  return (g.deathspotService ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), NO_SESSION))
}

/** Public, RLS-restricted access: sees only approved spots and public columns. */
export function anonClient() {
  return (g.deathspotAnon ??= createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), NO_SESSION))
}

/** Acts as the signed-in moderator (session in cookies); RLS and is_moderator() apply. */
export async function userClient() {
  const cookieStore = await cookies()
  return createServerClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
        } catch {
          // Called from a Server Component: cookies are read-only there; proxy.ts refreshes them.
        }
      },
    },
  })
}
