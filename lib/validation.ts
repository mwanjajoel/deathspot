import { z } from "zod"
import { CATEGORY_KEYS, TIMES_OF_DAY } from "./categories"
import { inUganda } from "./geo"

// Strip anything that looks like a phone number: reports describe places, not people.
const PHONE = /(\+?256|0)[\s-]?7\d{2}[\s-]?\d{3}[\s-]?\d{3}/g
const clean = (s: string) => s.replace(PHONE, "[removed]").trim()

export const newSpotSchema = z
  .object({
    title: z.string().min(3).max(80).transform(clean),
    description: z.string().max(600).default("").transform(clean),
    lat: z.number().finite(),
    lng: z.number().finite(),
    area: z.string().max(80).default("").transform(clean),
    category: z.enum(CATEGORY_KEYS as [string, ...string[]]),
    severity: z.number().int().min(1).max(5),
    time_of_day: z.enum(Object.keys(TIMES_OF_DAY) as [string, ...string[]]),
    incident_date: z.iso.date().nullish(),
    source_url: z.url({ protocol: /^https?$/ }).max(300).nullish().or(z.literal("")),
  })
  .refine((s) => inUganda(s), {
    message: "Location must be inside Uganda",
    path: ["lat"],
  })

export type NewSpot = z.infer<typeof newSpotSchema>

export const voteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1)]) })

export const flagSchema = z.object({
  reason: z.enum(["inaccurate", "names_person", "duplicate", "abusive", "resolved", "other"]),
  note: z.string().max(300).default("").transform(clean),
})
