import { describe, expect, it } from "vitest"
import { distanceToPolyline, formatDistance, haversine, inUganda, KAMPALA_CENTER, pointToSegment } from "@/lib/geo"

describe("inUganda", () => {
  it("accepts Kampala and rejects Nairobi", () => {
    expect(inUganda(KAMPALA_CENTER)).toBe(true)
    expect(inUganda({ lat: -1.29, lng: 36.82 })).toBe(false)
  })
  it.each([
    [{ lat: -1.7, lng: 32 }],
    [{ lat: 4.4, lng: 32 }],
    [{ lat: 1, lng: 29.4 }],
    [{ lat: 1, lng: 35.2 }],
  ])("rejects points outside each edge %#", (p) => expect(inUganda(p)).toBe(false))
})

describe("haversine", () => {
  it("is zero for the same point", () => expect(haversine(KAMPALA_CENTER, KAMPALA_CENTER)).toBe(0))
  it("measures Kalerwe → Nansana at roughly 5 km", () => {
    const d = haversine({ lat: 0.34918, lng: 32.57195 }, { lat: 0.36582, lng: 32.52923 })
    expect(d).toBeGreaterThan(4900)
    expect(d).toBeLessThan(5200)
  })
})

describe("pointToSegment", () => {
  const a = { lat: 0, lng: 32 }
  const b = { lat: 0, lng: 32.01 }
  it("is ~0 for a point on the segment", () => expect(pointToSegment({ lat: 0, lng: 32.005 }, a, b)).toBeLessThan(0.01))
  it("measures perpendicular distance", () => {
    expect(pointToSegment({ lat: 0.001, lng: 32.005 }, a, b)).toBeCloseTo(111.2, 0)
  })
  it("clamps to the nearest endpoint beyond the segment", () => {
    expect(pointToSegment({ lat: 0, lng: 31.99 }, a, b)).toBeCloseTo(haversine({ lat: 0, lng: 31.99 }, a), -1)
  })
  it("handles a zero-length segment", () => {
    expect(pointToSegment({ lat: 0.001, lng: 32 }, a, a)).toBeCloseTo(111.2, 0)
  })
})

describe("distanceToPolyline", () => {
  it("returns the closest distance and how far along the line it is", () => {
    const line = [
      { lat: 0, lng: 32 },
      { lat: 0, lng: 32.01 },
      { lat: 0, lng: 32.02 },
    ]
    const r = distanceToPolyline({ lat: 0.0005, lng: 32.015 }, line)
    expect(r.distance).toBeCloseTo(55.6, 0)
    expect(r.along).toBeCloseTo(haversine(line[0], line[1]), 0)
  })
})

describe("formatDistance", () => {
  it("uses metres below 1 km and km above", () => {
    expect(formatDistance(42.4)).toBe("42 m")
    expect(formatDistance(1530)).toBe("1.5 km")
  })
})
