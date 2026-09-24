"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireAdmin, requireModerator, type LogEntry, type Moderator, type Role } from "@/lib/admin"
import { CATEGORY_KEYS, TIMES_OF_DAY } from "@/lib/categories"
import { inUganda } from "@/lib/geo"
import { checkRateLimit } from "@/lib/rate-limit"
import { serviceClient, userClient } from "@/lib/supabase/server"

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string }

const done = (message?: string): ActionResult => {
  revalidatePath("/admin", "layout")
  return { ok: true, message }
}
const failed = (error: string): ActionResult => ({ ok: false, error })

// ---------------------------------------------------------------- auth

export async function signIn(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim()
  const password = String(form.get("password") ?? "")
  if (!email || !password) return failed("Enter your email and password")

  // Brute-force protection: every attempt counts, per network, before the password is checked.
  const limit = await checkRateLimit(await headers(), "login")
  if (!limit.allowed) return failed(limit.policy.message)

  const supabase = await userClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return failed(error.message === "Invalid login credentials" ? "Wrong email or password" : error.message)
  const role = data.user.app_metadata?.role
  if (role !== "admin" && role !== "moderator") {
    await supabase.auth.signOut()
    return failed("This account doesn't have moderator access")
  }
  const next = String(form.get("next") ?? "")
  redirect(next.startsWith("/admin") && !next.startsWith("/admin/login") ? next : "/admin")
}

export async function signOut() {
  const supabase = await userClient()
  await supabase.auth.signOut()
  redirect("/admin/login")
}

export async function changePassword(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireModerator()
  const password = String(form.get("password") ?? "")
  if (password.length < 10) return failed("Use at least 10 characters")
  if (password !== form.get("confirm")) return failed("Passwords don't match")
  const supabase = await userClient()
  const { error } = await supabase.auth.updateUser({ password })
  return error ? failed(error.message) : { ok: true, message: "Password updated" }
}

// ---------------------------------------------------------------- moderation

const MODERATION_ACTIONS = ["approve", "reject", "verify", "unverify", "dismiss_flags"] as const
export type ModerationAction = (typeof MODERATION_ACTIONS)[number]

const ACTION_MESSAGES: Record<ModerationAction, string> = {
  approve: "Approved: now visible on the map",
  reject: "Rejected: hidden from the map",
  verify: "Marked as verified by moderators",
  unverify: "Verification removed",
  dismiss_flags: "Flags dismissed",
}

export async function moderate(id: number, action: ModerationAction, note?: string): Promise<ActionResult> {
  await requireModerator()
  if (!MODERATION_ACTIONS.includes(action)) return failed("Unknown action")
  const supabase = await userClient()
  const { error } = await supabase.rpc("moderate_spot", { p_spot: id, p_action: action, p_note: note ?? null })
  return error ? failed(error.message) : done(ACTION_MESSAGES[action])
}

const editSchema = z
  .object({
    title: z.string().trim().min(3, "Title needs at least 3 characters").max(80),
    description: z.string().trim().max(600),
    area: z.string().trim().max(80),
    category: z.enum(CATEGORY_KEYS as [string, ...string[]]),
    severity: z.number().int().min(1).max(5),
    time_of_day: z.enum(Object.keys(TIMES_OF_DAY) as [string, ...string[]]),
    lat: z.number().finite(),
    lng: z.number().finite(),
    incident_date: z.iso.date().or(z.literal("")).nullable(),
    source_url: z.url({ protocol: /^https?$/, message: "Source must be an http(s) link" }).max(300).or(z.literal("")).nullable(),
    note: z.string().max(300).optional(),
  })
  .refine(inUganda, { message: "Location must be inside Uganda" })

export type SpotEdit = z.input<typeof editSchema>

export async function updateSpot(id: number, input: SpotEdit): Promise<ActionResult> {
  await requireModerator()
  const parsed = editSchema.safeParse(input)
  if (!parsed.success) return failed(parsed.error.issues[0].message)
  const { note, ...patch } = parsed.data
  const supabase = await userClient()
  const { error } = await supabase.rpc("admin_update_spot", { p_spot: id, p: patch, p_note: note ?? null })
  return error ? failed(error.message) : done("Changes saved")
}

export async function deleteSpot(id: number, note?: string): Promise<ActionResult> {
  await requireModerator()
  const supabase = await userClient()
  const { error } = await supabase.rpc("admin_delete_spot", { p_spot: id, p_note: note ?? null })
  return error ? failed(error.message) : done("Spot deleted")
}

export async function getSpotHistory(id: number): Promise<LogEntry[]> {
  await requireModerator()
  const supabase = await userClient()
  const { data, error } = await supabase
    .from("moderation_log")
    .select("id, spot_id, spot_title, actor_email, action, note, created_at")
    .eq("spot_id", id)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) throw new Error(error.message)
  return data as LogEntry[]
}

// ---------------------------------------------------------------- settings (admins)

export async function saveSettings(input: { requireApproval: boolean; autoHideThreshold: number }): Promise<ActionResult> {
  await requireAdmin()
  const threshold = Math.round(input.autoHideThreshold)
  if (!(threshold >= 0 && threshold <= 50)) return failed("Threshold must be between 0 and 50")
  const supabase = await userClient()
  for (const [key, value] of [
    ["require_approval", input.requireApproval],
    ["auto_hide_flag_threshold", threshold],
  ] as const) {
    const { error } = await supabase.rpc("admin_set_setting", { p_key: key, p_value: value })
    if (error) return failed(error.message)
  }
  return done("Settings saved")
}

// ---------------------------------------------------------------- team (admins)

export type TeamMember = { id: string; email: string; role: Role; lastSignIn: string | null; createdAt: string }

export async function listTeam(): Promise<TeamMember[]> {
  await requireAdmin()
  const { data, error } = await serviceClient().auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(error.message)
  return data.users
    .filter((u) => u.app_metadata?.role === "admin" || u.app_metadata?.role === "moderator")
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      role: u.app_metadata.role as Role,
      lastSignIn: u.last_sign_in_at ?? null,
      createdAt: u.created_at,
    }))
    .sort((a, b) => a.email.localeCompare(b.email))
}

const memberSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(10, "Temporary password needs at least 10 characters"),
  role: z.enum(["admin", "moderator"]),
})

export async function addMember(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const me = await requireAdmin()
  const parsed = memberSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return failed(parsed.error.issues[0].message)
  const { email, password, role } = parsed.data
  const { error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
  })
  if (error) return failed(error.message)
  await logTeamChange(me, `added ${email} as ${role}`)
  return done(`${email} can now sign in at /admin`)
}

export async function setMemberRole(id: string, role: Role | "none"): Promise<ActionResult> {
  const me = await requireAdmin()
  if (id === me.id) return failed("You can't change your own role")
  const svc = serviceClient()
  if (role === "none") {
    const { data } = await svc.auth.admin.getUserById(id)
    // Deleting the user also invalidates their refresh tokens, revoking access right away.
    const { error } = await svc.auth.admin.deleteUser(id)
    if (error) return failed(error.message)
    await logTeamChange(me, `removed ${data.user?.email ?? id}`)
    return done("Access removed")
  }
  const { data, error } = await svc.auth.admin.updateUserById(id, { app_metadata: { role } })
  if (error) return failed(error.message)
  await logTeamChange(me, `set ${data.user.email} to ${role}`)
  return done("Role updated")
}

async function logTeamChange(me: Moderator, note: string) {
  await serviceClient().from("moderation_log").insert({ actor: me.id, actor_email: me.email, action: "team", note })
}
