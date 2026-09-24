import { getMyVotes, getPublicSettings } from "@/lib/db"
import { voterHash, withRateLimit } from "@/lib/rate-limit"

/** This anonymous visitor's votes, plus public settings the UI needs. */
export const GET = withRateLimit("read", async (req: Request) => {
  const [votes, settings] = await Promise.all([getMyVotes(voterHash(req)), getPublicSettings()])
  return Response.json({ votes, ...settings }, { headers: { "Cache-Control": "no-store" } })
})
