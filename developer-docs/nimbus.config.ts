import { defineConfig } from "@cloudflare/nimbus-docs/config";

// Shared by astro.config.ts and src/content.config.ts, so the OpenAPI spec is declared once.
export default defineConfig({
  // Canonical origin of the deployed docs (no trailing slash). Drives canonical URLs,
  // OG images, robots.txt, the sitemap and the links in /llms.txt.
  site: "https://docs.deathspot.org",
  title: "Deathspot UG Developers",
  description: "Build on the community-led danger map of Uganda: read spots, report new ones, confirm them and check routes.",
  locale: "en",
  github: "https://github.com/mwanjajoel/deathspot",
  editPattern: "https://github.com/mwanjajoel/deathspot/edit/main/developer-docs/{path}",
  socialImageAlt: "Deathspot UG developer documentation",
  sidebar: {
    items: [
      { label: "Get started", items: ["introduction", "quickstart"], icon: "ph:rocket-launch" },
      { label: "Guides", items: ["concepts", "errors-and-limits", "rate-limits", "recipes"], icon: "ph:book-open" },
      { label: "Contribute", items: ["contributing"], icon: "ph:git-pull-request" },
      // Mounts the generated OpenAPI reference (every tag, operation and schema) in the rail.
      { label: "API reference", autogenerate: { collection: "api" }, icon: "ph:code", collapsed: false },
    ],
  },
  api: [{ collection: "api", spec: "./src/api/openapi.yaml", label: "Deathspot UG API" }],
});
