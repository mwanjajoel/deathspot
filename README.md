# Deathspot UG

**A community-led “Waze for danger” in Uganda.** Anyone can pin a place where people have been attacked or killed, others confirm whether it is still dangerous, volunteer moderators keep the map honest, and everyone can check their route and get warned when they get close.

Uganda Police recorded 4,328 murders in 2025, about 11 a day. After Moses Matovu was killed less than two minutes from CID Headquarters in September 2026, [@TonyNatif listed hotspots](https://x.com/TonyNatif/status/2102998432218534245) that need patrols and added, “People will add more spots.” This app gives people a place to do that.

## Features

**Public map** (mobile-first):
- Danger pins coloured by severity. They cluster at low zoom, and a heatmap view is also available.
- **Report in two taps**: drop a pin or use GPS, then pick what happened. No account needed.
- **Waze-style verification**: voters answer “Still dangerous” or “Not anymore”. Three net confirmations mark a spot *community confirmed*.
- **Report a problem**: flag a pin that's wrong, a duplicate, abusive, or names a person. Enough flags hide it until a moderator reviews it.
- **Route check**: every reported spot within 150 m of your route, with alternatives ranked safest first.
- **Nearby alerts** within 300 m, **SOS** quick-dial, share links for WhatsApp, insights, filters, and dark mode.

**Moderation panel** at `/admin`, with a bottom tab bar on phones:
- **Queue**: pending reports and flagged spots, with the public's flag reasons. Actions are approve, hide/reject, keep & dismiss flags, verify, edit, and delete.
- **Edit** any spot, including dragging its pin on a map.
- **All spots**: search and filter by status and category.
- **Activity log**: who did what, when, and why.
- **Settings** (admins): hold new reports for review or publish instantly, set the auto-hide flag threshold, and manage the team (add moderators or admins, change roles, remove access).

## Architecture

```
            ┌─────────── docker compose ───────────────────────────────────────┐
 browser ──▶│ caddy (https, optional) ──▶ app (Next.js 16, shadcn/ui, Leaflet) │
            │                                   │ supabase-js (server only)    │
            │                                   ▼                              │
            │           api-gw (Envoy) ──▶ auth (GoTrue) · rest (PostgREST)    │
            │               │                        │                         │
            │               └──▶ studio + meta       ▼                         │
            │                                  db (supabase/postgres 17)       │
            └──────────────────────────────────────────────────────────────────┘
```

- **Self-hosted Supabase**, following the [official docker setup](https://github.com/supabase/supabase/tree/master/docker) with the same images, trimmed to what the app uses. Realtime, storage, edge functions and the pooler are left out; add them from upstream if you need them.
- The browser never talks to Supabase directly. Next.js API routes validate input, rate-limit, and hash the visitor id, then call Postgres functions.
- **Row-level security** everywhere:
  - The anon role can read only *approved* spots and their public columns.
  - Moderator actions run as the signed-in moderator's JWT through security-definer functions that check `is_moderator()` / `is_admin()` and write the audit log.
- On startup the app applies `supabase/migrations/*.sql`, seeds `data/seed.json` once, and creates the first admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (see `lib/bootstrap.ts`).

## Deploy on a VPS

Requirements: a Linux VPS with 2 GB+ RAM, Docker with the compose plugin, Node 20+ (only to generate secrets), and a domain pointed at the server.

```bash
git clone <this repo> deathspot && cd deathspot
node scripts/setup-env.mjs          # writes .env with fresh secrets; prints the admin + Studio logins
```

Edit `.env`:

| Variable | Set to |
| --- | --- |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Your first admin login. Change the password after signing in. |
| `APP_DOMAIN`, `SUPABASE_DOMAIN`, `ACME_EMAIL` | e.g. `deathspot.ug`, `supabase.deathspot.ug`, your email |
| `SITE_URL` | `https://$APP_DOMAIN` |
| `SUPABASE_PUBLIC_URL` / `API_EXTERNAL_URL` | `https://$SUPABASE_DOMAIN` and `https://$SUPABASE_DOMAIN/auth/v1` |
| `APP_BIND` | `127.0.0.1`, so only Caddy can reach the app |
| `NOMINATIM_USER_AGENT` | Your site and contact email (required by OSM policy) |

Then start everything with automatic HTTPS:

```bash
docker compose --profile https up -d --build
docker compose logs -f app          # wait for "[bootstrap] ready"
```

- The map is at `https://APP_DOMAIN`, and moderators sign in at `https://APP_DOMAIN/admin`.
- The Supabase Studio dashboard is at `https://SUPABASE_DOMAIN` (basic auth: `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`).

Firewall: open only 22, 80, and 443. Postgres (55432) and the gateway (8000) are bound to localhost.

**Behind Cloudflare or another proxy?** The app reads `CF-Connecting-IP`, then `X-Forwarded-For`, to tell visitors apart for voting and rate limits. Don't expose port 3000 directly to the internet, because clients could spoof those headers.

### Operations

```bash
docker compose ps                                   # health of every service
docker compose pull && docker compose up -d --build # update images and app
docker compose exec db pg_dump -U postgres -d postgres -Fc > backup-$(date +%F).dump   # backup
docker compose exec -T db pg_restore -U postgres -d postgres --clean < backup.dump      # restore
```

- **Database schema changes:** add a new numbered file in `supabase/migrations/`. It is applied once on the next start.
- **Changing secrets:** rotating `JWT_SECRET` requires regenerating `ANON_KEY` and `SERVICE_ROLE_KEY`. `node scripts/setup-env.mjs --force` does all of it, but only before your first deploy, because it also changes the database password.

## Local development

```bash
pnpm install
pnpm setup:env      # creates .env (once)
pnpm supabase:up    # db, auth, rest, gateway, studio in Docker
pnpm dev            # http://localhost:3000; migrates + seeds on start
```

- Admin panel: http://localhost:3000/admin (the login is printed by `setup:env` and stored in `.env`).
- Studio: http://localhost:8000.
- Full production-like run: `docker compose up -d --build`, with the app at `APP_PORT`.
- Reset all data: `docker compose down -v`.

## Data & API

| Path | Purpose |
| --- | --- |
| `data/seed.json` | Human-editable starting spots with sources. **Add well-sourced spots via pull request.** It is loaded into a fresh database once. |
| `supabase/migrations/` | Schema, RLS policies, and moderation functions |

| Method | Route | |
| --- | --- | --- |
| GET | `/api/spots?category=&since=` | Approved spots |
| POST | `/api/spots` | Report (validated, inside Uganda, 5/hour). Returns `pending: true` when approval is required. |
| POST | `/api/spots/:id/vote` | `{ "value": 1 \| -1 }` |
| POST | `/api/spots/:id/flag` | `{ "reason": "inaccurate" \| "names_person" \| "duplicate" \| "abusive" \| "resolved" \| "other", "note"? }` |
| GET | `/api/route?from=lat,lng&to=lat,lng` | Routes with the danger spots along each |
| GET | `/api/geocode?q=` | Place search (Nominatim, Uganda only) |
| GET | `/api/stats`, `/api/health` | Insights and health check |

## Privacy & safety rules

- **Places, not people.** The UI asks reporters not to name anyone, phone numbers are stripped server-side, and flags let the public report violations.
- There are no public accounts. Visitors are identified only by a salted hash of IP + user agent, used for one vote per spot and rate limits. Hashes are never exposed through the API.
- Moderation is accountable: every action is logged with the moderator and a reason.
- Seed pins mark *approximate areas* from public reports. Reports are community submitted and can be wrong; this is a warning system, not evidence. Always report crimes to the police.

## Sources for the seed data

- [@TonyNatif on X](https://x.com/TonyNatif/status/2102998432218534245) (Sept 2026)
- [AllAfrica: Crime Report 2025, 25 Ugandans killed daily](https://allafrica.com/stories/202603310303.html)
- [UG Mirror: police name Kampala Metropolitan hotspots](https://ugmirror.com/index.php/2026/02/17/crime-wave-rocks-kampala-metropolitan-area-as-police-name-hotspots-arrest-over-250-suspects/)
- [AllAfrica: police crackdown on Kampala hotspots](https://allafrica.com/stories/202601130514.html)
- [The Observer: police report unmasks Uganda's top crimes](https://observer.ug/news/police-report-unmasks-ugandas-7-top-crimes/)

Map data © OpenStreetMap contributors.
