import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { serviceClient } from "@/lib/supabase/server"
import { sql, T, visitor } from "./helpers"
import * as spotsRoute from "@/app/api/spots/route"

// --- Next.js request context, simulated: a cookie jar and request headers per "browser".
const jar = new Map<string, string>()
let requestHeaders = new Headers()
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0 || value === "") jar.delete(name)
      else jar.set(name, value)
    },
  }),
  headers: async () => requestHeaders,
}))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error(`REDIRECT ${to}`), { to })
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const actions = await import("@/app/admin/actions")

const password = () => `pw-${randomBytes(9).toString("hex")}`
const users = {
  admin: { email: `admin-${Date.now()}@deathspot.test`, password: password(), role: "admin", id: "" },
  moderator: { email: `mod-${Date.now()}@deathspot.test`, password: password(), role: "moderator", id: "" },
  visitor: { email: `user-${Date.now()}@deathspot.test`, password: password(), role: null, id: "" },
}

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

function newBrowser() {
  jar.clear()
  requestHeaders = new Headers(visitor().headers)
}

async function signInAs(user: { email: string; password: string }, next = "") {
  newBrowser()
  return actions.signIn(null, form({ email: user.email, password: user.password, next })).catch((e: { to?: string }) => e.to)
}

async function newSpot(patch: Record<string, unknown> = {}) {
  const res = await spotsRoute.POST(
    visitor().post("/api/spots", { title: `${T} Moderation`, lat: 0.33, lng: 32.58, category: "robbery", severity: 3, time_of_day: "any", ...patch }),
    undefined,
  )
  return (await res.json()).spot.id as number
}

const spotRow = async (id: number) =>
  (await sql<{ moderation: string; moderator_verified: boolean; flag_count: number; title: string }>(
    "select moderation, moderator_verified, flag_count, title from public.spots where id = $1",
    [id],
  ))[0]

beforeAll(async () => {
  for (const u of Object.values(users)) {
    const { data, error } = await serviceClient().auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      app_metadata: u.role ? { role: u.role } : {},
    })
    if (error) throw error
    u.id = data.user.id
  }
})
afterAll(async () => {
  for (const u of Object.values(users)) await serviceClient().auth.admin.deleteUser(u.id).catch(() => {})
})
beforeEach(() => newBrowser())

describe("signIn / signOut", () => {
  it("requires both fields", async () => {
    expect(await actions.signIn(null, form({ email: "a@b.c" }))).toEqual({ ok: false, error: "Enter your email and password" })
    expect(await actions.signIn(null, form({ password: "x" }))).toEqual({ ok: false, error: "Enter your email and password" })
  })

  it("redirects to /admin when no `next` page is given", async () => {
    newBrowser()
    await expect(actions.signIn(null, form({ email: users.moderator.email, password: users.moderator.password }))).rejects.toMatchObject({
      to: "/admin",
    })
  })

  it("rejects a wrong password without revealing which field was wrong", async () => {
    expect(await signInAs({ email: users.admin.email, password: "nope-nope-nope" })).toEqual({
      ok: false,
      error: "Wrong email or password",
    })
  })

  it("refuses accounts without a moderator role and signs them straight out", async () => {
    expect(await signInAs(users.visitor)).toEqual({ ok: false, error: "This account doesn't have moderator access" })
    expect([...jar.keys()].filter((k) => k.includes("auth-token"))).toEqual([])
  })

  it("redirects to /admin, or to a safe `next` page", async () => {
    expect(await signInAs(users.moderator)).toBe("/admin")
    expect([...jar.keys()].some((k) => k.includes("auth-token"))).toBe(true)
    expect(await signInAs(users.moderator, "/admin/spots?status=pending")).toBe("/admin/spots?status=pending")
    expect(await signInAs(users.moderator, "/admin/login")).toBe("/admin")
    expect(await signInAs(users.moderator, "https://evil.example")).toBe("/admin")
  })

  it("limits sign-in attempts per network", async () => {
    newBrowser()
    const attempt = () => actions.signIn(null, form({ email: users.admin.email, password: "wrong-password" }))
    for (let i = 0; i < 10; i++) expect((await attempt()).ok).toBe(false)
    expect(await attempt()).toEqual({ ok: false, error: "Too many sign-in attempts. Wait 15 minutes and try again." })
  })

  it("signs out", async () => {
    await signInAs(users.moderator)
    await expect(actions.signOut()).rejects.toMatchObject({ to: "/admin/login" })
    await expect(actions.moderate(1, "approve")).rejects.toMatchObject({ to: "/admin/login" })
  })
})

