import { CATEGORY_KEYS, type Category } from "@/lib/categories"
import { createSpot, listSpots } from "@/lib/db"
import { voterHash, withRateLimit } from "@/lib/rate-limit"
import { newSpotSchema } from "@/lib/validation"

export const GET = withRateLimit("read", async (req: Request) => {
  const sp = new URL(req.url).searchParams
  const category = sp.get("category")
  const since = Number(sp.get("since"))
  const spots = await listSpots({
    category: CATEGORY_KEYS.includes(category as Category) ? (category as Category) : undefined,
    sinceDays: since > 0 ? since : undefined,
  })
  return Response.json({ spots }, { headers: { "Cache-Control": "no-store" } })
})

export const POST = withRateLimit("report", async (req: Request) => {
  const body = await req.json().catch(() => null)
  const parsed = newSpotSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0].message, issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { spot, pending } = await createSpot(parsed.data, voterHash(req))
  return Response.json({ spot, pending }, { status: 201 })
})
