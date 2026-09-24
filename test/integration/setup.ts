import { afterAll, beforeEach } from "vitest"
import { external } from "./helpers"

// Integration tests talk to the real local stack started with `pnpm supabase:up`.
process.loadEnvFile(".env")
// A separate salt keeps test visitors' votes and rate limits apart from real local use.
process.env.VOTER_SALT = "integration-tests"

const realFetch = globalThis.fetch.bind(globalThis)

// Only third-party services are faked (OSRM routing, Nominatim search), so tests are fast and
// deterministic. Everything else (PostgREST, GoTrue, Postgres) is real.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.startsWith("https://router.project-osrm.org/")) return external.osrm(url)
  if (url.startsWith("https://nominatim.openstreetmap.org/")) return external.nominatim(url)
  return realFetch(input, init)
}) as typeof fetch

beforeEach(() => external.reset())
afterAll(async () => {
  const { cleanup } = await import("./helpers")
  await cleanup()
})
