# Contributing to Deathspot UG

Thank you for helping make Uganda's roads and neighbourhoods safer. You don't need to be a developer: reporting and confirming spots on [deathspot.org](https://deathspot.org), moderating, research, translation and design all count. The [README](README.md#how-you-can-contribute) explains each of those. This guide covers contributing through GitHub.

## Ground rules

- **Places, never people.** Don't name, describe or accuse anyone, in the app, in issues or in pull requests. This includes victims and their families.
- **Cite public sources** for seed data: a police statement, reputable news, or a court record.
- **Be kind.** Many contributors have lost someone to the violence this project maps.

## Finding something to work on

- The [roadmap board](https://github.com/users/mwanjajoel/projects/6) and [`roadmap` issues](https://github.com/mwanjajoel/deathspot/issues?q=is%3Aopen+label%3Aroadmap) list planned work, grouped by area.
- [`good first issue`](https://github.com/mwanjajoel/deathspot/issues?q=is%3Aopen+label%3A%22good+first+issue%22) and [`help wanted`](https://github.com/mwanjajoel/deathspot/issues?q=is%3Aopen+label%3A%22help+wanted%22) are good places to start.
- Comment on an issue before you start, so two people don't build the same thing. For anything big, agree on the approach in the issue first.

## Development setup

You need Node 20.9+, pnpm and Docker. Full details are in [Getting started](README.md#getting-started).

```bash
pnpm install
pnpm setup:env      # writes .env with fresh local secrets
pnpm supabase:up    # Postgres, Auth, PostgREST, Studio in Docker
pnpm dev            # http://localhost:3000
```

The admin panel is at `/admin`. `pnpm setup:env` prints the first admin login.

## Making a change

1. Fork the repo and create a branch from **`develop`**: `feat/…`, `fix/…` or `docs/…`.
2. Keep the change focused and match the style of the surrounding code.
3. Run the checks. Coverage of server code must stay at 100%:

   ```bash
   pnpm lint && npx tsc --noEmit && pnpm test:coverage && pnpm build
   ```

   Integration tests run against the local Supabase stack (`pnpm supabase:up`).
4. **Test on a phone-sized screen.** Most people use Deathspot on a mid-range Android phone over mobile data.
5. Open a pull request **into `develop`** and fill in the template.

### Project conventions

| Area | Rule |
| --- | --- |
| Database | New numbered file in [`supabase/migrations/`](supabase/migrations). Never edit a migration that has shipped. Every table needs row-level security. |
| API | Update [`developer-docs/src/api/openapi.yaml`](developer-docs/src/api/openapi.yaml) in the same PR; the API reference is generated from it. New endpoints need a rate limit policy in [`lib/rate-limit.ts`](lib/rate-limit.ts). |
| Rate limits | If you change `RATE_LIMITS`, update [the rate limits docs page](developer-docs/src/content/docs/rate-limits.mdx) too. |
| Privacy | No new cookies, trackers or third-party scripts without discussion in an issue. Never store raw IP addresses. |
| Seed data | Entries in [`data/seed.json`](data/seed.json) need an approximate location, category, severity and a public `source_url`. |
| Next.js | This project uses Next.js 16, which differs from older versions. Check `node_modules/next/dist/docs/` before relying on older patterns. |

## Docs

The developer docs at [docs.deathspot.org](https://docs.deathspot.org) live in [`developer-docs/`](developer-docs) (Nimbus/Astro): `pnpm docs:install && pnpm docs:dev`.

## Branches and deploys

| Branch | Purpose |
| --- | --- |
| `develop` | Integration branch. All pull requests go here. |
| `main` | Production. Every push deploys to [deathspot.org](https://deathspot.org) automatically. |

Maintainers review every pull request, then merge `develop` into `main` to release.

## Security

Please don't open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).

## Licence

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
