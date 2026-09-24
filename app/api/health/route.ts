import { anonClient } from "@/lib/supabase/server"

export async function GET() {
  const { error } = await anonClient().from("settings").select("key").limit(1)
  return error
    ? Response.json({ ok: false, error: error.message }, { status: 503 })
    : Response.json({ ok: true })
}
