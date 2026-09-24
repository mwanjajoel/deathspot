import { flagSpot } from "@/lib/db"
import { voterHash, withRateLimit } from "@/lib/rate-limit"
import { flagSchema } from "@/lib/validation"

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRateLimit("flag", async (req: Request, { params }: Ctx) => {
  const id = Number((await params).id)
  if (!Number.isInteger(id)) return Response.json({ error: "Bad id" }, { status: 400 })

  const parsed = flagSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Choose a reason" }, { status: 400 })

  const result = await flagSpot(id, voterHash(req), parsed.data.reason, parsed.data.note)
  switch (result) {
    case "not_found":
      return Response.json({ error: "Spot not found" }, { status: 404 })
    case "already_flagged":
      return Response.json({ error: "You already reported this spot" }, { status: 409 })
    default:
      return Response.json({ result })
  }
})
