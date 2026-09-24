import { describe, expect, it } from "vitest"
import { isCloudflareIp } from "@/lib/cloudflare"

describe("isCloudflareIp", () => {
  it("matches Cloudflare's IPv4 and IPv6 edge ranges", () => {
    expect(isCloudflareIp("172.70.1.2")).toBe(true)
    expect(isCloudflareIp("104.16.0.1")).toBe(true)
    expect(isCloudflareIp("2606:4700::6810:1")).toBe(true)
    expect(isCloudflareIp("2a06:98c7::1")).toBe(true)
  })

  it("rejects other addresses and non-addresses", () => {
    expect(isCloudflareIp("8.8.8.8")).toBe(false)
    expect(isCloudflareIp("2001:4860:4860::8888")).toBe(false)
    expect(isCloudflareIp("unknown")).toBe(false)
    expect(isCloudflareIp("")).toBe(false)
  })
})
