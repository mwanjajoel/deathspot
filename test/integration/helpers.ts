import { randomBytes } from "node:crypto"
import { Client } from "pg"
import { vi } from "vitest"

/** Every row a test creates is titled with this prefix, so cleanup can find it. */
export const T = "[test]"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

/** OSRM route from Kalerwe to Nansana that passes both mapped spots. */
export const KALERWE_TO_NANSANA = {
  code: "Ok",
  routes: [
    {
      distance: 7350,
      duration: 540,
      geometry: {
        coordinates: [
          [32.57195, 0.34918],
          [32.555, 0.355],
          [32.529, 0.3658],
        ],
      },
    },
    {
      distance: 9000,
      duration: 700,
      geometry: {
        coordinates: [
          [32.57195, 0.34918],
          [32.6, 0.4],
          [32.529, 0.3658],
        ],
      },
    },
  ],
}

export const external = {
  osrm: vi.fn<(url: string) => Promise<Response>>(async () => json(KALERWE_TO_NANSANA)),
  nominatim: vi.fn<(url: string) => Promise<Response>>(async () => json([])),
  reset() {
    external.osrm.mockReset().mockImplementation(async () => json(KALERWE_TO_NANSANA))
    external.nominatim.mockReset().mockImplementation(async () => json([]))
  },
  json,
}

/** A distinct anonymous visitor: its own IP and user agent, so votes and limits don't collide. */
export function visitor() {
  const ip = `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250) + 1).join(".")}`
  const ua = `vitest-${randomBytes(6).toString("hex")}`
  return {
    ip,
    ua,
    headers: { "x-forwarded-for": ip, "user-agent": ua },
    get(path: string) {
      return new Request(`http://localhost:3000${path}`, { headers: this.headers })
    },
    post(path: string, body: unknown) {
      return new Request(`http://localhost:3000${path}`, {
        method: "POST",
        headers: { ...this.headers, "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      })
    },
  }
}

export const params = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) })

let pg: Client | null = null
export async function sql<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
  if (!pg) {
    pg = new Client({ connectionString: process.env.DATABASE_URL })
    await pg.connect()
  }
  return (await pg.query(text, values)).rows as T[]
}

export async function setSetting(key: string, value: unknown) {
  await sql("update public.settings set value = $2::jsonb where key = $1", [key, JSON.stringify(value)])
}

export const spot = (patch: Record<string, unknown> = {}) => ({
  title: `${T} Boda gang at the junction`,
  lat: 0.3491,
  lng: 32.5719,
  area: `${T} Kalerwe`,
  category: "boda_gang",
  severity: 4,
  time_of_day: "night",
  ...patch,
})

export async function cleanup() {
  if (!pg) return
  await sql(`delete from public.moderation_log where spot_title like '${T}%' or note like '%@deathspot.test%'`)
  await sql(`delete from public.spots where title like '${T}%'`)
  await sql(`delete from public.geocode_cache where query like 'test %'`)
  await sql(`delete from auth.users where email like '%@deathspot.test'`)
  await setSetting("require_approval", false)
  await setSetting("auto_hide_flag_threshold", 3)
  await pg.end()
  pg = null
}
