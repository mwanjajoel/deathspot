import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg"],
  experimental: {
    serverActions: {
      // deathspot.org is served through a Cloudflare Worker (cloudflare/edge-proxy) that forwards
      // to the app's own host, so the browser's Origin differs from the host the app sees.
      allowedOrigins: ["deathspot.org"],
    },
  },
}

export default nextConfig
