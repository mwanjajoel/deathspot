import { NextRequest } from "next/server"
import { CATEGORY_KEYS, type Category } from "@/lib/categories"
import { createSpot, listSpots } from "@/lib/db"
import { rateLimit, voterHash } from "@/lib/rate-limit"
import { newSpotSchema } from "@/lib/validation"

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const category = sp.get("category")
  const since = Number(sp.get("since"))
  const spots = listSpots({
    category: CATEGORY_KEYS.includes(category as Category) ? (category as Category) : undefined,
    sinceDays: since > 0 ? since : undefined,
  })
  return Response.json({ spots })
}

export async function POST(req: Request) {
  const hash = voterHash(req)
  if (!rateLimit(`report:${hash}`, 5, 60 * 60 * 1000)) {
    return Response.json(
      { error: "You have reported a lot of spots recently. Please try again in an hour." },
      { status: 429 },
    )
  }
  const body = await req.json().catch(() => null)
  const parsed = newSpotSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid report", issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const spot = createSpot(parsed.data, hash)
  return Response.json({ spot }, { status: 201 })
}
