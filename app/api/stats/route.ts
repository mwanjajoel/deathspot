import { getStats } from "@/lib/db"

export async function GET() {
  return Response.json(await getStats(), { headers: { "Cache-Control": "no-store" } })
}
