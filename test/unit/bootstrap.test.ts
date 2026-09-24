import { readdirSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Handler = (sql: string, params?: unknown[]) => { rows?: unknown[]; rowCount?: number } | Error | undefined

const state = {
  connectFailures: 0,
  handler: (() => undefined) as Handler,
  queries: [] as string[],
  ended: 0,
}

vi.mock("pg", () => ({
  Client: class {
    failed = false
    async connect() {
      if (state.connectFailures > 0) {
        state.connectFailures--
        this.failed = true
        throw new Error("ECONNREFUSED")
      }
    }
    async query(sql: string, params?: unknown[]) {
      state.queries.push(sql)
      const r = state.handler(sql, params)
      if (r instanceof Error) throw r
      return { rows: [], rowCount: 0, ...r }
    }
    async end() {
      state.ended++
      // pg rejects end() on a client that never connected; bootstrap must ignore that.
      if (this.failed) throw new Error("Client was never connected")
    }
  },
}))

const auth = { createUser: vi.fn(), updateUserById: vi.fn() }

// Lets one test supply a seed file where optional fields are left out.
const seedOverride = { json: null as string | null }
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>()
  return {
    ...fs,
    readFile: (async (file: string, enc: BufferEncoding) =>
      seedOverride.json && String(file).endsWith("seed.json") ? seedOverride.json : fs.readFile(file, enc)) as typeof fs.readFile,
  }
})
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => ({ auth: { admin: auth } }) }))

const migrations = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()
const fast = { attempts: 3, delayMs: 0 }

