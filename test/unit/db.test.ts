import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeClient } from "../fake-supabase"

let anon = fakeClient()
let service = fakeClient()
vi.mock("@/lib/supabase/server", () => ({ anonClient: () => anon, serviceClient: () => service }))

const db = await import("@/lib/db")
const fail = { error: { message: "boom" } }

beforeEach(() => {
  anon = fakeClient()
  service = fakeClient()
})

const newSpot = {
  title: "t",
  description: "",
  lat: 0.3,
  lng: 32.5,
  area: "",
  category: "robbery",
  severity: 3,
  time_of_day: "any",
}

describe("listSpots", () => {
  it("applies category and recency filters", async () => {
    anon = fakeClient({ from: { spots: { data: [{ id: 1 }] } } })
    expect(await db.listSpots({ category: "murder", sinceDays: 7 })).toEqual([{ id: 1 }])
    const calls = anon.builders.spots[0].calls.map(([m]) => m)
    expect(calls).toEqual(["select", "order", "order", "eq", "gte"])
  })
  it("lists everything by default", async () => {
    anon = fakeClient({ from: { spots: { data: [] } } })
    await db.listSpots()
    expect(anon.builders.spots[0].calls.map(([m]) => m)).toEqual(["select", "order", "order"])
  })
  it("throws with context on errors", async () => {
    anon = fakeClient({ from: { spots: fail } })
    await expect(db.listSpots()).rejects.toThrow("listSpots: boom")
  })
})

describe("createSpot", () => {
  it("strips private columns and reports whether the spot is pending", async () => {
    service = fakeClient({ rpc: { report_spot: { data: { id: 9, title: "t", reporter_hash: "secret", moderation: "pending" } } } })
    const r = await db.createSpot(newSpot as never, "hash")
    expect(r.pending).toBe(true)
    expect(r.spot).not.toHaveProperty("reporter_hash")
    expect(r.spot).not.toHaveProperty("moderation")
    expect(r.spot.id).toBe(9)
  })
  it("throws on errors", async () => {
    service = fakeClient({ rpc: { report_spot: fail } })
    await expect(db.createSpot(newSpot as never, "h")).rejects.toThrow("createSpot: boom")
  })
})

describe("vote", () => {
  it.each([
    [{ data: { id: 3, moderation: "approved" } }, { ok: true, spot: { id: 3 } }],
    [{ data: null }, { ok: false, reason: "not_found" }],
    [{ data: { id: null } }, { ok: false, reason: "not_found" }],
    [{ error: { message: "already_voted" } }, { ok: false, reason: "already_voted" }],
  ])("maps %j", async (res, expected) => {
    service = fakeClient({ rpc: { cast_vote: res } })
    expect(await db.vote(3, "h", 1)).toMatchObject(expected)
  })
  it("throws on other errors", async () => {
    service = fakeClient({ rpc: { cast_vote: fail } })
    await expect(db.vote(3, "h", 1)).rejects.toThrow("vote: boom")
  })
})

describe("flagSpot", () => {
  it.each([
    [{ data: "flagged" }, "flagged"],
    [{ data: "hidden" }, "hidden"],
    [{ data: null }, "not_found"],
    [{ error: { message: "already_flagged" } }, "already_flagged"],
  ])("maps %j", async (res, expected) => {
    service = fakeClient({ rpc: { flag_spot: res } })
    expect(await db.flagSpot(1, "h", "other", "")).toBe(expected)
  })
  it("throws on other errors", async () => {
    service = fakeClient({ rpc: { flag_spot: fail } })
    await expect(db.flagSpot(1, "h", "other", "")).rejects.toThrow("flagSpot: boom")
  })
})

describe("getMyVotes", () => {
  it("returns a spot → vote map", async () => {
    service = fakeClient({ from: { votes: { data: [{ spot_id: 1, value: 1 }, { spot_id: 4, value: -1 }] } } })
    expect(await db.getMyVotes("h")).toEqual({ 1: 1, 4: -1 })
  })
  it("throws on errors", async () => {
    service = fakeClient({ from: { votes: fail } })
    await expect(db.getMyVotes("h")).rejects.toThrow("getMyVotes: boom")
  })
})

describe("getStats", () => {
  it("returns the RPC result", async () => {
    anon = fakeClient({ rpc: { spot_stats: { data: { totals: { total: 1 } } } } })
    expect(await db.getStats()).toEqual({ totals: { total: 1 } })
  })
  it("throws on errors", async () => {
    anon = fakeClient({ rpc: { spot_stats: fail } })
    await expect(db.getStats()).rejects.toThrow("getStats: boom")
  })
})

describe("getPublicSettings", () => {
  it.each([
    [[{ key: "require_approval", value: true }], true],
    [[{ key: "require_approval", value: false }], false],
    [[], false],
  ])("%j → requireApproval=%s", async (rows, expected) => {
    anon = fakeClient({ from: { settings: { data: rows } } })
    expect(await db.getPublicSettings()).toEqual({ requireApproval: expected })
  })
  it("throws on errors", async () => {
    anon = fakeClient({ from: { settings: fail } })
    await expect(db.getPublicSettings()).rejects.toThrow("getPublicSettings: boom")
  })
})
