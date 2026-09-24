import { getStats } from "@/lib/db"
import { withRateLimit } from "@/lib/rate-limit"

export const GET = withRateLimit("read", async () =>
  Response.json(await getStats(), { headers: { "Cache-Control": "no-store" } }),
)
