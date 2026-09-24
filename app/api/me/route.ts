import { getMyVotes } from "@/lib/db"
import { voterHash } from "@/lib/rate-limit"

/** Returns this anonymous visitor's votes so the UI can show which way they voted. */
export async function GET(req: Request) {
  return Response.json({ votes: getMyVotes(voterHash(req)) })
}
