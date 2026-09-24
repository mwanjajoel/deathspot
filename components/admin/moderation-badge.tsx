import { BadgeCheckIcon, ClockIcon, EyeOffIcon, FlagIcon, GlobeIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { AdminSpot } from "@/lib/categories"

export function ModerationBadges({ spot }: { spot: AdminSpot }) {
  return (
    <>
      {spot.moderation === "pending" && (
        <Badge className="bg-amber-500 text-white">
          <ClockIcon /> Pending review
        </Badge>
      )}
      {spot.moderation === "approved" && (
        <Badge variant="outline" className="border-emerald-600 text-emerald-700 dark:text-emerald-400">
          <GlobeIcon /> Live
        </Badge>
      )}
      {spot.moderation === "rejected" && (
        <Badge variant="secondary">
          <EyeOffIcon /> Rejected
        </Badge>
      )}
      {spot.moderator_verified && (
        <Badge className="bg-blue-600 text-white">
          <BadgeCheckIcon /> Verified
        </Badge>
      )}
      {spot.flag_count > 0 && (
        <Badge variant="destructive">
          <FlagIcon /> {spot.flag_count} flag{spot.flag_count > 1 ? "s" : ""}
        </Badge>
      )}
    </>
  )
}
