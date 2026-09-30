// Serves deathspot.org from the app on InstaCloud. deathspot.org's DNS is on Cloudflare, and
// Cloudflare won't proxy a hostname to another Cloudflare customer (InstaCloud's edge), so this
// Worker forwards each request to the app's InstaCloud address instead.
//
// InstaCloud only sees Cloudflare's address, so the visitor's IP is passed in x-edge-client-ip,
// signed with EDGE_PROXY_SECRET (the app ignores the header without it; see lib/rate-limit.ts).

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = new URL(env.ORIGIN)
    const target = new URL(url.pathname + url.search, origin)

    const headers = new Headers(request.headers)
    headers.delete("host")
    headers.set("x-edge-client-ip", request.headers.get("cf-connecting-ip") ?? "")
    headers.set("x-edge-proxy-secret", env.EDGE_PROXY_SECRET)
    headers.set("x-forwarded-host", url.host)
    headers.set("x-forwarded-proto", url.protocol.replace(":", ""))

    const response = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    })

    // Keep redirects on deathspot.org rather than sending visitors to the InstaCloud address.
    const location = response.headers.get("location")
    if (location?.startsWith(origin.origin)) {
      const rewritten = new Response(response.body, response)
      rewritten.headers.set("location", url.origin + location.slice(origin.origin.length))
      return rewritten
    }
    return response
  },
}

export default worker
