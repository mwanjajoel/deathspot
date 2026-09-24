import "server-only"
import type { Category, Spot } from "./categories"
import { anonClient, serviceClient } from "./supabase/server"
import type { NewSpot } from "./validation"

/** Columns the anon role may read (see the column grant in 0001_init.sql). */
export const PUBLIC_COLUMNS =
  "id, title, description, lat, lng, area, category, severity, time_of_day, incident_date, source_url, created_at, last_confirmed_at, confirmations, denials, status, moderator_verified, seeded"

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`)
}

const toPublic = (s: Spot & Record<string, unknown>): Spot => {
  const out = {} as Record<string, unknown>
  for (const k of PUBLIC_COLUMNS.split(", ")) out[k] = s[k]
  return out as Spot
}

/** Approved spots only: RLS on the anon role enforces this, not just the query. */
export async function listSpots(filter: { category?: Category; sinceDays?: number } = {}) {
  let q = anonClient().from("spots").select(PUBLIC_COLUMNS).order("severity", { ascending: false }).order("id", { ascending: false })
  if (filter.category) q = q.eq("category", filter.category)
  if (filter.sinceDays) q = q.gte("created_at", new Date(Date.now() - filter.sinceDays * 86400000).toISOString())
  const { data, error } = await q
  if (error) fail("listSpots", error)
  return data as unknown as Spot[]
}

export async function createSpot(s: NewSpot, reporterHash: string) {
  const { data, error } = await serviceClient().rpc("report_spot", { p: s, p_reporter: reporterHash })
  if (error) fail("createSpot", error)
  const row = data as Spot & { moderation: string }
  return { spot: toPublic(row), pending: row.moderation !== "approved" }
}

export type VoteResult = { ok: true; spot: Spot } | { ok: false; reason: "not_found" | "already_voted" }

export async function vote(spotId: number, voterHash: string, value: 1 | -1): Promise<VoteResult> {
  const { data, error } = await serviceClient().rpc("cast_vote", { p_spot: spotId, p_voter: voterHash, p_value: value })
  if (error) {
    if (error.message.includes("already_voted")) return { ok: false, reason: "already_voted" }
    fail("vote", error)
  }
  const row = data as (Spot & Record<string, unknown>) | null
  return row?.id ? { ok: true, spot: toPublic(row) } : { ok: false, reason: "not_found" }
}

export type FlagResult = "flagged" | "hidden" | "not_found" | "already_flagged"

export async function flagSpot(spotId: number, voterHash: string, reason: string, note: string): Promise<FlagResult> {
  const { data, error } = await serviceClient().rpc("flag_spot", { p_spot: spotId, p_voter: voterHash, p_reason: reason, p_note: note })
  if (error) {
    if (error.message.includes("already_flagged")) return "already_flagged"
    fail("flagSpot", error)
  }
  return (data as "flagged" | "hidden" | null) ?? "not_found"
}

export async function getMyVotes(voterHash: string) {
  const { data, error } = await serviceClient().from("votes").select("spot_id, value").eq("voter_hash", voterHash)
  if (error) fail("getMyVotes", error)
  return Object.fromEntries(data.map((r) => [r.spot_id, r.value]))
}

export type Stats = {
  byCategory: { category: Category; count: number }[]
  byArea: { area: string; count: number; max_severity: number }[]
  totals: { total: number; confirmed: number; unverified: number; this_week: number }
}

export async function getStats() {
  const { data, error } = await anonClient().rpc("spot_stats")
  if (error) fail("getStats", error)
  return data as Stats
}

export async function getPublicSettings() {
  const { data, error } = await anonClient().from("settings").select("key, value").in("key", ["require_approval"])
  if (error) fail("getPublicSettings", error)
  return { requireApproval: data.find((r) => r.key === "require_approval")?.value === true }
}
