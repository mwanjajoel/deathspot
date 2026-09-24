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
  seeded: boolean
}

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

export const EMERGENCY_CONTACTS: { label: string; number: string; href?: string }[] = [
  { label: "Police / emergency", number: "999" },
  { label: "Emergency from mobile", number: "112" },
  { label: "National Emergency Call Centre", number: "0800199399" },
  { label: "Police WhatsApp", number: "0779999999", href: "https://wa.me/256779999999" },
]
