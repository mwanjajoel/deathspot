import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const rpc = vi.fn()
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => ({ rpc }) }))

let rl: typeof import("@/lib/rate-limit")
beforeEach(async () => {
  vi.resetModules()
  rpc.mockReset()
  rl = await import("@/lib/rate-limit")
})
afterEach(() => vi.restoreAllMocks())

const headers = (h: Record<string, string> = {}) => new Headers({ "user-agent": "ua", ...h })
const row = (allowed: boolean, remaining: number, reset_seconds = 30) => ({ data: [{ allowed, remaining, reset_seconds }], error: null })

describe("visitor identity", () => {
  it("hashes IP + user agent, preferring CF-Connecting-IP, then X-Forwarded-For, then X-Real-IP", () => {
    const base = rl.visitorHash(headers())
    expect(base).toMatch(/^[0-9a-f]{32}$/)
    expect(rl.visitorHash(headers({ "x-real-ip": "1.1.1.1" }))).not.toBe(base)
    expect(rl.visitorHash(headers({ "x-forwarded-for": "2.2.2.2, 10.0.0.1", "x-real-ip": "1.1.1.1" }))).toBe(
      rl.visitorHash(headers({ "x-forwarded-for": "2.2.2.2" })),
    )
    expect(rl.visitorHash(headers({ "cf-connecting-ip": "3.3.3.3", "x-forwarded-for": "2.2.2.2" }))).toBe(
      rl.visitorHash(headers({ "cf-connecting-ip": "3.3.3.3" })),
    )
    expect(rl.visitorHash(new Headers())).not.toBe(base)
    expect(rl.voterHash(new Request("http://x", { headers: headers() }))).toBe(base)
  })
})

describe("checkRateLimit", () => {
  it("uses the database limiter, keyed by policy and visitor", async () => {
    rpc.mockResolvedValue(row(true, 4))
    const r = await rl.checkRateLimit(headers(), "vote")
    expect(r).toMatchObject({ allowed: true, limit: 60, remaining: 4, resetSeconds: 30 })
    expect(rpc).toHaveBeenCalledWith("hit_rate_limit", {
      p_key: `vote:${rl.visitorHash(headers())}`,
      p_limit: 60,
      p_window_seconds: 3600,
    })
  })

  it("checks every policy and reports the one that blocks", async () => {
    rpc.mockImplementation(async (_: string, args: { p_key: string }) =>
      args.p_key.startsWith("report-net") ? row(false, 0, 99) : row(true, 3),
    )
    const r = await rl.checkRateLimit(headers(), "report")
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(r.allowed).toBe(false)
    expect(r.policy.name).toBe("report-net")
  })

  it("reports the tightest remaining quota when all policies allow", async () => {
    rpc.mockImplementation(async (_: string, args: { p_key: string }) =>
      args.p_key.startsWith("report-net") ? row(true, 20) : row(true, 2),
    )
    const r = await rl.checkRateLimit(headers(), "report")
    expect(r).toMatchObject({ allowed: true, remaining: 2 })
    expect(r.policy.name).toBe("report")
  })

  it("reports a later policy when it has less headroom", async () => {
    rpc.mockImplementation(async (_: string, args: { p_key: string }) =>
      args.p_key.startsWith("report-net") ? row(true, 1) : row(true, 3),
    )
    expect((await rl.checkRateLimit(headers(), "report")).policy.name).toBe("report-net")
  })

  it("keeps the first result when a later policy has more headroom", async () => {
    rpc.mockImplementation(async (_: string, args: { p_key: string }) =>
      args.p_key.startsWith("report-net") ? row(true, 25) : row(true, 1),
    )
    expect((await rl.checkRateLimit(headers(), "report")).policy.name).toBe("report")
  })

  it("falls back to in-memory limits when the database is unavailable, warning once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    rpc.mockResolvedValueOnce({ data: null, error: { message: "offline" } }).mockResolvedValue({ data: [], error: null })
    const h = headers({ "x-forwarded-for": "9.9.9.9" })
    const results = []
    for (let i = 0; i < 21; i++) results.push(await rl.checkRateLimit(h, "route"))
    expect(results[0]).toMatchObject({ allowed: true, remaining: 19 })
    expect(results[19]).toMatchObject({ allowed: true, remaining: 0 })
    expect(results[20]).toMatchObject({ allowed: false, remaining: 0 })
    expect(results[20].resetSeconds).toBeGreaterThanOrEqual(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain("offline")
  })

  it("forgets in-memory hits once the window has passed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: null })
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000)
    const h = headers({ "x-forwarded-for": "8.8.8.8" })
    for (let i = 0; i < 20; i++) await rl.checkRateLimit(h, "route")
    expect((await rl.checkRateLimit(h, "route")).allowed).toBe(false)
    now.mockReturnValue(1_000_000 + 61_000)
    expect((await rl.checkRateLimit(h, "route")).allowed).toBe(true)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("no result"))
  })
})

describe("rateLimitHeaders", () => {
  const policy = { name: "x", limit: 10, windowSeconds: 60, scope: "visitor" as const, message: "m" }
  it("sets RateLimit-* fields, plus Retry-After only when blocked", () => {
    expect(rl.rateLimitHeaders({ allowed: true, limit: 10, remaining: 7, resetSeconds: 12, policy })).toEqual({
      "RateLimit-Limit": "10",
      "RateLimit-Remaining": "7",
      "RateLimit-Reset": "12",
      "RateLimit-Policy": "10;w=60",
    })
    expect(rl.rateLimitHeaders({ allowed: false, limit: 10, remaining: 0, resetSeconds: 12, policy })["Retry-After"]).toBe("12")
  })
})

describe("withRateLimit", () => {
  it("adds headers to allowed responses and passes the context through", async () => {
    rpc.mockResolvedValue(row(true, 119))
    const handler = vi.fn(async (_req: Request, ctx: { id: string }) => Response.json({ id: ctx.id }))
    const res = await rl.withRateLimit("read", handler)(new Request("http://x", { headers: headers() }), { id: "7" })
    expect(await res.json()).toEqual({ id: "7" })
    expect(res.headers.get("RateLimit-Remaining")).toBe("119")
    expect(res.headers.get("Retry-After")).toBeNull()
  })

  it("rejects with 429, Retry-After and the policy message without calling the handler", async () => {
    rpc.mockResolvedValue(row(false, 0, 42))
    const handler = vi.fn()
    const res = await rl.withRateLimit("read", handler)(new Request("http://x", { headers: headers() }), {})
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("42")
    expect(await res.json()).toEqual({ error: "Too many requests. Wait a minute and try again." })
    expect(handler).not.toHaveBeenCalled()
  })
})
