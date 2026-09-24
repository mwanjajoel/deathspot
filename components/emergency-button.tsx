"use client"

import { PhoneIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { EMERGENCY_CONTACTS } from "@/lib/categories"

export function EmergencyButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="lg" variant="destructive" className="h-12 rounded-full px-4 shadow-lg" aria-label="Emergency numbers">
          <PhoneIcon /> SOS
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="z-[1100] w-64">
        <div className="mb-2 text-sm font-semibold">In danger? Call now</div>
        <div className="flex flex-col gap-1.5">
          {EMERGENCY_CONTACTS.map((c) => (
            <a key={c.number} href={c.href ?? `tel:${c.number}`} className="flex items-center justify-between rounded-lg border p-2.5 text-sm hover:bg-accent">
              <span>{c.label}</span>
              <span className="font-mono font-semibold">{c.number}</span>
            </a>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
