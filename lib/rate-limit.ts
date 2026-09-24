import { createHash } from "node:crypto"

const SALT = process.env.VOTER_SALT ?? "deathspot-ug-dev-salt"

/** Anonymous, non-reversible id for a visitor: no accounts, and no raw IPs are stored. */
export function voterHash(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "local"
  const ua = req.headers.get("user-agent") ?? ""
  return createHash("sha256").update(`${SALT}|${ip}|${ua}`).digest("hex").slice(0, 32)
}

const buckets = new Map<string, number[]>()

/** Sliding-window limiter; returns false once `limit` hits are reached within `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (hits.length >= limit) {
    buckets.set(key, hits)
    return false
  }
  hits.push(now)
  buckets.set(key, hits)
  return true
}
