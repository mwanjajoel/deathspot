import { afterEach, describe, expect, it, vi } from "vitest"

const startup = vi.fn()
vi.mock("@/lib/bootstrap", () => ({ startup }))
const { register } = await import("@/instrumentation")

afterEach(() => {
  vi.unstubAllEnvs()
  startup.mockReset()
})

describe("register", () => {
  it("runs startup in the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    await register()
    expect(startup).toHaveBeenCalledOnce()
  })
  it("does nothing in the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge")
    await register()
    expect(startup).not.toHaveBeenCalled()
  })
})