describe("moderation", () => {
  beforeEach(async () => {
    await signInAs(users.moderator)
  })

  it("approves, verifies, unverifies, hides and restores a spot, logging each step", async () => {
    await sql("update public.settings set value = 'true' where key = 'require_approval'")
    const id = await newSpot()
    await sql("update public.settings set value = 'false' where key = 'require_approval'")
    expect((await spotRow(id)).moderation).toBe("pending")

    expect(await actions.moderate(id, "approve", "checked")).toEqual({ ok: true, message: "Approved: now visible on the map" })
    expect((await actions.moderate(id, "verify")).ok).toBe(true)
    expect(await spotRow(id)).toMatchObject({ moderation: "approved", moderator_verified: true })
    expect((await actions.moderate(id, "unverify")).ok).toBe(true)
    expect((await actions.moderate(id, "reject", "duplicate")).ok).toBe(true)
    expect((await spotRow(id)).moderation).toBe("rejected")
    expect(await actions.moderate(id, "approve")).toEqual({ ok: true, message: "Approved: now visible on the map" })

    const history = await actions.getSpotHistory(id)
    expect(history.map((e) => e.action)).toEqual(["approve", "reject", "unverify", "verify", "approve"])
    expect(history.at(-1)).toMatchObject({ actor_email: users.moderator.email, note: "checked" })
  })

  it("dismisses flags and keeps the spot", async () => {
    const id = await newSpot()
    await sql("update public.spots set flag_count = 2 where id = $1", [id])
    expect(await actions.moderate(id, "dismiss_flags")).toEqual({ ok: true, message: "Flags dismissed" })
    expect(await spotRow(id)).toMatchObject({ flag_count: 0, moderation: "approved" })
  })

  it("rejects unknown actions and missing spots", async () => {
    expect(await actions.moderate(1, "explode" as never)).toEqual({ ok: false, error: "Unknown action" })
    expect(await actions.moderate(999999999, "approve")).toEqual({ ok: false, error: "not_found" })
  })

  it("edits a spot with validation", async () => {
    const id = await newSpot()
    const edit = {
      title: `${T} Edited title`,
      description: "Updated after a call with the LC1",
      area: "Wandegeya",
      category: "stabbing",
      severity: 5,
      time_of_day: "night",
      lat: 0.33,
      lng: 32.575,
      incident_date: "2026-09-01",
      source_url: "",
      note: "removed a name",
    }
    expect(await actions.updateSpot(id, { ...edit, title: "ab" })).toEqual({ ok: false, error: "Title needs at least 3 characters" })
    expect(await actions.updateSpot(id, { ...edit, lat: -1.29, lng: 36.82 })).toEqual({ ok: false, error: "Location must be inside Uganda" })
    expect(await actions.updateSpot(id, edit)).toEqual({ ok: true, message: "Changes saved" })
    expect((await spotRow(id)).title).toBe(`${T} Edited title`)
    expect(await actions.updateSpot(999999999, edit)).toEqual({ ok: false, error: "not_found" })
    expect(await actions.updateSpot(id, { ...edit, note: undefined })).toEqual({ ok: true, message: "Changes saved" })
  })

  it("deletes a spot", async () => {
    const id = await newSpot()
    expect(await actions.deleteSpot(id, "test data")).toEqual({ ok: true, message: "Spot deleted" })
    expect(await spotRow(id)).toBeUndefined()
    expect(await actions.deleteSpot(await newSpot())).toEqual({ ok: true, message: "Spot deleted" })
  })

  it("keeps moderators out of admin-only settings and team management", async () => {
    await expect(actions.saveSettings({ requireApproval: true, autoHideThreshold: 3 })).rejects.toMatchObject({ to: "/admin" })
    await expect(actions.listTeam()).rejects.toMatchObject({ to: "/admin" })
  })

  it("changes the moderator's password", async () => {
    const pw = (p: string, c = p) => actions.changePassword(null, form({ password: p, confirm: c }))
    expect(await pw("short")).toEqual({ ok: false, error: "Use at least 10 characters" })
    expect(await pw("long-enough-1", "long-enough-2")).toEqual({ ok: false, error: "Passwords don't match" })
    expect(await actions.changePassword(null, form({}))).toEqual({ ok: false, error: "Use at least 10 characters" })
    // GoTrue refuses to "change" a password to the one already set.
    expect((await pw(users.moderator.password)).ok).toBe(false)
    const next = password()
    expect(await pw(next)).toEqual({ ok: true, message: "Password updated" })
    users.moderator.password = next
    expect(await signInAs(users.moderator)).toBe("/admin")
  })
})

