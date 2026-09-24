# Deathspot UG

**A community-led “Waze for danger” in Uganda.** Anyone can pin a place where people have been attacked or killed, others confirm whether it is still dangerous, and everyone can check their route and get warned when they get close.

Uganda Police recorded 4,328 murders in 2025, about 11 a day. After Moses Matovu was killed less than two minutes from CID Headquarters in September 2026, [@TonyNatif listed hotspots](https://x.com/TonyNatif/status/2102998432218534245) that need patrols and added, “People will add more spots.” This app gives people a place to do that.

## Features

- **Live danger map** (Leaflet + OpenStreetMap). Pins are coloured by severity and cluster at low zoom. A heatmap view is also available.
- **Report in two taps.** Tap *Report*, drop a pin (or use your GPS), and pick what happened. No account needed.
- **Community verification, Waze style.** Voters answer “Still dangerous” or “Not anymore”. Three net confirmations mark a spot **community confirmed**; enough denials mark it **disputed**. There is one vote per anonymous visitor, and votes can be changed.
- **Route check.** Enter from and to and see every reported spot within 150 m of each route. Alternatives are ranked safest first.
- **Nearby alerts.** Turn on the bell and the phone vibrates with a warning within 300 m of a danger spot.
- **Share to warn others.** Each spot has a deep link (`/?spot=12`) for WhatsApp.
- **SOS** quick-dial: 999, 112, the National Emergency Call Centre, and police WhatsApp.
- Insights panel, filters (category, verified, night-only, recency), dark mode, and a mobile-first layout.

## Stack

Next.js 16 (App Router) · shadcn/ui (Radix) · Tailwind v4 · Leaflet / react-leaflet · SQLite via Node's built-in `node:sqlite` · zod

## Run it

Requires Node ≥ 22.13 (for `node:sqlite`) and pnpm.

```bash
pnpm install
cp .env.example .env.local   # optional
pnpm dev
```

Open http://localhost:3000. On first start the database (`data/deathspot.db`) is created and seeded from `data/seed.json`. Run `pnpm db:reset` to start fresh.

## Data

| File | Purpose |
| --- | --- |
| `data/seed.json` | Human-editable starting spots with sources. **Add well-sourced spots here via pull request.** |
| `data/deathspot.db` | Live SQLite DB with community reports and votes (git-ignored). |

API:

| Method | Route | |
| --- | --- | --- |
| GET | `/api/spots?category=&since=` | List spots |
| POST | `/api/spots` | Report a spot (validated, must be inside Uganda, rate-limited to 5/hour) |
| POST | `/api/spots/:id/vote` | `{ "value": 1 \| -1 }` |
| GET | `/api/route?from=lat,lng&to=lat,lng` | Routes with danger spots along each |
| GET | `/api/geocode?q=` | Place search (Nominatim, Uganda only) |
| GET | `/api/stats` | Aggregates for the insights panel |

## Privacy & safety rules

- **Places, not people.** The UI asks reporters not to name anyone, and phone numbers are stripped server-side.
- There are no accounts. Voters are identified only by a salted hash of IP + user agent, used to allow one vote per spot and to rate-limit.
- Seed pins mark *approximate areas* from public reports, not exact addresses.
- Reports are community submitted and can be wrong. The app is a warning system, not evidence. Always report crimes to the police.

## Deploying

SQLite needs a **persistent, writable disk**, so use a VPS, Railway, Render, or Fly.io with a volume, and set `DATABASE_PATH` to the volume. Serverless hosts such as Vercel will not persist writes. Also set `VOTER_SALT` and `NOMINATIM_USER_AGENT`. For significant traffic, use your own tile server or provider (`NEXT_PUBLIC_TILE_URL`) and routing instance, in line with the OSM, Nominatim, and OSRM usage policies.

## Sources for the seed data

- [@TonyNatif on X](https://x.com/TonyNatif/status/2102998432218534245) (Sept 2026)
- [AllAfrica: Crime Report 2025, 25 Ugandans killed daily](https://allafrica.com/stories/202603310303.html)
- [UG Mirror: police name Kampala Metropolitan hotspots](https://ugmirror.com/index.php/2026/02/17/crime-wave-rocks-kampala-metropolitan-area-as-police-name-hotspots-arrest-over-250-suspects/)
- [AllAfrica: police crackdown on Kampala hotspots](https://allafrica.com/stories/202601130514.html)
- [The Observer: police report unmasks Uganda's top crimes](https://observer.ug/news/police-report-unmasks-ugandas-7-top-crimes/)

Map data © OpenStreetMap contributors.
