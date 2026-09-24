import { describe, expect, it } from "vitest"
import * as spotsRoute from "@/app/api/spots/route"
import * as voteRoute from "@/app/api/spots/[id]/vote/route"
import * as flagRoute from "@/app/api/spots/[id]/flag/route"
import * as meRoute from "@/app/api/me/route"
import * as statsRoute from "@/app/api/stats/route"
import * as healthRoute from "@/app/api/health/route"
import { params, setSetting, spot, sql, T, visitor } from "./helpers"

type SpotJson = { id: number; title: string; status: string; confirmations: number; denials: number }

async function report(patch: Record<string, unknown> = {}) {
  const res = await spotsRoute.POST(visitor().post("/api/spots", spot(patch)), undefined)
  expect(res.status).toBe(201)
  return (await res.json()) as { spot: SpotJson; pending: boolean }
}

async function listed(id: number, query = "") {
  const res = await spotsRoute.GET(visitor().get(`/api/spots${query}`), undefined)
  const { spots } = (await res.json()) as { spots: SpotJson[] }
  return spots.some((s) => s.id === id)
}

describe("GET /api/spots", () => {
  it("lists approved spots with rate-limit headers and no private columns", async () => {
    const res = await spotsRoute.GET(visitor().get("/api/spots"), undefined)
    expect(res.status).toBe(200)
    expect(res.headers.get("RateLimit-Limit")).toBe("120")
    expect(res.headers.get("RateLimit-Remaining")).toBe("119")
    const { spots } = await res.json()
    expect(spots.length).toBeGreaterThanOrEqual(21)
    expect(spots[0]).not.toHaveProperty("reporter_hash")
    expect(spots[0]).not.toHaveProperty("moderation")
  })

  it("filters by category and recency, ignoring unknown values", async () => {
    const { spot: s } = await report({ category: "kidnapping" })
    expect(await listed(s.id, "?category=kidnapping&since=1")).toBe(true)
    expect(await listed(s.id, "?category=murder")).toBe(false)
    expect(await listed(s.id, "?category=nonsense&since=-3")).toBe(true)
  })
})

describe("POST /api/spots", () => {
  it("publishes instantly by default, counting the reporter's vote and stripping phone numbers", async () => {
    const { spot: s, pending } = await report({ description: "call 0772 123 456" })
    expect(pending).toBe(false)
    expect(s).toMatchObject({ status: "unverified", confirmations: 1, denials: 0 })
    expect((s as unknown as { description: string }).description).toBe("call [removed]")
    expect(await listed(s.id)).toBe(true)
  })

  it("holds reports for review when approval is required", async () => {
    await setSetting("require_approval", true)
    try {
      const { spot: s, pending } = await report()
      expect(pending).toBe(true)
      expect(await listed(s.id)).toBe(false)
    } finally {
      await setSetting("require_approval", false)
    }
  })

  it("rejects invalid reports with every issue", async () => {
    const res = await spotsRoute.POST(visitor().post("/api/spots", spot({ lat: -1.29, lng: 36.82 })), undefined)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("Location must be inside Uganda")
    expect(body.issues[0].path).toEqual(["lat"])
  })

  it("rejects bodies that aren't JSON", async () => {
    const res = await spotsRoute.POST(visitor().post("/api/spots", "{nope"), undefined)
    expect(res.status).toBe(400)
  })

  it("limits each visitor to 5 reports an hour, with Retry-After", async () => {
    const v = visitor()
    for (let i = 0; i < 5; i++) {
      expect((await spotsRoute.POST(v.post("/api/spots", spot()), undefined)).status).toBe(201)
    }
    const res = await spotsRoute.POST(v.post("/api/spots", spot()), undefined)
    expect(res.status).toBe(429)
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0)
    expect(res.headers.get("RateLimit-Remaining")).toBe("0")
    expect((await res.json()).error).toMatch(/reported a lot of spots/)
  })
})

