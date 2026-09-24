import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import type { AdminSpot, FlagReason } from "./categories"
import { userClient } from "./supabase/server"

export type Role = "admin" | "moderator"
export type Moderator = { id: string; email: string; role: Role }

/** The signed-in moderator, or null. Verified against Supabase Auth (not just the cookie). */
export const getModerator = cache(async (): Promise<Moderator | null> => {
  const supabase = await userClient()
  const { data } = await supabase.auth.getUser()
  const role = data.user?.app_metadata?.role
  if (!data.user || (role !== "admin" && role !== "moderator")) return null
  return { id: data.user.id, email: data.user.email ?? "", role }
})

export async function requireModerator() {
  const mod = await getModerator()
  if (!mod) redirect("/admin/login")
  return mod
}

export async function requireAdmin() {
  const mod = await requireModerator()
  if (mod.role !== "admin") redirect("/admin")
  return mod
}

export const ADMIN_SPOT_COLUMNS =
  "id, title, description, lat, lng, area, category, severity, time_of_day, incident_date, source_url, created_at, updated_at, last_confirmed_at, confirmations, denials, status, moderator_verified, seeded, moderation, flag_count, moderated_at, moderation_note"

export type OpenFlag = { id: number; spot_id: number; reason: FlagReason; note: string; created_at: string }
export type QueueItem = AdminSpot & { flags: OpenFlag[] }

async function attachFlags(spots: AdminSpot[]): Promise<QueueItem[]> {
  if (!spots.length) return []
  const supabase = await userClient()
  const { data: flags, error } = await supabase
    .from("flags")
    .select("id, spot_id, reason, note, created_at")
    .in("spot_id", spots.map((s) => s.id))
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return spots.map((s) => ({ ...s, flags: (flags as OpenFlag[]).filter((f) => f.spot_id === s.id) }))
}

/** Pending reports and flagged public spots, most urgent first. */
export async function getQueue() {
  const supabase = await userClient()
  const { data, error } = await supabase
    .from("spots")
    .select(ADMIN_SPOT_COLUMNS)
    .or("moderation.eq.pending,and(moderation.eq.approved,flag_count.gt.0)")
    .order("flag_count", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(100)
  if (error) throw new Error(error.message)
  return attachFlags(data as unknown as AdminSpot[])
}

export async function getCounts() {
  const supabase = await userClient()
  const head = { count: "exact" as const, head: true }
  const since = new Date(Date.now() - 86400000).toISOString()
  const [pending, flagged, today, total] = await Promise.all([
    supabase.from("spots").select("id", head).eq("moderation", "pending"),
    supabase.from("spots").select("id", head).eq("moderation", "approved").gt("flag_count", 0),
    supabase.from("spots").select("id", head).gte("created_at", since).eq("seeded", false),
    supabase.from("spots").select("id", head).eq("moderation", "approved"),
  ])
  return {
    pending: pending.count ?? 0,
    flagged: flagged.count ?? 0,
    today: today.count ?? 0,
    live: total.count ?? 0,
  }
}

export const PAGE_SIZE = 20

export async function searchSpots(opts: { q?: string; moderation?: string; category?: string; page?: number }) {
  const supabase = await userClient()
  const page = Math.max(1, opts.page ?? 1)
  let query = supabase
    .from("spots")
    .select(ADMIN_SPOT_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (opts.moderation && opts.moderation !== "all") {
    query = opts.moderation === "flagged" ? query.gt("flag_count", 0) : query.eq("moderation", opts.moderation)
  }
  if (opts.category && opts.category !== "all") query = query.eq("category", opts.category)
  if (opts.q) {
    // Strip PostgREST filter syntax characters from free text.
    const term = opts.q.replace(/[,()*%]/g, " ").trim()
    if (term) query = query.or(`title.ilike.*${term}*,area.ilike.*${term}*,description.ilike.*${term}*`)
  }
  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return { spots: data as unknown as AdminSpot[], total: count ?? 0, page }
}

export type LogEntry = {
  id: number
  spot_id: number | null
  spot_title: string | null
  actor_email: string | null
  action: string
  note: string | null
  created_at: string
}

export async function getLog(limit = 100) {
  const supabase = await userClient()
  const { data, error } = await supabase
    .from("moderation_log")
    .select("id, spot_id, spot_title, actor_email, action, note, created_at")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data as LogEntry[]
}

export async function getSettings() {
  const supabase = await userClient()
  const { data, error } = await supabase.from("settings").select("key, value")
  if (error) throw new Error(error.message)
  const get = (k: string) => data.find((r) => r.key === k)?.value
  return {
    requireApproval: get("require_approval") === true,
    autoHideThreshold: Number(get("auto_hide_flag_threshold") ?? 3),
  }
}
