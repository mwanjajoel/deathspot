export const CATEGORIES = {
  murder: { label: "Killing", emoji: "💀", color: "#b91c1c" },
  mob_action: { label: "Mob action", emoji: "👥", color: "#c2410c" },
  boda_gang: { label: "Boda gang", emoji: "🏍️", color: "#9333ea" },
  robbery: { label: "Robbery / snatching", emoji: "👜", color: "#d97706" },
  stabbing: { label: "Stabbing / hacking", emoji: "🔪", color: "#be123c" },
  kidnapping: { label: "Kidnapping", emoji: "🚐", color: "#0e7490" },
  other: { label: "Other danger", emoji: "⚠️", color: "#475569" },
} as const

export type Category = keyof typeof CATEGORIES
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[]

export const TIMES_OF_DAY = {
  day: "Daytime",
  night: "Night",
  any: "Any time",
} as const
export type TimeOfDay = keyof typeof TIMES_OF_DAY

export type SpotStatus = "unverified" | "confirmed" | "disputed"

export const STATUS_LABEL: Record<SpotStatus, string> = {
  unverified: "Unverified",
  confirmed: "Community confirmed",
  disputed: "Disputed",
}

export type Spot = {
  id: number
  title: string
  description: string
  lat: number
  lng: number
  area: string
  category: Category
  severity: number
  time_of_day: TimeOfDay
  incident_date: string | null
  source_url: string | null
  created_at: string
  last_confirmed_at: string | null
  confirmations: number
  denials: number
  status: SpotStatus
  moderator_verified: boolean
  seeded: boolean
}

export type Moderation = "pending" | "approved" | "rejected"

/** What moderators see in addition to the public fields. */
export type AdminSpot = Spot & {
  moderation: Moderation
  flag_count: number
  updated_at: string
  moderated_at: string | null
  moderation_note: string | null
}

export const FLAG_REASONS = {
  inaccurate: "Wrong location or details",
  names_person: "Names or accuses a person",
  duplicate: "Duplicate of another spot",
  abusive: "Abusive or fake",
  resolved: "No longer dangerous",
  other: "Something else",
} as const
export type FlagReason = keyof typeof FLAG_REASONS

/** Severity 1–5 → marker colour, from amber up to deep red. */
export function severityColor(severity: number) {
  return ["#eab308", "#f59e0b", "#f97316", "#dc2626", "#7f1d1d"][
    Math.min(Math.max(severity, 1), 5) - 1
  ]
}

export function deriveStatus(confirmations: number, denials: number): SpotStatus {
  if (denials > confirmations + 2) return "disputed"
  if (confirmations - denials >= 3) return "confirmed"
  return "unverified"
}

export type EmergencyContact = { label: string; number: string; href: string }

/** Display the number as written; dial it with the phone's call app (tel: links). */
const contact = (label: string, number: string): EmergencyContact => ({
  label,
  number,
  href: `tel:${number.replace(/[^\d+]/g, "")}`,
})

export const EMERGENCY_CONTACTS: EmergencyContact[] = [
  contact("Police / emergency", "999"),
  contact("Emergency from mobile", "112"),
  contact("National Emergency Call Centre", "0800 199 399"),
  contact("Police WhatsApp line", "+256 779 999 999"),
]
