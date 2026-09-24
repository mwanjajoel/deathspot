import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeClient } from "../fake-supabase"

// Failure paths of the admin server actions: database and GoTrue errors that the integration
// tests can't provoke on a healthy local stack.

const me = { id: "admin-1", email: "admin@deathspot.test", role: "admin" }
let user = fakeClient()
let service = fakeClient()
vi.mock("@/lib/supabase/server", () => ({ userClient: async () => user, serviceClient: () => service }))
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => me, requireModerator: async () => me }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

const actions = await import("@/app/admin/actions")
const boom = { message: "boom" }
const form = (f: Record<string, string>) => {
  const d = new FormData()
  for (const [k, v] of Object.entries(f)) d.set(k, v)
  return d
}

beforeEach(() => {
  user = fakeClient()
  service = fakeClient()
})

describe("database errors surface as action errors", () => {
  it("signIn passes through unexpected auth errors", async () => {
    user = fakeClient({ auth: { signInWithPassword: async () => ({ data: {}, error: { message: "Email not confirmed" } }) } })
    expect(await actions.signIn(null, form({ email: "a@b.c", password: "x" }))).toEqual({ ok: false, error: "Email not confirmed" })
  })

  it("deleteSpot", async () => {
    user = fakeClient({ rpc: { admin_delete_spot: { error: boom } } })
    expect(await actions.deleteSpot(1)).toEqual({ ok: false, error: "boom" })
  })

  it("saveSettings", async () => {
    user = fakeClient({ rpc: { admin_set_setting: { error: boom } } })
    expect(await actions.saveSettings({ requireApproval: true, autoHideThreshold: 3 })).toEqual({ ok: false, error: "boom" })
  })

  it("getSpotHistory", async () => {
    user = fakeClient({ from: { moderation_log: { error: boom } } })
    await expect(actions.getSpotHistory(1)).rejects.toThrow("boom")
  })
})

describe("team management errors", () => {
  const admin = (overrides: Record<string, unknown>) => {
    service = fakeClient({ auth: { admin: overrides } })
  }

  it("listTeam throws on errors and tolerates users without an email", async () => {
    admin({ listUsers: async () => ({ data: null, error: boom }) })
    await expect(actions.listTeam()).rejects.toThrow("boom")
    admin({
      listUsers: async () => ({
        data: { users: [{ id: "p", app_metadata: { role: "moderator" }, created_at: "2026-01-01" }] },
        error: null,
      }),
    })
    expect(await actions.listTeam()).toEqual([{ id: "p", email: "", role: "moderator", lastSignIn: null, createdAt: "2026-01-01" }])
  })

  it("setMemberRole reports delete and update failures", async () => {
    admin({ getUserById: async () => ({ data: { user: null } }), deleteUser: async () => ({ error: boom }) })
    expect(await actions.setMemberRole("x", "none")).toEqual({ ok: false, error: "boom" })
    admin({ updateUserById: async () => ({ data: null, error: boom }) })
    expect(await actions.setMemberRole("x", "moderator")).toEqual({ ok: false, error: "boom" })
  })

  it("setMemberRole logs the id when the removed user no longer has an email", async () => {
    admin({ getUserById: async () => ({ data: { user: null } }), deleteUser: async () => ({ error: null }) })
    expect(await actions.setMemberRole("gone-id", "none")).toEqual({ ok: true, message: "Access removed" })
    expect(service.builders.moderation_log[0].calls[0]).toEqual([
      "insert",
      [{ actor: "admin-1", actor_email: "admin@deathspot.test", action: "team", note: "removed gone-id" }],
    ])
  })
})
