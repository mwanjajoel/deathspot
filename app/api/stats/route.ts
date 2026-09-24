import { getStats } from "@/lib/db"

export async function GET() {
  return Response.json(getStats())
}
