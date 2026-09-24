import "server-only"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { Client } from "pg"
import { serviceClient } from "@/lib/supabase/server"

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations")
const SEED_PATH = path.join(process.cwd(), "data", "seed.json")

const log = (...args: unknown[]) => console.log("[bootstrap]", ...args)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function connect(url: string) {
  for (let attempt = 1; ; attempt++) {
    const client = new Client({ connectionString: url })
    try {
      await client.connect()
      return client
    } catch (e) {
      await client.end().catch(() => {})
      if (attempt >= 30) throw e
      log(`database not ready (${(e as Error).message}); retrying…`)
      await sleep(2000)
    }
  }
}

/** Applies supabase/migrations/*.sql in name order, each once, in a transaction. */
async function migrate(db: Client) {
  await db.query(`create table if not exists public.deathspot_migrations (
    name text primary key, applied_at timestamptz not null default now())`)
  // Keep the bookkeeping table out of the public API.
  await db.query("alter table public.deathspot_migrations enable row level security")
  // Two app replicas starting together must not race.
  await db.query("select pg_advisory_lock(424242)")
  try {
    const done = new Set((await db.query("select name from public.deathspot_migrations")).rows.map((r) => r.name))
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort()
    for (const file of files) {
      if (done.has(file)) continue
      log(`applying ${file}`)
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8")
      await db.query("begin")
      try {
        await db.query(sql)
        await db.query("insert into public.deathspot_migrations (name) values ($1)", [file])
        await db.query("commit")
      } catch (e) {
        await db.query("rollback")
        throw new Error(`migration ${file} failed: ${(e as Error).message}`)
      }
    }
    // PostgREST caches the schema; tell it to reload after changes.
    await db.query("notify pgrst, 'reload schema'")
  } finally {
    await db.query("select pg_advisory_unlock(424242)")
  }
}

type SeedSpot = {
  title: string
  description?: string
  lat: number
  lng: number
  area?: string
  category: string
  severity: number
  time_of_day?: string
  incident_date?: string
  source_url?: string
}

/** Loads data/seed.json once. A 'seeded_at' setting prevents re-seeding after moderators delete spots. */
async function seed(db: Client) {
  const { rowCount } = await db.query("select 1 from public.settings where key = 'seeded_at'")
  if (rowCount) return
  const { spots } = JSON.parse(await readFile(SEED_PATH, "utf8")) as { spots: SeedSpot[] }
  await db.query("begin")
  try {
    for (const s of spots) {
      await db.query(
        `insert into public.spots (title, description, lat, lng, area, category, severity, time_of_day,
          incident_date, source_url, confirmations, status, seeded, last_confirmed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 3, 'confirmed', true, now())`,
        [s.title, s.description ?? "", s.lat, s.lng, s.area ?? "", s.category, s.severity, s.time_of_day ?? "any",
          s.incident_date ?? null, s.source_url ?? null],
      )
    }
    await db.query("insert into public.settings (key, value) values ('seeded_at', to_jsonb(now()))")
    await db.query("commit")
    log(`seeded ${spots.length} spots from data/seed.json`)
  } catch (e) {
    await db.query("rollback")
    throw e
  }
}

/** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if nobody holds the admin role yet. */
async function ensureAdmin(db: Client) {
  const email = process.env.ADMIN_EMAIL?.trim()
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) return
  const { rowCount } = await db.query(
    "select 1 from auth.users where raw_app_meta_data ->> 'role' = 'admin' and deleted_at is null limit 1",
  )
  if (rowCount) return

  const supabase = serviceClient()
  for (let attempt = 1; ; attempt++) {
    const { error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "admin" },
      user_metadata: { name: "Admin" },
    })
    if (!error) {
      log(`created admin ${email}`)
      return
    }
    if (/already been registered|already exists/i.test(error.message)) {
      // Existing account (e.g. a former moderator): promote it.
      const { data } = await db.query("select id from auth.users where lower(email) = lower($1)", [email]).then((r) => ({ data: r.rows[0] }))
      if (data) await supabase.auth.admin.updateUserById(data.id, { app_metadata: { role: "admin" } })
      log(`promoted existing user ${email} to admin`)
      return
    }
    if (attempt >= 20) throw error
    log(`auth not ready (${error.message}); retrying…`)
    await sleep(3000)
  }
}

let started: Promise<void> | null = null

export function bootstrap() {
  return (started ??= (async () => {
    const url = process.env.DATABASE_URL
    if (!url) {
      log("DATABASE_URL not set; skipping migrations and seeding")
      return
    }
    const db = await connect(url)
    try {
      await migrate(db)
      await seed(db)
      await ensureAdmin(db)
      log("ready")
    } finally {
      await db.end()
    }
  })())
}

/** Called once when the server starts (instrumentation.ts). */
export async function startup() {
  try {
    await bootstrap()
  } catch (e) {
    console.error("[bootstrap] failed:", e)
    // In a container, exit so Docker restarts us once the database is reachable.
    if (process.env.NODE_ENV === "production") process.exit(1)
  }
}
