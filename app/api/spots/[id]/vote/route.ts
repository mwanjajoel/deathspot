import { vote } from "@/lib/db"
import { rateLimit, voterHash } from "@/lib/rate-limit"
import { voteSchema } from "@/lib/validation"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id)) return Response.json({ error: "Bad id" }, { status: 400 })

  const hash = voterHash(req)
  if (!rateLimit(`vote:${hash}`, 60, 60 * 60 * 1000)) {
    return Response.json({ error: "Too many votes. Slow down." }, { status: 429 })
  }
  const parsed = voteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Vote must be 1 or -1" }, { status: 400 })

  const result = vote(id, hash, parsed.data.value)
  if (!result.ok) {
    return result.reason === "not_found"
      ? Response.json({ error: "Spot not found" }, { status: 404 })
      : Response.json({ error: "You already voted this way on this spot" }, { status: 409 })
  }
  return Response.json({ spot: result.spot })
}
