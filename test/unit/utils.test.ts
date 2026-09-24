import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cn, formatDuration, timeAgo } from "@/lib/utils"

describe("cn", () => {
  it("merges Tailwind classes, later wins", () => expect(cn("p-2 text-sm", false && "hidden", "p-4")).toBe("text-sm p-4"))
})

describe("timeAgo", () => {
  const now = new Date("2026-09-24T12:00:00Z")
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })
  afterEach(() => vi.useRealTimers())
  const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString()

  it.each([
    [null, "never"],
    [ago(10), "just now"],
    [ago(-30), "just now"],
    [ago(60), "1 minute ago"],
    [ago(150), "2 minutes ago"],
    [ago(3600), "1 hour ago"],
    [ago(86400 * 3), "3 days ago"],
    [ago(604800 * 2), "2 weeks ago"],
    [ago(2629800 * 5), "5 months ago"],
    [ago(31557600 * 2), "2 years ago"],
  ])("%s → %s", (iso, text) => expect(timeAgo(iso)).toBe(text))
})

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(492)).toBe("8 min")
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe("3 h 5 min")
  })
})
