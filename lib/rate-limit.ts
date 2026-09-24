import "server-only"
import { createHash } from "node:crypto"
import { isCloudflareIp } from "./cloudflare"
import { serviceClient } from "./supabase/server"

const SALT = process.env.VOTER_SALT ?? "deathspot-ug-dev-salt"

const sha = (s: string) => createHash("sha256").update(`${SALT}|${s}`).digest("hex").slice(0, 32)

/**
 * The client IP. The reverse proxy in front of the app (Caddy, or Coolify's Traefik) overwrites
 * X-Forwarded-For, so its last hop is the peer that connected to the proxy. CF-Connecting-IP is
 * only believed when that peer is Cloudflare: the origin may also be reachable directly, and then
 * anyone could send the header. If the app itself is exposed without a proxy, clients can spoof
 * X-Forwarded-For too, so production deployments should always sit behind one.
 */
function clientIp(headers: Headers) {
  const hops = (headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean)
  const cf = headers.get("cf-connecting-ip")?.trim()
  if (cf && hops.length && isCloudflareIp(hops[hops.length - 1])) return cf
  return hops[0] ?? headers.get("x-real-ip") ?? "local"
}

/** Anonymous, non-reversible id for a visitor (IP + user agent). No raw IPs are stored. */
export function visitorHash(headers: Headers) {
  return sha(`${clientIp(headers)}|${headers.get("user-agent") ?? ""}`)
}

export const voterHash = (req: Request) => visitorHash(req.headers)

/** Coarser id for per-network limits: many phones share one carrier IP, so these limits are higher. */
const networkHash = (headers: Headers) => sha(`net|${clientIp(headers)}`)

// ---------------------------------------------------------------- policies

type Scope = "visitor" | "network"
export type Policy = { name: string; limit: number; windowSeconds: number; scope: Scope; message: string }

const policy = (name: string, limit: number, windowSeconds: number, scope: Scope, message: string): Policy => ({
  name,
  limit,
  windowSeconds,
  scope,
  message,
})

/**
 * Every rate limit in one place. The developer docs (developer-docs/src/content/docs/rate-limits.mdx
 * and the OpenAPI spec) list these values, so update them together.
 */
export const RATE_LIMITS = {
  report: [
    policy("report", 5, 3600, "visitor", "You have reported a lot of spots recently. Please try again in an hour."),
    policy("report-net", 30, 3600, "network", "Too many reports from your network. Please try again later."),
  ],
  vote: [policy("vote", 60, 3600, "visitor", "Too many votes. Slow down.")],
  flag: [policy("flag", 20, 3600, "visitor", "Too many reports. Try again later.")],
  route: [policy("route", 20, 60, "visitor", "Too many route checks. Wait a minute and try again.")],
  search: [policy("search", 120, 60, "visitor", "Too many searches. Wait a minute and try again.")],
  // Place lookups that miss the cache and reach OpenStreetMap Nominatim.
  geocode: [policy("geocode", 30, 60, "visitor", "Too many place searches. Wait a minute and try again.")],
  read: [policy("read", 120, 60, "visitor", "Too many requests. Wait a minute and try again.")],
  login: [
    policy("login", 10, 900, "network", "Too many sign-in attempts. Wait 15 minutes and try again."),
  ],
} satisfies Record<string, Policy[]>

export type PolicyName = keyof typeof RATE_LIMITS

// ---------------------------------------------------------------- limiter

export type LimitResult = { allowed: boolean; limit: number; remaining: number; resetSeconds: number; policy: Policy }

/** In-process fallback, used only if the database limiter is unreachable. */
const buckets = new Map<string, number[]>()
function memoryHit(key: string, p: Policy): LimitResult {
  const now = Date.now()
  const windowMs = p.windowSeconds * 1000
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  hits.push(now)
  buckets.set(key, hits)
  const resetSeconds = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000))
  return { allowed: hits.length <= p.limit, limit: p.limit, remaining: Math.max(0, p.limit - hits.length), resetSeconds, policy: p }
}

let warnedFallback = false

async function hit(key: string, p: Policy): Promise<LimitResult> {
  const { data, error } = await serviceClient().rpc("hit_rate_limit", {
    p_key: key,
    p_limit: p.limit,
    p_window_seconds: p.windowSeconds,
  })
  const row = Array.isArray(data) ? data[0] : null
  if (error || !row) {
    if (!warnedFallback) {
      console.warn(`[rate-limit] database limiter unavailable (${error?.message ?? "no result"}); using in-memory limits`)
      warnedFallback = true
    }
    return memoryHit(key, p)
  }
  return { allowed: row.allowed, limit: p.limit, remaining: row.remaining, resetSeconds: row.reset_seconds, policy: p }
}

/**
 * Counts one request against every policy for `name` and returns the most restrictive result:
 * the first one that blocks, otherwise the one with the least remaining.
 */
export async function checkRateLimit(headers: Headers, name: PolicyName): Promise<LimitResult> {
  const results = await Promise.all(
    RATE_LIMITS[name].map((p) => hit(`${p.name}:${p.scope === "network" ? networkHash(headers) : visitorHash(headers)}`, p)),
  )
  return results.find((r) => !r.allowed) ?? results.reduce((a, b) => (b.remaining < a.remaining ? b : a))
}

/** IETF RateLimit header fields (draft-ietf-httpapi-ratelimit-headers), widely understood by clients. */
export function rateLimitHeaders(r: LimitResult): Record<string, string> {
  const h: Record<string, string> = {
    "RateLimit-Limit": String(r.limit),
    "RateLimit-Remaining": String(r.remaining),
    "RateLimit-Reset": String(r.resetSeconds),
    "RateLimit-Policy": `${r.limit};w=${r.policy.windowSeconds}`,
  }
  if (!r.allowed) h["Retry-After"] = String(r.resetSeconds)
  return h
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response> | Response

/**
 * Wraps a route handler: rejects with 429 once the caller is over the limit, and adds
 * RateLimit-* headers to every response it lets through.
 */
export function withRateLimit<C>(name: PolicyName, handler: Handler<C>): (req: Request, ctx: C) => Promise<Response> {
  return async (req, ctx) => {
    const result = await checkRateLimit(req.headers, name)
    const headers = rateLimitHeaders(result)
    if (!result.allowed) {
      return Response.json({ error: result.policy.message }, { status: 429, headers })
    }
    const res = await handler(req, ctx)
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v)
    return res
  }
}
