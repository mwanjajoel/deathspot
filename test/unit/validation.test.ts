import { describe, expect, it } from "vitest"
import { flagSchema, newSpotSchema, voteSchema } from "@/lib/validation"

const valid = {
  title: "Boda gang attacks",
  lat: 0.349,
  lng: 32.572,
  category: "boda_gang",
  severity: 4,
  time_of_day: "night",
}

describe("newSpotSchema", () => {
  it("accepts a minimal report and fills defaults", () => {
    const r = newSpotSchema.parse(valid)
    expect(r.description).toBe("")
    expect(r.area).toBe("")
  })

  it("strips phone numbers from free text", () => {
    const r = newSpotSchema.parse({
      ...valid,
      title: "Call 0772 123 456 now",
      description: "Ring +256701234567 or 0701-234-567",
      area: "Near 0772123456",
    })
    expect(r.title).toBe("Call [removed] now")
    expect(r.description).toBe("Ring [removed] or [removed]")
    expect(r.area).toBe("Near [removed]")
  })

  it("rejects locations outside Uganda on the lat path", () => {
    const r = newSpotSchema.safeParse({ ...valid, lat: -1.29, lng: 36.82 })
    expect(r.success).toBe(false)
    expect(r.error!.issues[0]).toMatchObject({ message: "Location must be inside Uganda", path: ["lat"] })
  })

  it.each([
    [{ title: "ab" }],
    [{ severity: 6 }],
    [{ severity: 2.5 }],
    [{ category: "theft" }],
    [{ time_of_day: "evening" }],
    [{ incident_date: "24/09/2026" }],
    [{ source_url: "ftp://example.com" }],
    [{ lat: Number.NaN }],
  ])("rejects invalid input %j", (patch) => expect(newSpotSchema.safeParse({ ...valid, ...patch }).success).toBe(false))

  it.each([[""], [null], ["https://www.monitor.co.ug/story"]])("accepts source_url %j", (source_url) =>
    expect(newSpotSchema.safeParse({ ...valid, source_url }).success).toBe(true),
  )
})

describe("voteSchema", () => {
  it("accepts only 1 and -1", () => {
    expect(voteSchema.safeParse({ value: 1 }).success).toBe(true)
    expect(voteSchema.safeParse({ value: -1 }).success).toBe(true)
    expect(voteSchema.safeParse({ value: 0 }).success).toBe(false)
  })
})

describe("flagSchema", () => {
  it("validates reasons and cleans the note", () => {
    expect(flagSchema.parse({ reason: "names_person", note: "His number is 0772123456" })).toEqual({
      reason: "names_person",
      note: "His number is [removed]",
    })
    expect(flagSchema.parse({ reason: "duplicate" }).note).toBe("")
    expect(flagSchema.safeParse({ reason: "spam" }).success).toBe(false)
  })
})