let bootstrapModule: typeof import("@/lib/bootstrap")
beforeEach(async () => {
  vi.resetModules()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  Object.assign(state, { connectFailures: 0, handler: () => undefined, queries: [], ended: 0 })
  auth.createUser.mockReset().mockResolvedValue({ error: null })
  auth.updateUserById.mockReset().mockResolvedValue({ error: null })
  vi.stubEnv("DATABASE_URL", "postgres://test")
  vi.stubEnv("ADMIN_EMAIL", "")
  vi.stubEnv("ADMIN_PASSWORD", "")
  bootstrapModule = await import("@/lib/bootstrap")
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** A database where every migration and the seed are already applied. */
const upToDate: Handler = (sql) => {
  if (sql.includes("select name from public.deathspot_migrations")) return { rows: migrations.map((name) => ({ name })) }
  if (sql.includes("key = 'seeded_at'")) return { rowCount: 1 }
  return undefined
}

describe("bootstrap", () => {
  it("skips everything without DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "")
    await bootstrapModule.bootstrap(fast)
    expect(state.queries).toEqual([])
  })

  it("retries the connection, then applies only new migrations and reloads PostgREST", async () => {
    state.connectFailures = 2
    state.handler = (sql) => {
      if (sql.includes("select name from public.deathspot_migrations")) return { rows: [{ name: migrations[0] }] }
      if (sql.includes("key = 'seeded_at'")) return { rowCount: 1 }
      return undefined
    }
    await bootstrapModule.bootstrap(fast)
    const applied = state.queries.filter((q) => q.includes("insert into public.deathspot_migrations"))
    expect(applied).toHaveLength(migrations.length - 1)
    expect(state.queries).toContain("notify pgrst, 'reload schema'")
    expect(state.queries).toContain("select pg_advisory_unlock(424242)")
    expect(state.ended).toBeGreaterThanOrEqual(3) // two failed attempts + the real connection
  })

  it("is idempotent: calling again returns the same run", async () => {
    state.handler = upToDate
    const a = bootstrapModule.bootstrap(fast)
    expect(bootstrapModule.bootstrap(fast)).toBe(a)
    await a
  })

  it("gives up after the configured connection attempts", async () => {
    state.connectFailures = 99
    await expect(bootstrapModule.bootstrap(fast)).rejects.toThrow("ECONNREFUSED")
  })

  it("rolls back a failing migration and names it", async () => {
    state.handler = (sql) => {
      if (sql.includes("create table public.spots")) return new Error("syntax error")
      return undefined
    }
    await expect(bootstrapModule.bootstrap(fast)).rejects.toThrow(`migration ${migrations[0]} failed: syntax error`)
    expect(state.queries).toContain("rollback")
    expect(state.queries).toContain("select pg_advisory_unlock(424242)")
  })

  it("seeds data/seed.json once in a transaction", async () => {
    state.handler = (sql) => {
      if (sql.includes("select name from public.deathspot_migrations")) return { rows: migrations.map((name) => ({ name })) }
      return undefined
    }
    await bootstrapModule.bootstrap(fast)
    const inserts = state.queries.filter((q) => q.includes("insert into public.spots"))
    expect(inserts.length).toBeGreaterThan(10)
    expect(state.queries).toContain("commit")
    expect(state.queries.some((q) => q.includes("'seeded_at'") && q.startsWith("insert"))).toBe(true)
  })

  it("fills defaults for optional seed fields", async () => {
    seedOverride.json = JSON.stringify({ spots: [{ title: "Minimal", lat: 0.3, lng: 32.5, category: "other", severity: 2 }] })
    const params: unknown[][] = []
    state.handler = (sql, p) => {
      if (sql.includes("select name from public.deathspot_migrations")) return { rows: migrations.map((name) => ({ name })) }
      if (sql.includes("insert into public.spots")) params.push(p!)
      return undefined
    }
    try {
      await bootstrapModule.bootstrap(fast)
    } finally {
      seedOverride.json = null
    }
    expect(params).toEqual([["Minimal", "", 0.3, 32.5, "", "other", 2, "any", null, null]])
  })

  it("rolls back a failing seed", async () => {
    state.handler = (sql) => {
      if (sql.includes("select name from public.deathspot_migrations")) return { rows: migrations.map((name) => ({ name })) }
      if (sql.includes("insert into public.spots")) return new Error("check violation")
      return undefined
    }
    await expect(bootstrapModule.bootstrap(fast)).rejects.toThrow("check violation")
    expect(state.queries).toContain("rollback")
  })
})

describe("first admin", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAIL", "admin@deathspot.test")
    vi.stubEnv("ADMIN_PASSWORD", "secret-password")
  })

  const withAdmins = (hasAdmin: boolean, existingId?: string): Handler => (sql) => {
    if (sql.includes("raw_app_meta_data ->> 'role' = 'admin'")) return { rowCount: hasAdmin ? 1 : 0 }
    if (sql.includes("where lower(email) = lower($1)")) return { rows: [{ id: existingId }] }
    return upToDate(sql)
  }

  it("does nothing when an admin already exists", async () => {
    state.handler = withAdmins(true)
    await bootstrapModule.bootstrap(fast)
    expect(auth.createUser).not.toHaveBeenCalled()
  })

  it("does nothing without a password", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "")
    state.handler = withAdmins(false)
    await bootstrapModule.bootstrap(fast)
    expect(auth.createUser).not.toHaveBeenCalled()
  })

  it("creates a confirmed admin", async () => {
    state.handler = withAdmins(false)
    await bootstrapModule.bootstrap(fast)
    expect(auth.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "admin@deathspot.test", email_confirm: true, app_metadata: { role: "admin" } }),
    )
  })

  it("promotes an existing account with that email", async () => {
    state.handler = withAdmins(false, "user-1")
    auth.createUser.mockResolvedValue({ error: { message: "A user with this email address has already been registered" } })
    await bootstrapModule.bootstrap(fast)
    expect(auth.updateUserById).toHaveBeenCalledWith("user-1", { app_metadata: { role: "admin" } })
  })

  it("waits for auth to come up", async () => {
    state.handler = withAdmins(false)
    auth.createUser.mockResolvedValueOnce({ error: { message: "fetch failed" } }).mockResolvedValue({ error: null })
    await bootstrapModule.bootstrap(fast)
    expect(auth.createUser).toHaveBeenCalledTimes(2)
  })

  it("fails after the configured attempts", async () => {
    state.handler = withAdmins(false)
    auth.createUser.mockResolvedValue({ error: { message: "fetch failed" } })
    await expect(bootstrapModule.bootstrap(fast)).rejects.toMatchObject({ message: "fetch failed" })
    expect(auth.createUser).toHaveBeenCalledTimes(3)
  })
})

describe("startup", () => {
  it("runs the bootstrap", async () => {
    state.handler = upToDate
    await bootstrapModule.startup()
    expect(console.log).toHaveBeenCalledWith("[bootstrap]", "ready")
  })

  it("exits in production so Docker restarts the container", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DATABASE_URL", "postgres://test")
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never)
    state.connectFailures = 99
    // startup() uses the default retry policy; fail fast by making every sleep instant.
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn()
      return 0
    }) as never)
    await bootstrapModule.startup()
    expect(exit).toHaveBeenCalledWith(1)
    expect(console.error).toHaveBeenCalled()
  })

  it("logs but keeps running in development", async () => {
    vi.stubEnv("NODE_ENV", "development")
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never)
    state.handler = () => new Error("down")
    await bootstrapModule.startup()
    expect(exit).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith("[bootstrap] failed:", expect.any(Error))
  })
})
