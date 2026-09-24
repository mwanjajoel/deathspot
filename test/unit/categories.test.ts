import { describe, expect, it } from "vitest"
import { CATEGORY_KEYS, deriveStatus, severityColor } from "@/lib/categories"

describe("severityColor", () => {
  it("maps 1–5 to distinct colours and clamps out-of-range values", () => {
    const colours = [1, 2, 3, 4, 5].map(severityColor)
    expect(new Set(colours).size).toBe(5)
    expect(severityColor(0)).toBe(colours[0])
    expect(severityColor(9)).toBe(colours[4])
  })
})

describe("deriveStatus", () => {
  it.each([
    [1, 0, "unverified"],
    [3, 0, "confirmed"],
    [5, 2, "confirmed"],
    [4, 2, "unverified"],
    [0, 3, "disputed"],
    [1, 3, "unverified"],
  ])("confirmations=%i denials=%i → %s", (c, d, status) => expect(deriveStatus(c, d)).toBe(status))
})

it("lists every category key", () => {
  expect(CATEGORY_KEYS).toEqual(["murder", "mob_action", "boda_gang", "robbery", "stabbing", "kidnapping", "other"])
})

describe("EMERGENCY_CONTACTS", () => {
  it("dials every number with the phone's call app", async () => {
    const { EMERGENCY_CONTACTS } = await import("@/lib/categories")
    for (const c of EMERGENCY_CONTACTS) expect(c.href).toMatch(/^tel:\+?\d+$/)
  })

  it("shows the police WhatsApp line in international format", async () => {
    const { EMERGENCY_CONTACTS } = await import("@/lib/categories")
    expect(EMERGENCY_CONTACTS.find((c) => c.label.includes("WhatsApp"))).toEqual({
      label: "Police WhatsApp line",
      number: "+256 779 999 999",
      href: "tel:+256779999999",
    })
    expect(EMERGENCY_CONTACTS.map((c) => c.href)).toEqual(["tel:999", "tel:112", "tel:0800199399", "tel:+256779999999"])
  })
})