describe("admin", () => {
  beforeEach(async () => {
    await signInAs(users.admin)
  })

  it("saves settings", async () => {
    expect(await actions.saveSettings({ requireApproval: false, autoHideThreshold: 60 })).toEqual({
      ok: false,
      error: "Threshold must be between 0 and 50",
    })
    expect(await actions.saveSettings({ requireApproval: true, autoHideThreshold: 4.4 })).toEqual({ ok: true, message: "Settings saved" })
    expect(await sql("select key, value from public.settings where key in ('require_approval','auto_hide_flag_threshold') order by key")).toEqual([
      { key: "auto_hide_flag_threshold", value: 4 },
      { key: "require_approval", value: true },
    ])
    await actions.saveSettings({ requireApproval: false, autoHideThreshold: 3 })
  })

  it("manages the team", async () => {
    const team = await actions.listTeam()
    expect(team.find((m) => m.email === users.moderator.email)).toMatchObject({ role: "moderator" })
    expect(team.find((m) => m.email === users.admin.email)!.lastSignIn).not.toBeNull()
    expect(team.some((m) => m.email === users.visitor.email)).toBe(false)

    const email = `new-${Date.now()}@deathspot.test`
    const add = (f: Record<string, string>) => actions.addMember(null, form(f))
    expect(await add({ email: "not-an-email", password: password(), role: "moderator" })).toEqual({ ok: false, error: "Enter a valid email" })
    expect(await add({ email, password: password(), role: "moderator" })).toEqual({ ok: true, message: `${email} can now sign in at /admin` })
    expect((await add({ email, password: password(), role: "moderator" })).ok).toBe(false)

    const member = (await actions.listTeam()).find((m) => m.email === email)!
    expect(member.lastSignIn).toBeNull()
    expect(await actions.setMemberRole(member.id, "admin")).toEqual({ ok: true, message: "Role updated" })
    expect(await actions.setMemberRole(users.admin.id, "moderator")).toEqual({ ok: false, error: "You can't change your own role" })
    expect(await actions.setMemberRole(member.id, "none")).toEqual({ ok: true, message: "Access removed" })
    expect((await actions.listTeam()).some((m) => m.email === email)).toBe(false)

    const log = await sql<{ note: string }>("select note from public.moderation_log where action = 'team' and note like $1 order by id", [`%${email}%`])
    expect(log.map((l) => l.note)).toEqual([`added ${email} as moderator`, `set ${email} to admin`, `removed ${email}`])
  })
})
