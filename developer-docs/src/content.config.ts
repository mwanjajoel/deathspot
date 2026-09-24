import { defineCollection } from "astro:content";
// `z` re-exported from `astro:content` is deprecated; import it from
// `astro/zod` (the pattern nimbus-docs' own schema helpers document).
import { z } from "astro/zod";
import { apiCollection, docsCollection, partialsCollection } from "@cloudflare/nimbus-docs/content";
import nimbus from "../nimbus.config";

const apiConfig = nimbus.api?.find((entry) => entry.collection === "api");
if (!apiConfig) throw new Error('Missing the "api" entry in nimbus.config.ts');

export const collections = {
  docs: defineCollection(
    docsCollection({
      schemaFields: {
        // Nimbus docs are agent-friendly by default. Set `audience: human`
        // to flag a page that's written primarily for human readers.
        audience: z.literal("human").optional(),
      },
    }),
  ),
  partials: defineCollection(partialsCollection()),
  api: defineCollection(apiCollection(apiConfig)),
};
