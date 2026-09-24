import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("tiles", () => {
  it("defaults to OpenStreetMap", async () => {
    vi.stubEnv("NEXT_PUBLIC_TILE_URL", "")
    vi.stubEnv("NEXT_PUBLIC_TILE_ATTRIBUTION", "")
    const t = await import("@/lib/tiles")
    expect(t.TILE_URL).toContain("tile.openstreetmap.org")
    expect(t.TILE_ATTRIBUTION).toContain("OpenStreetMap")
  })

  it("uses a custom provider from the environment", async () => {
    vi.stubEnv("NEXT_PUBLIC_TILE_URL", "https://tiles.example/{z}/{x}/{y}.png")
    vi.stubEnv("NEXT_PUBLIC_TILE_ATTRIBUTION", "© Example")
    const t = await import("@/lib/tiles")
    expect(t.TILE_URL).toBe("https://tiles.example/{z}/{x}/{y}.png")
    expect(t.TILE_ATTRIBUTION).toBe("© Example")
  })
})
