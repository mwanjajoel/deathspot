import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

let user: unknown = null
let cookiesToSet: { name: string; value: string; options: object }[] = []
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: { getAll: () => unknown; setAll: (c: unknown[]) => void } }) => ({
    auth: {
      getUser: async () => {
        opts.cookies.getAll()
        if (cookiesToSet.length) opts.cookies.setAll(cookiesToSet)
        return { data: { user } }
      },
    },
  }),
}))

const { proxy, config } = await import("@/proxy")

beforeEach(() => {
  user = null
  cookiesToSet = []
})

describe("proxy", () => {
  it("only runs on /admin", () => expect(config.matcher).toEqual(["/admin/:path*"]))

  it("sends signed-out visitors to the login page, remembering where they were going", async () => {
    const res = await proxy(new NextRequest("http://localhost/admin/spots"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost/admin/login?next=%2Fadmin%2Fspots")
  })

  it("lets signed-out visitors see the login page", async () => {
    const res = await proxy(new NextRequest("http://localhost/admin/login"))
    expect(res.headers.get("location")).toBeNull()
  })

  it("passes signed-in users through and forwards refreshed session cookies", async () => {
    user = { id: "u1" }
    cookiesToSet = [{ name: "sb-localhost-auth-token", value: "fresh", options: { path: "/" } }]
    const res = await proxy(new NextRequest("http://localhost/admin"))
    expect(res.headers.get("location")).toBeNull()
    expect(res.cookies.get("sb-localhost-auth-token")?.value).toBe("fresh")
  })
})
