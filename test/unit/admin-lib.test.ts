import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeClient } from "../fake-supabase"

let client = fakeClient()
vi.mock("@/lib/supabase/server", () => ({ userClient: async () => client }))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
}))

const admin = await import("@/lib/admin")
const fail = { error: { message: "denied" } }
const withUser = (user: unknown, extra: Parameters<typeof fakeClient>[0] = {}) => {
  client = fakeClient({ ...extra, auth: { getUser: async () => ({ data: { user } }) } })
}

beforeEach(() => withUser(null))

describe("getModerator / requireModerator / requireAdmin", () => {
  it("returns null for visitors and non-moderators", async () => {
    expect(await admin.getModerator()).toBeNull()
    withUser({ id: "u", app_metadata: {} })
    expect(await admin.getModerator()).toBeNull()
    await expect(admin.requireModerator()).rejects.toThrow("REDIRECT /admin/login")
  })

  it("returns moderators and admins with their role", async () => {
    withUser({ id: "m", email: "m@x", app_metadata: { role: "moderator" } })
    expect(await admin.requireModerator()).toEqual({ id: "m", email: "m@x", role: "moderator" })
    await expect(admin.requireAdmin()).rejects.toThrow("REDIRECT /admin")
    withUser({ id: "a", app_metadata: { role: "admin" } })
    expect(await admin.requireAdmin()).toEqual({ id: "a", email: "", role: "admin" })
  })

  it("treats a missing app_metadata as no role", async () => {
    withUser({ id: "u" })
    expect(await admin.getModerator()).toBeNull()
  })
})

describe("getQueue", () => {
  it("attaches open flags to each spot", async () => {
    withUser(null, {
      from: {
        spots: { data: [{ id: 1 }, { id: 2 }] },
        flags: { data: [{ id: 10, spot_id: 2, reason: "duplicate" }] },
      },
    })
    expect(await admin.getQueue()).toEqual([
      { id: 1, flags: [] },
      { id: 2, flags: [{ id: 10, spot_id: 2, reason: "duplicate" }] },
    ])
  })
  it("skips the flag query when the queue is empty", async () => {
    withUser(null, { from: { spots: { data: [] } } })
    expect(await admin.getQueue()).toEqual([])
    expect(client.from).toHaveBeenCalledTimes(1)
  })
  it("throws on errors", async () => {
    withUser(null, { from: { spots: fail } })
    await expect(admin.getQueue()).rejects.toThrow("denied")
    withUser(null, { from: { spots: { data: [{ id: 1 }] }, flags: fail } })
    await expect(admin.getQueue()).rejects.toThrow("denied")
  })
})

describe("getCounts", () => {
  it("returns the four counts, treating null as zero", async () => {
    withUser(null, { from: { spots: [{ count: 2 }, { count: null }, { count: 5 }, { count: 20 }] } })
    expect(await admin.getCounts()).toEqual({ pending: 2, flagged: 0, today: 5, live: 20 })
  })
  it("treats every missing count as zero", async () => {
    withUser(null, { from: { spots: { count: null } } })
    expect(await admin.getCounts()).toEqual({ pending: 0, flagged: 0, today: 0, live: 0 })
  })
})

describe("searchSpots (admin)", () => {
  const calls = () => client.builders.spots[0].calls
  it("filters by status, category and text, paginated", async () => {
    withUser(null, { from: { spots: { data: [{ id: 1 }], count: 41 } } })
    expect(await admin.searchSpots({ q: "kal(erwe)*", moderation: "pending", category: "robbery", page: 3 })).toEqual({
      spots: [{ id: 1 }],
      total: 41,
      page: 3,
    })
    expect(calls()).toContainEqual(["range", [40, 59]])
    expect(calls()).toContainEqual(["eq", ["moderation", "pending"]])
    expect(calls()).toContainEqual(["eq", ["category", "robbery"]])
    expect(calls()).toContainEqual(["or", ["title.ilike.*kal erwe*,area.ilike.*kal erwe*,description.ilike.*kal erwe*"]])
  })
  it("treats flagged as a filter on flag_count, and ignores 'all' and empty search", async () => {
    withUser(null, { from: { spots: { data: [], count: null } } })
    expect(await admin.searchSpots({ q: " ,() ", moderation: "flagged", category: "all" })).toEqual({ spots: [], total: 0, page: 1 })
    expect(calls()).toContainEqual(["gt", ["flag_count", 0]])
    expect(calls().some(([m]) => m === "or")).toBe(false)
  })
  it("uses defaults when no filters are given", async () => {
    withUser(null, { from: { spots: { data: [], count: 0 } } })
    await admin.searchSpots({ moderation: "all", page: -2 })
    expect(calls().map(([m]) => m)).toEqual(["select", "order", "range"])
  })
  it("throws on errors", async () => {
    withUser(null, { from: { spots: fail } })
    await expect(admin.searchSpots({})).rejects.toThrow("denied")
  })
})

describe("getLog / getSettings", () => {
  it("returns the log", async () => {
    withUser(null, { from: { moderation_log: { data: [{ id: 1 }] } } })
    expect(await admin.getLog()).toEqual([{ id: 1 }])
    withUser(null, { from: { moderation_log: fail } })
    await expect(admin.getLog()).rejects.toThrow("denied")
  })
  it("reads settings with defaults", async () => {
    withUser(null, { from: { settings: { data: [{ key: "require_approval", value: true }, { key: "auto_hide_flag_threshold", value: 5 }] } } })
    expect(await admin.getSettings()).toEqual({ requireApproval: true, autoHideThreshold: 5 })
    withUser(null, { from: { settings: { data: [] } } })
    expect(await admin.getSettings()).toEqual({ requireApproval: false, autoHideThreshold: 3 })
    withUser(null, { from: { settings: fail } })
    await expect(admin.getSettings()).rejects.toThrow("denied")
  })
})
