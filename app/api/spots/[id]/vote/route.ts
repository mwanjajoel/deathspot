import { vote } from "@/lib/db"
import { voterHash, withRateLimit } from "@/lib/rate-limit"
import { voteSchema } from "@/lib/validation"

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRateLimit("vote", async (req: Request, { params }: Ctx) => {
  const id = Number((await params).id)
  if (!Number.isInteger(id)) return Response.json({ error: "Bad id" }, { status: 400 })

  const parsed = voteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Vote must be 1 or -1" }, { status: 400 })

  const result = await vote(id, voterHash(req), parsed.data.value)
  if (!result.ok) {
    return result.reason === "not_found"
      ? Response.json({ error: "Spot not found" }, { status: 404 })
      : Response.json({ error: "You already voted this way on this spot" }, { status: 409 })
  }
  return Response.json({ spot: result.spot })
})
