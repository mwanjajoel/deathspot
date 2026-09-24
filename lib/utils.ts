export { cn } from "cn"

export function timeAgo(iso: string | null) {
  if (!iso) return "never"
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "just now"
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [604800, "week"],
    [2629800, "month"],
    [31557600, "year"],
  ]
  let [div, name] = units[0]
  for (const u of units) if (s >= u[0]) [div, name] = u
  const n = Math.floor(s / div)
  return `${n} ${name}${n === 1 ? "" : "s"} ago`
}

export function formatDuration(seconds: number) {
  const m = Math.round(seconds / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}
