import { flagSpot } from "@/lib/db"
import { rateLimit, voterHash } from "@/lib/rate-limit"
import { flagSchema } from "@/lib/validation"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id)) return Response.json({ error: "Bad id" }, { status: 400 })

  const hash = voterHash(req)
  if (!rateLimit(`flag:${hash}`, 20, 60 * 60 * 1000)) {
    return Response.json({ error: "Too many reports. Try again later." }, { status: 429 })
  }
  const parsed = flagSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Choose a reason" }, { status: 400 })

  const result = await flagSpot(id, hash, parsed.data.reason, parsed.data.note)
  switch (result) {
    case "not_found":
      return Response.json({ error: "Spot not found" }, { status: 404 })
    case "already_flagged":
      return Response.json({ error: "You already reported this spot" }, { status: 409 })
    default:
      return Response.json({ result })
  }
}