describe("POST /api/spots/{id}/vote", () => {
  it("confirms a spot after three net votes, refuses duplicates, and lets voters change their mind", async () => {
    const { spot: s } = await report()
    const voters = [visitor(), visitor()]
    for (const v of voters) {
      const res = await voteRoute.POST(v.post(`/api/spots/${s.id}/vote`, { value: 1 }), params(s.id))
      expect(res.status).toBe(200)
    }
    const again = await voteRoute.POST(voters[0].post(`/api/spots/${s.id}/vote`, { value: 1 }), params(s.id))
    expect(again.status).toBe(409)

    const [row] = await sql<{ status: string }>("select status from public.spots where id = $1", [s.id])
    expect(row.status).toBe("confirmed")

    const change = await voteRoute.POST(voters[0].post(`/api/spots/${s.id}/vote`, { value: -1 }), params(s.id))
    expect((await change.json()).spot).toMatchObject({ confirmations: 2, denials: 1, status: "unverified" })
  })

  it("marks a spot disputed when denials outweigh confirmations", async () => {
    const { spot: s } = await report()
    let last: SpotJson | null = null
    for (let i = 0; i < 4; i++) {
      const res = await voteRoute.POST(visitor().post(`/api/spots/${s.id}/vote`, { value: -1 }), params(s.id))
      last = (await res.json()).spot
    }
    expect(last!.status).toBe("disputed")
  })

  it.each([
    ["abc", { value: 1 }, 400, "Bad id"],
    ["1", { value: 2 }, 400, "Vote must be 1 or -1"],
    ["999999999", { value: 1 }, 404, "Spot not found"],
    ["1", "{not json", 400, "Vote must be 1 or -1"],
  ])("id=%s body=%j → %i", async (id, body, status, error) => {
    const res = await voteRoute.POST(visitor().post(`/api/spots/${id}/vote`, body), params(id))
    expect(res.status).toBe(status)
    expect((await res.json()).error).toBe(error)
  })
})

describe("POST /api/spots/{id}/flag", () => {
  it("hides a spot for review after the threshold, once per visitor", async () => {
    const { spot: s } = await report()
    const first = visitor()
    const flag = (v = visitor()) => flagRoute.POST(v.post(`/api/spots/${s.id}/flag`, { reason: "inaccurate", note: "wrong road" }), params(s.id))

    expect(await (await flag(first)).json()).toEqual({ result: "flagged" })
    expect((await flag(first)).status).toBe(409)
    expect(await (await flag()).json()).toEqual({ result: "flagged" })
    expect(await (await flag()).json()).toEqual({ result: "hidden" })
    expect(await listed(s.id)).toBe(false)

    const log = await sql("select action from public.moderation_log where spot_id = $1", [s.id])
    expect(log).toEqual([{ action: "auto_hidden" }])
  })

  it.each([
    ["x", { reason: "other" }, 400, "Bad id"],
    ["1", { reason: "spam" }, 400, "Choose a reason"],
    ["999999999", { reason: "other" }, 404, "Spot not found"],
    ["1", "{not json", 400, "Choose a reason"],
  ])("id=%s body=%j → %i", async (id, body, status, error) => {
    const res = await flagRoute.POST(visitor().post(`/api/spots/${id}/flag`, body), params(id))
    expect(res.status).toBe(status)
    expect((await res.json()).error).toBe(error)
  })
})

describe("GET /api/me, /api/stats, /api/health", () => {
  it("returns the caller's own votes and the approval setting", async () => {
    const { spot: s } = await report()
    const v = visitor()
    await voteRoute.POST(v.post(`/api/spots/${s.id}/vote`, { value: -1 }), params(s.id))
    const me = await (await meRoute.GET(v.get("/api/me"), undefined)).json()
    expect(me).toEqual({ votes: { [s.id]: -1 }, requireApproval: false })
  })

  it("returns aggregate statistics", async () => {
    const stats = await (await statsRoute.GET(visitor().get("/api/stats"), undefined)).json()
    expect(stats.totals.total).toBeGreaterThanOrEqual(21)
    expect(stats.byCategory[0]).toHaveProperty("count")
    expect(stats.byArea.length).toBeLessThanOrEqual(8)
  })

  it("reports healthy", async () => {
    expect(await (await healthRoute.GET()).json()).toEqual({ ok: true })
  })
})

it("cleans up after itself", async () => {
  const [{ n }] = await sql<{ n: string }>(`select count(*) as n from public.spots where title like '${T}%'`)
  expect(Number(n)).toBeGreaterThan(0)
})
